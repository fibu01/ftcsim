import { Simulation } from '../sim/world';
import { FAULTS } from '../sim/faults';
import { View, CameraMode } from '../render/scene';

export class Hud {
  onToggleCode: (() => void) | null = null;
  private root = document.getElementById('hud')!;
  private tel!: HTMLElement; private logEl!: HTMLElement; private stateEl!: HTMLElement; private logLen = 0;
  private fps = 0; private frames = 0; private last = performance.now();

  constructor(private sim: Simulation, private view: View) {
    this.root.innerHTML = `
      <div id="runbar" class="panel">
        <button id="run" class="primary">Run</button>
        <button id="pause">Pause</button>
        <button id="step">Step</button>
        <button id="reset">Reset</button>
        <button id="limitsBtn" title="What is and isn't simulated">Limits</button>
        <button id="codeBtn" title="Java OpMode editor">Code</button>
        <button id="keysBtn" title="Keyboard controls">Keys</button>
        <span class="state" id="state">stopped</span>
        <select id="speed"><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="5">5x</option></select>
        <select id="quality"><option value="high" selected>High</option><option value="low">Low</option></select>
      </div>
      <div class="badge">Field layout is a placeholder. Sizes from the manual, positions not yet.</div>
      <div id="telemetry" class="panel"><h3>Telemetry</h3><table></table></div>
      <div id="faults" class="panel"><h3>Faults</h3></div>
      <div id="help" class="panel" hidden>Keyboard maps to gamepad1: <b>W/S</b> left stick Y, <b>A/D</b> left stick X, <b>←/→</b> right stick X, <b>Q/E</b> right and left trigger, <b>R/F</b> dpad up and down, <b>Space</b> right bumper, <b>Shift</b> B, <b>Z</b> A. <b>1-4</b> cameras. A plugged-in controller takes over when touched. The built-in TeleOp uses these; a Java TeleOp reads whatever it wants from gamepad1.</div>
      <div id="log" class="panel"></div>
      <div id="limits" class="panel" hidden><h3>What this sim does and doesn't model</h3>
        <b>Modeled</b>: mecanum body dynamics with a fitted-style acceleration model, Rapier collisions, battery sag and drain, IMU noise and drift, encoder jitter and 40 ms read hold, wheel slip toward commanded speed when blocked, the faults in the panel.<br>
        <b>Java OpModes</b>: a Java subset runs in the browser against a Sim SDK (hardwareMap, DcMotorEx, IMU, Servo, telemetry, gamepads, LinearOpMode and OpMode). No generics beyond type args, no interfaces, anonymous classes, or threads. Anything the SDK layer lacks fails with "Unsupported SDK call" and the line.<br>
        <b>Not modeled</b>: motor torque and stall curves, per-wheel traction and roller friction, pitch and roll (the ramp is ridden flat), servos, odometry pods, distance and color sensors, a camera (the sample auto reads true ball positions), hub loop timing, partner and opponent robots, penalties.<br>
        <b>From the manual (TU07)</b>: field size, tile size, ball sizes, match timing, tip and CELL points, motor constants from the goBILDA 5203 sheet.<br>
        <b>Still placeholders</b>: element positions and the HIVE and FLOWER shapes (roadmap item 7), tip threshold, robot mass, wall height.<br>
        Treat results as directional until the manual geometry and a measured motor run are in.
      </div>
      <div id="cams" class="panel"><span style="color:var(--dim)">Camera</span>
        <button data-cam="orbit" class="on">1 Orbit</button><button data-cam="chase">2 Chase</button><button data-cam="driver">3 Driver</button><button data-cam="robot">4 Robot cam</button>
      </div>`;
    this.tel = this.root.querySelector('#telemetry table')!;
    this.logEl = this.root.querySelector('#log')!;
    this.stateEl = this.root.querySelector('#state')!;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    q('#run').onclick = () => sim.run();

    q('#pause').onclick = () => sim.pause();
    q('#step').onclick = () => sim.stepOnce();
    q('#reset').onclick = () => sim.reset();
    q('#limitsBtn').onclick = () => { const l = q('#limits'); l.hidden = !l.hidden; };
    q('#codeBtn').onclick = () => this.onToggleCode?.();
    q('#keysBtn').onclick = () => { const h = q('#help'); h.hidden = !h.hidden; };
    (q('#speed') as HTMLSelectElement).onchange = e => { sim.speed = parseFloat((e.target as HTMLSelectElement).value); };
    (q('#quality') as HTMLSelectElement).onchange = e => view.setQuality((e.target as HTMLSelectElement).value as 'high' | 'low');
    this.root.querySelectorAll<HTMLButtonElement>('#cams button').forEach(b => { b.onclick = () => this.setCam(b.dataset.cam as CameraMode); });
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const cams: CameraMode[] = ['orbit', 'chase', 'driver', 'robot'];
      if (e.code.startsWith('Digit') && +e.code[5] >= 1 && +e.code[5] <= 4) this.setCam(cams[+e.code[5] - 1]);
    });
    const fp = q('#faults');
    for (const f of FAULTS) {
      const row = document.createElement('div');
      row.innerHTML = `<label><input type="checkbox"><span>${f.label}</span><input type="range" min="0.1" max="1" step="0.05" value="${f.severity}"></label><div class="detail">${f.detail}</div>`;
      const [cb, range] = row.querySelectorAll('input');
      cb.onchange = () => { f.on = cb.checked; };
      range.oninput = () => { f.severity = parseFloat(range.value); };
      fp.appendChild(row);
    }
  }

  setCam(m: CameraMode) {
    this.view.setMode(m);
    this.root.querySelectorAll<HTMLButtonElement>('#cams button').forEach(b => b.classList.toggle('on', b.dataset.cam === m));
  }

  update() {
    this.frames++;
    const now = performance.now();
    if (now - this.last > 500) { this.fps = (this.frames * 1000) / (now - this.last); this.frames = 0; this.last = now; }
    const rows = this.sim.telemetry();
    rows.push(['fps', this.fps.toFixed(0)]);
    this.tel.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td class="${v.startsWith('WARN') ? 'warn' : ''}">${v}</td></tr>`).join('');
    this.stateEl.textContent = this.sim.state;
    if (this.sim.log.length !== this.logLen || (this.sim.log.length && this.logEl.childElementCount === 0)) {
      this.logEl.innerHTML = this.sim.log.map(l => `<div class="${l.level}"><span class="t">${l.t.toFixed(2)}</span>${l.msg}</div>`).join('');
      this.logEl.scrollTop = this.logEl.scrollHeight; this.logLen = this.sim.log.length;
    }
  }
}
