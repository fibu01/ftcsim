import { Simulation } from '../sim/world';
import { FAULTS } from '../sim/faults';
import { View, CameraMode } from '../render/scene';

export class Hud {
  private root = document.getElementById('hud')!;
  private tel!: HTMLElement; private logEl!: HTMLElement; private stateEl!: HTMLElement; private logLen = 0;
  private fps = 0; private frames = 0; private last = performance.now();

  constructor(private sim: Simulation, private view: View) {
    this.root.innerHTML = `
      <div id="runbar" class="panel">
        <select id="mode" title="What runs when you press Run"><option value="teleop" selected>TeleOp</option><option value="auto">Autonomous (30 s)</option><option value="match">Full match</option></select>
        <button id="run" class="primary">Run</button>
        <button id="pause">Pause</button>
        <button id="step">Step</button>
        <button id="reset">Reset</button>
        <button id="limitsBtn" title="What is and isn't simulated">Limits</button>
        <span class="state" id="state">stopped</span>
        <select id="speed"><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="5">5x</option></select>
        <select id="quality"><option value="high" selected>High</option><option value="low">Low</option></select>
      </div>
      <div class="badge">BIOBUZZ field is a placeholder, not to scale [confirm in manual]</div>
      <div id="telemetry" class="panel"><h3>Telemetry</h3><table></table></div>
      <div id="faults" class="panel"><h3>Faults</h3></div>
      <div id="help" class="panel"><b>W/S</b> drive <b>A/D</b> strafe <b>←/→</b> rotate <b>Q/E</b> intake in/out <b>R/F</b> lift <b>Space</b> launch <b>Shift</b> slow mode. <b>1-4</b> cameras. A plugged-in controller works too.</div>
      <div id="log" class="panel"></div>
      <div id="limits" class="panel" hidden><h3>What this sim does and doesn't model</h3>
        <b>Modeled</b>: mecanum body dynamics with a fitted-style acceleration model, Rapier collisions, battery sag and drain, IMU noise and drift, encoder jitter and 40 ms read hold, wheel slip toward commanded speed when blocked, the faults in the panel.<br>
        <b>Not modeled</b>: motor torque and stall curves, per-wheel traction and roller friction, pitch and roll (the ramp is ridden flat), servos, odometry pods, distance and color sensors, a camera (the sample auto reads true ball positions), hub loop timing, partner and opponent robots, penalties.<br>
        <b>Placeholders</b> [confirm in manual]: every field size and element position, match transition length, scoring points, robot mass and motor constants.<br>
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
    (q('#mode') as HTMLSelectElement).onchange = e => { sim.mode = (e.target as HTMLSelectElement).value as 'teleop' | 'auto' | 'match'; sim.reset(); };
    q('#pause').onclick = () => sim.pause();
    q('#step').onclick = () => sim.stepOnce();
    q('#reset').onclick = () => sim.reset();
    q('#limitsBtn').onclick = () => { const l = q('#limits'); l.hidden = !l.hidden; };
    (q('#speed') as HTMLSelectElement).onchange = e => { sim.speed = parseFloat((e.target as HTMLSelectElement).value); };
    (q('#quality') as HTMLSelectElement).onchange = e => view.setQuality((e.target as HTMLSelectElement).value as 'high' | 'low');
    this.root.querySelectorAll<HTMLButtonElement>('#cams button').forEach(b => { b.onclick = () => this.setCam(b.dataset.cam as CameraMode); });
    window.addEventListener('keydown', e => {
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
