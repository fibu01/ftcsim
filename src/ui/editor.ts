// Code pane (Monaco) and Driver Station panel: compile Java OpModes, pick Auto and TeleOp, INIT/START/STOP, telemetry.
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/java/register';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { Simulation, BuiltinOpMode } from '../sim/world';
import { compile, Compiled, JavaOpMode, OpModeInfo } from '../java/opmode';
import { JavaError } from '../java/lexer';
import { SAMPLES } from '../samples';
import { defaultTeleop } from '../opmode/defaultTeleop';
import { sampleAuto } from '../opmode/sampleAuto';

(self as any).MonacoEnvironment = { getWorker: () => new editorWorker() };

interface Tab { id: number; title: string; model: monaco.editor.ITextModel; compiled: Compiled | null; error: { msg: string; line: number } | null }

export class CodePane {
  private root: HTMLElement;
  editor: monaco.editor.IStandaloneCodeEditor;
  private tabs: Tab[] = [];
  private current: Tab | null = null;
  private nextId = 1;
  private decorations: string[] = [];
  private autoSel: HTMLSelectElement; private teleSel: HTMLSelectElement;
  private dsTel: HTMLElement; private dsState: HTMLElement; private problems: HTMLElement; private tabBar: HTMLElement;
  private selectedAuto = 'builtin'; private selectedTele = 'builtin';
  private lastErrorTab: Tab | null = null;

