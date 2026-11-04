// Runs a compiled Java OpMode against the simulator: INIT, START, one resume per tick, STOP.
import { parse } from './parser';
import { Interpreter, UserClass, Instance, Value, V, Yield, JavaThrow, toJavaString } from './interp';
import { JavaError } from './lexer';
import { buildSdk, SdkHost, GamepadDevice, TelemetryDevice, LinearOpModeBase } from './sdk';
import { Program, Annotation } from './ast';
import { TICK } from '../config';

export interface OpModeInfo { className: string; name: string; group: string; flavor: 'teleop' | 'auto' | 'unknown'; disabled: boolean; kind: 'linear' | 'iterative' }

export interface Compiled { program: Program; opmodes: OpModeInfo[]; source: string }

export function compile(source: string): Compiled {
  const program = parse(source);
  const opmodes: OpModeInfo[] = [];
  const walk = (list: typeof program.classes) => {
    for (const c of list) {
      const kind = c.ext === 'LinearOpMode' ? 'linear' : c.ext === 'OpMode' ? 'iterative' : null;
      if (kind) {
        const ann = (n: string): Annotation | undefined => c.annotations.find(a => a.name === n);
        const tele = ann('TeleOp'), auto = ann('Autonomous');
        const a = tele ?? auto;
        const lit = (e: any) => (e && e.k === 'lit' ? String(e.v) : '');
        opmodes.push({ className: c.name, name: a ? lit(a.args.name) || c.name : c.name, group: a ? lit(a.args.group) : '', flavor: tele ? 'teleop' : auto ? 'auto' : 'unknown', disabled: !!ann('Disabled'), kind });
      }
      walk(c.inner);
    }
  };
  walk(program.classes);
  return { program, opmodes, source };
}

export interface OpModeHandle {
  label: string;
  init(): void;
  start(): void;
  loop(): void;
  stop(): void;
  readonly failed: boolean;
}

export interface JavaOpModeEvents {
  onError(msg: string, line: number, kind: string): void;
  onTelemetry(lines: string[]): void;
}

export class JavaOpMode implements OpModeHandle {
  label: string;
  failed = false;
  private interp: Interpreter;
  private cls: UserClass;
  private inst: Instance | null = null;
  private gen: Generator<Yield, Value, Value> | null = null;
  private sleepTicks = 0;
  private base: LinearOpModeBase;
  private gamepads: GamepadDevice[];
  private telemetry: TelemetryDevice;
  private budgetWarned = false;
  private stopping = 0;
  private phase: 'new' | 'init' | 'running' | 'done' = 'new';

  constructor(compiled: Compiled, private info: OpModeInfo, private host: SdkHost, private events: JavaOpModeEvents) {
    this.label = info.name;
    this.interp = new Interpreter(compiled.program);
    const sdk = buildSdk(host);
    for (const n of sdk.natives) this.interp.registerNative(n);
    this.base = sdk.base; this.gamepads = sdk.gamepads; this.telemetry = sdk.telemetry;
    this.presets = sdk.presets;
    this.cls = this.interp.classes.get(info.className)!;
    this.interp.onBudget = () => { if (!this.budgetWarned) { this.budgetWarned = true; host.log('warn', `${this.label}: a loop ran ${this.interp.budget} statements without opModeIsActive(), sleep(), or idle(). The sim yields anyway; a real hub would stall.`); } };
  }
  private presets: Map<string, Value>;

  private fail(e: unknown) {
    this.failed = true; this.phase = 'done'; this.gen = null;
    for (const m of Object.values(this.host.robot.motors)) m.setPower(0);
    if (e instanceof JavaError) this.events.onError(`${e.kind === 'unsupported' ? 'Unsupported' : e.kind === 'compile' ? 'Error' : 'Runtime error'} at line ${e.line}: ${e.message}`, e.line, e.kind);
    else if (e instanceof JavaThrow) this.events.onError(`Uncaught exception at line ${e.line}: ${toJavaString(e.value)}`, e.line, 'runtime');
    else this.events.onError(`Simulator error: ${(e as Error)?.message ?? e}`, 0, 'runtime');
  }

  // Drive the generator until it waits on something the runner must provide.
  private resume(send: Value): void {
    if (!this.gen) return;
    try {
      let r = this.gen.next(send);
      for (;;) {
        if (r.done) { this.gen = null; this.phase = 'done'; this.host.log('info', `${this.label}: runOpMode() returned`); return; }
        const y = r.value;
        if (y.kind === 'waitForStart') { if (this.base.started || this.base.stopRequested) { r = this.gen.next(V.void()); continue; } return; }
        if (y.kind === 'tick') return;                       // once per tick
        if (y.kind === 'sleep') { this.sleepTicks = Math.max(1, Math.round(y.ms / 1000 / TICK)); return; }
        if (y.kind === 'budget') return;                     // forced yield, continue next tick
        r = this.gen.next(V.void());
      }
    } catch (e) { this.fail(e); }
  }

  init() {
    this.phase = 'init';
    try {
      const run = (function* (self: JavaOpMode) {
        yield* self.interp.initStatics(self.cls);
        for (let c = self.cls.parent(); c; c = c.parent()) yield* self.interp.initStatics(c);
        self.inst = yield* self.interp.construct(self.cls, [], self.cls.decl.line, self.presets);
        if (self.info.kind === 'linear') {
          const m = self.cls.find('runOpMode', 0);
          if (!m) throw new JavaError(`${self.cls.decl.name} needs a runOpMode() method`, self.cls.decl.line);
          return yield* self.interp.invoke(m, self.cls, self.inst, [], m.line);
        }
        const im = self.cls.find('init', 0);
        if (!im) throw new JavaError(`${self.cls.decl.name} needs an init() method`, self.cls.decl.line);
        yield* self.interp.invoke(im, self.cls, self.inst, [], im.line);
        return V.void();
      })(this);
      this.gamepads.forEach(g => g.refresh());
      if (this.info.kind === 'linear') { this.gen = run; this.resume(V.void()); }
      else { this.gen = run; this.resume(V.void()); this.gen = null; this.phase = 'init'; }
    } catch (e) { this.fail(e); }
  }

  start() {
    if (this.failed) return;
    this.base.started = true; this.base.startTime = this.host.now();
    this.phase = 'running';
    if (this.info.kind === 'linear') { if (this.gen) this.resume(V.void()); }
    else this.callMethod('start');
  }

  private callMethod(name: string) {
    if (!this.inst) return;
    const m = this.cls.find(name, 0); if (!m) return;
    const g = this.interp.invoke(m, this.cls, this.inst, [], m.line);
    try {
      let r = g.next(V.void());
      let guard = 0;
      while (!r.done) { r = g.next(V.bool(this.base.active)); if (++guard > 50) { this.host.log('warn', `${this.label}.${name}() waited inside a loop() method; the sim moved on`); break; } }
    } catch (e) { this.fail(e); }
  }

  loop() {
    if (this.failed || this.phase === 'done') return;
    this.gamepads.forEach(g => g.refresh());
    if (this.info.kind === 'iterative') { this.callMethod(this.phase === 'init' ? 'init_loop' : 'loop'); return; }
    if (this.sleepTicks > 0) { this.sleepTicks--; return; }
    if (this.gen) this.resume(V.bool(this.base.active));
  }

  stop() {
    if (this.phase === 'done') return;
    this.base.stopRequested = true;
    if (this.info.kind === 'iterative') { this.callMethod('stop'); this.phase = 'done'; return; }
    // Let the loop see opModeIsActive() == false and return on its own, within a few resumes.
    for (this.stopping = 0; this.gen && this.stopping < 20; this.stopping++) { this.sleepTicks = 0; this.resume(V.bool(false)); }
    if (this.gen) { this.host.log('warn', `${this.label} didn't return from runOpMode() after stop; terminated`); this.gen = null; }
    this.phase = 'done';
    for (const m of Object.values(this.host.robot.motors)) m.setPower(0);
    this.telemetry.lines = [];
  }
}