  constructor(private sim: Simulation, hud: HTMLElement) {
    this.root = document.createElement('div'); this.root.id = 'code'; this.root.className = 'panel'; this.root.hidden = true;
    this.root.innerHTML = `
      <div class="codebar">
        <div class="tabs" id="tabs"></div>
        <button id="newTab" title="New file">+</button>
        <select id="sampleSel"><option value="">Load sample…</option>${SAMPLES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
        <button id="compile" class="primary">Compile</button>
        <button id="closeCode" title="Close">×</button>
      </div>
      <div id="editor"></div>
      <div id="problems"></div>`;
    hud.appendChild(this.root);
    const ds = document.createElement('div'); ds.id = 'ds'; ds.className = 'panel';
    ds.innerHTML = `<h3>Driver Station</h3>
      <div class="dsrow"><label>Mode</label><select id="mode" title="What runs when you press START"><option value="teleop" selected>TeleOp only</option><option value="auto">Autonomous only (30 s)</option><option value="match">Full match (AUTO, transition, TELEOP)</option></select></div>
      <div class="dsrow"><label>Auto</label><select id="autoSel"></select></div>
      <div class="dsrow"><label>TeleOp</label><select id="teleSel"></select></div>
      <div class="dsrow"><button id="dsInit">INIT</button><button id="dsStart" class="primary">▶ START</button><button id="dsStop">■ STOP</button><span id="dsState" class="state">stopped</span></div>
      <pre id="dsTel"></pre>`;
    hud.appendChild(ds);
    const q = <T extends HTMLElement>(s: string) => (hud.querySelector(s) as T);
    this.autoSel = q('#autoSel'); this.teleSel = q('#teleSel'); this.dsTel = q('#dsTel'); this.dsState = q('#dsState'); this.problems = q('#problems'); this.tabBar = q('#tabs');
    q('#dsInit').onclick = () => { this.applySelection(); sim.initOpMode(); };
    q('#dsStart').onclick = () => { this.applySelection(); sim.run(); };
    q('#dsStop').onclick = () => sim.stop();
    (q('#mode') as HTMLSelectElement).onchange = e => { sim.mode = (e.target as HTMLSelectElement).value as 'teleop' | 'auto' | 'match'; sim.reset(); };
    this.autoSel.onchange = () => { this.selectedAuto = this.autoSel.value; this.applySelection(); };
    this.teleSel.onchange = () => { this.selectedTele = this.teleSel.value; this.applySelection(); };
    q('#compile').onclick = () => this.compileAll();
    q('#closeCode').onclick = () => this.toggle(false);
    q('#newTab').onclick = () => this.addTab('Untitled.java', '// Paste an OpMode here\n');
    (q('#sampleSel') as HTMLSelectElement).onchange = e => { const id = (e.target as HTMLSelectElement).value; const s = SAMPLES.find(x => x.id === id); if (s) { this.addTab(this.fileName(s.source) ?? s.label, s.source); this.compileAll(); } (e.target as HTMLSelectElement).value = ''; };

    this.editor = monaco.editor.create(q('#editor'), { language: 'java', theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, tabSize: 4 });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.compileAll());
    this.editor.onDidChangeModelContent(() => { if (this.current) { this.current.compiled = null; this.current.error = null; this.clearMarkers(); } });
    sim.onJavaError = (msg, line) => this.showRuntimeError(msg, line);
    this.addTab('MyTeleOp.java', SAMPLES[0].source);
    this.compileAll();
    this.refreshSelects();
  }

  toggle(show?: boolean) {
    this.root.hidden = show === undefined ? !this.root.hidden : !show;
    const faults = document.getElementById('faults'); if (faults) faults.hidden = !this.root.hidden; // the code pane covers that corner
    if (!this.root.hidden) this.editor.layout();
  }
  get visible() { return !this.root.hidden; }

  private fileName(src: string): string | null { const m = /class\s+([A-Za-z_$][\w$]*)/.exec(src); return m ? m[1] + '.java' : null; }

  private addTab(title: string, source: string) {
    const model = monaco.editor.createModel(source, 'java');
    const tab: Tab = { id: this.nextId++, title, model, compiled: null, error: null };
    this.tabs.push(tab); this.select(tab); this.renderTabs();
  }
  private select(tab: Tab) { this.current = tab; this.editor.setModel(tab.model); this.renderTabs(); this.renderProblems(); }
  private closeTab(tab: Tab) {
    if (this.tabs.length === 1) return;
    this.tabs = this.tabs.filter(t => t !== tab); tab.model.dispose();
    if (this.current === tab) this.select(this.tabs[0]);
    this.renderTabs(); this.refreshSelects();
  }
  private renderTabs() {
    this.tabBar.innerHTML = this.tabs.map(t => `<span class="tab ${t === this.current ? 'on' : ''} ${t.error ? 'err' : ''}" data-id="${t.id}">${t.title}<i data-close="${t.id}">×</i></span>`).join('');
    this.tabBar.querySelectorAll<HTMLElement>('.tab').forEach(el => { el.onclick = e => { const close = (e.target as HTMLElement).dataset.close; const tab = this.tabs.find(t => t.id === +(close ?? el.dataset.id!))!; if (close) this.closeTab(tab); else this.select(tab); }; });
  }

  compileAll() {
    for (const tab of this.tabs) {
      const src = tab.model.getValue();
      try {
        tab.compiled = compile(src); tab.error = null;
        const cls = tab.compiled.opmodes[0]?.className; if (cls && tab.title.startsWith('Untitled')) tab.title = cls + '.java';
      } catch (e) {
        tab.compiled = null;
        tab.error = e instanceof JavaError ? { msg: e.message, line: e.line } : { msg: String((e as Error).message), line: 1 };
      }
    }
    // The file you're editing is the one that runs: select its OpMode for its flavor.
    const cur = this.current?.compiled?.opmodes.find(o => !o.disabled);
    if (cur && this.current) { const key = `${this.current.id}:${cur.className}`; if (cur.flavor === 'auto') this.selectedAuto = key; else this.selectedTele = key; }
    this.renderTabs(); this.renderProblems(); this.setMarkers(); this.refreshSelects();
    const bad = this.tabs.filter(t => t.error);
    this.sim.info(bad.length ? `Compile: ${bad.length} file(s) with errors` : `Compiled ${this.tabs.length} file(s): ${this.allOpModes().map(o => o.info.name).join(', ') || 'no OpModes found'}`);
  }

  private allOpModes(): { tab: Tab; info: OpModeInfo }[] {
    const out: { tab: Tab; info: OpModeInfo }[] = [];
    for (const tab of this.tabs) if (tab.compiled) for (const info of tab.compiled.opmodes) if (!info.disabled) out.push({ tab, info });
    return out;
  }
  private refreshSelects() {
    const ops = this.allOpModes();
    const fill = (sel: HTMLSelectElement, flavor: 'auto' | 'teleop', builtin: string, selected: string) => {
      const items = ops.filter(o => o.info.flavor === flavor || o.info.flavor === 'unknown');
      sel.innerHTML = `<option value="builtin">${builtin}</option>` + items.map(o => `<option value="${o.tab.id}:${o.info.className}">${o.info.name}${o.info.group ? ' (' + o.info.group + ')' : ''}</option>`).join('');
      sel.value = [...sel.options].some(x => x.value === selected) ? selected : 'builtin';
      return sel.value;
    };
    // Default to the newest compiled OpMode of each flavor so a fresh paste is what runs.
    const newestTele = [...ops].reverse().find(o => o.info.flavor === 'teleop'); const newestAuto = [...ops].reverse().find(o => o.info.flavor === 'auto');
    if (newestTele && this.selectedTele === 'builtin') this.selectedTele = `${newestTele.tab.id}:${newestTele.info.className}`;
    if (newestAuto && this.selectedAuto === 'builtin') this.selectedAuto = `${newestAuto.tab.id}:${newestAuto.info.className}`;
    this.selectedAuto = fill(this.autoSel, 'auto', 'Built-in sample auto', this.selectedAuto);
    this.selectedTele = fill(this.teleSel, 'teleop', 'Built-in keyboard TeleOp', this.selectedTele);
    this.applySelection();
  }
  private applySelection() {
    const sim = this.sim;
    const make = (key: string, builtin: () => BuiltinOpMode) => {
      if (key === 'builtin') return builtin;
      const [tabId, cls] = key.split(':'); const tab = this.tabs.find(t => t.id === +tabId);
      if (!tab?.compiled) return builtin;
      const info = tab.compiled.opmodes.find(o => o.className === cls)!;
      const compiled = tab.compiled;
      return () => new JavaOpMode(compiled, info, sim.host, { onError: (msg, line) => { sim.error(msg); this.showRuntimeError(msg, line, tab); }, onTelemetry: () => {} });
    };
    sim.teleopFactory = make(this.selectedTele, () => new BuiltinOpMode('Built-in keyboard TeleOp', () => defaultTeleop(sim.padNow, sim.robot)));
    sim.autoFactory = make(this.selectedAuto, () => new BuiltinOpMode('Built-in sample auto', () => sampleAuto(sim.robot, sim)));
  }

  private renderProblems() {
    const t = this.current; if (!t) return;
    if (t.error) this.problems.innerHTML = `<div class="prob" data-line="${t.error.line}">Line ${t.error.line}: ${esc(t.error.msg)}</div>`;
    else if (t.compiled) this.problems.innerHTML = `<div class="ok">OK: ${t.compiled.opmodes.map(o => `${o.name} [${o.flavor === 'auto' ? 'Autonomous' : o.flavor === 'teleop' ? 'TeleOp' : 'no annotation'}, ${o.kind}]`).join(', ') || 'compiled, no OpMode class (needs extends LinearOpMode or OpMode)'}</div>`;
    else this.problems.innerHTML = `<div class="dim">Not compiled. Ctrl+Enter or Compile.</div>`;
    this.problems.querySelectorAll<HTMLElement>('.prob').forEach(el => { el.onclick = () => this.goto(+el.dataset.line!); });
  }
  private goto(line: number) { this.editor.revealLineInCenter(line); this.editor.setPosition({ lineNumber: line, column: 1 }); this.editor.focus(); }
  private setMarkers() {
    for (const t of this.tabs) monaco.editor.setModelMarkers(t.model, 'java', t.error ? [{ startLineNumber: t.error.line, startColumn: 1, endLineNumber: t.error.line, endColumn: 200, message: t.error.msg, severity: monaco.MarkerSeverity.Error }] : []);
  }
  private clearMarkers() { if (this.current) { monaco.editor.setModelMarkers(this.current.model, 'java', []); this.decorations = this.editor.deltaDecorations(this.decorations, []); } }
  showRuntimeError(msg: string, line: number, tab?: Tab) {
    const target = tab ?? this.lastErrorTab ?? this.current; if (!target) return;
    this.lastErrorTab = target; this.select(target); this.toggle(true);
    this.problems.innerHTML = `<div class="prob" data-line="${line}">${esc(msg)}</div>`;
    this.problems.querySelectorAll<HTMLElement>('.prob').forEach(el => { el.onclick = () => this.goto(+el.dataset.line!); });
    if (line > 0) { this.decorations = this.editor.deltaDecorations(this.decorations, [{ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, className: 'errline', glyphMarginClassName: 'errglyph' } }]); this.goto(line); }
  }

  update() {
    this.dsState.textContent = `${this.sim.state}  ${this.sim.phase}`;
    const lines = this.sim.dsTelemetry;
    const text = lines.join('\n'); if (this.dsTel.textContent !== text) this.dsTel.textContent = text;
  }
}
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
