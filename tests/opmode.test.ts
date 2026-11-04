import { describe, it, expect } from 'vitest';
import { compile, JavaOpMode } from '../src/java/opmode';
import { SdkHost } from '../src/java/sdk';
import { SimMotor } from '../src/sim/motor';
import { emptyGamepad, GamepadState } from '../src/sim/gamepad';
import { SLIDE21_WORKING, SLIDE21_BUGGY, ENCODER_AUTO } from '../src/samples';
import { readFileSync } from 'node:fs';

// A fake robot: just the motors and an IMU read, enough for the SDK layer.
function fakeHost(pad: () => GamepadState) {
  const motors = { frontLeft: new SimMotor('frontLeft', -1), frontRight: new SimMotor('frontRight'), backLeft: new SimMotor('backLeft', -1), backRight: new SimMotor('backRight'), lift: new SimMotor('lift'), intake: new SimMotor('intake') };
  const state = { t: 0, yaw: 0, log: [] as string[], tel: [] as string[], errors: [] as string[], stop: false };
  const host: SdkHost = {
    robot: { motors, imuYaw: () => state.yaw, yawRate: 0 } as any,
    gamepad1: pad, gamepad2: () => emptyGamepad(), now: () => state.t,
    log: (l, m) => state.log.push(`${l}: ${m}`), telemetryOut: lines => { state.tel = lines; }, requestStop: () => { state.stop = true; }, rng: () => 0.5,
  };
  return { host, motors, state };
}
function load(src: string, pad: () => GamepadState) {
  const c = compile(src); const { host, motors, state } = fakeHost(pad);
  const op = new JavaOpMode(c, c.opmodes[0], host, { onError: (m) => state.errors.push(m), onTelemetry: () => {} });
  return { op, motors, state, info: c.opmodes[0] };
}

describe('Java OpModes on the Sim SDK', () => {
  it('slide 21 working TeleOp drives forward on forward stick', () => {
    const { op, motors, state, info } = load(SLIDE21_WORKING, () => ({ ...emptyGamepad(), left_stick_y: -1 }));
    expect(info.flavor).toBe('teleop'); expect(info.name).toBe('Workshop TeleOp');
    op.init(); expect(state.errors).toEqual([]); expect(state.tel).toEqual(['Status : Initialized']);
    op.start(); for (let i = 0; i < 5; i++) { state.t += 0.02; op.loop(); }
    expect(state.errors).toEqual([]);
    expect(motors.frontLeft.getPower()).toBe(1); expect(motors.frontRight.getPower()).toBe(1);
    // Mirrored left motors plus REVERSE: all four push the robot forward.
    expect(motors.frontLeft.effectivePower()).toBe(1); expect(motors.backLeft.effectivePower()).toBe(1); expect(motors.backRight.effectivePower()).toBe(1);
    expect(state.tel[0]).toBe('Motor FL : 1.0');
    op.stop(); expect(state.log.some(l => l.includes('runOpMode() returned'))).toBe(true);
  });
  it('slide 21 buggy TeleOp drives backward on forward stick', () => {
    const { op, motors } = load(SLIDE21_BUGGY, () => ({ ...emptyGamepad(), left_stick_y: -1 }));
    op.init(); op.start(); op.loop(); op.loop();
    expect(motors.frontLeft.effectivePower()).toBe(-1); expect(motors.frontRight.effectivePower()).toBe(-1);
  });
  it('without setDirection(REVERSE) the mirrored left side pushes backward', () => {
    const src = SLIDE21_WORKING.replace(/frontLeft.setDirection[^\n]*\n/, '').replace(/backLeft.setDirection[^\n]*\n/, '');
    const { op, motors } = load(src, () => ({ ...emptyGamepad(), left_stick_y: -1 }));
    op.init(); op.start(); op.loop();
    expect(motors.frontLeft.effectivePower()).toBe(-1); expect(motors.frontRight.effectivePower()).toBe(1);
  });
  it('the SDK BasicOmniOpMode_Linear sample runs unchanged', () => {
    const src = readFileSync('reference/ftc-sdk-samples/BasicOmniOpMode_Linear.java', 'utf8');
    const { op, motors, state } = load(src, () => ({ ...emptyGamepad(), left_stick_x: 1 }));
    op.init(); expect(state.errors).toEqual([]);
    op.start(); for (let i = 0; i < 3; i++) { state.t += 0.02; op.loop(); }
    expect(state.errors).toEqual([]);
    // lateral = +1: FL +, FR -, BL -, BR +
    expect(motors.frontLeft.getPower()).toBe(1); expect(motors.frontRight.getPower()).toBe(-1); expect(motors.backLeft.getPower()).toBe(-1); expect(motors.backRight.getPower()).toBe(1);
    expect(state.tel.some(l => l.startsWith('Front left/Right : 1.00, -1.00'))).toBe(true);
  });
  it('unknown hardware name fails with the config list', () => {
    const { op, state } = load(SLIDE21_WORKING.replace('"frontLeft"', '"leftMotor"'), () => emptyGamepad());
    op.init(); expect(op.failed).toBe(true); expect(state.errors[0]).toMatch(/Unable to find a hardware device with name "leftMotor"/);
  });
  it('unsupported SDK call names the line', () => {
    const src = SLIDE21_WORKING.replace('waitForStart();', 'waitForStart();\n        hardwareMap.get(DistanceSensor.class, "front").getDistance(DistanceUnit.CM);');
    const { op, state } = load(src, () => emptyGamepad());
    op.init(); op.start(); expect(op.failed).toBe(true); expect(state.errors[0]).toMatch(/Unsupported at line \d+: Unsupported SDK call: hardwareMap.get\(DistanceSensor/);
  });
  it('autonomous uses encoders, sleep, IMU and finishes', () => {
    const { op, motors, state, info } = load(ENCODER_AUTO, () => emptyGamepad());
    expect(info.flavor).toBe('auto');
    op.init(); op.start(); expect(state.errors).toEqual([]);
    // simulate: wheels turn at 2000 ticks/s while powered
    let sawSleep = false, turned = false;
    for (let i = 0; i < 600; i++) {
      state.t += 0.02;
      for (const m of [motors.frontLeft, motors.frontRight, motors.backLeft, motors.backRight]) { m.angularVelocity = m.effectivePower() * 20; m.integrate(0.02); m.latch(); }
      if (motors.lift.getPower() === 1) sawSleep = true;
      // right turn: left side forward, right side back
      if (motors.frontLeft.effectivePower() > 0 && motors.frontRight.effectivePower() < 0) { turned = true; state.yaw = -35 * Math.PI / 180; }
      op.loop();
    }
    expect(state.errors).toEqual([]); expect(sawSleep).toBe(true); expect(turned).toBe(true);
    expect(state.tel[0]).toMatch(/^Done in : \d+\.\d s$/);
  });
  it('iterative OpMode init/loop/stop lifecycle', () => {
    const src = `@TeleOp public class It extends OpMode { DcMotor m; int n = 0; public void init() { m = hardwareMap.get(DcMotor.class, "lift"); telemetry.addData("s", "init"); } public void loop() { n++; m.setPower(gamepad1.a ? 0.5 : 0); telemetry.addData("n", n); telemetry.update(); } public void stop() { m.setPower(0); } }`;
    const { op, motors, state, info } = load(src, () => ({ ...emptyGamepad(), a: true }));
    expect(info.kind).toBe('iterative');
    op.init(); op.start(); op.loop(); op.loop(); expect(motors.lift.getPower()).toBe(0.5); expect(state.tel).toEqual(['n : 2']);
    op.stop(); expect(motors.lift.getPower()).toBe(0);
  });
  it('gamepad edge methods', () => {
    let a = false;
    const src = `@TeleOp public class E extends LinearOpMode { public void runOpMode() { int presses = 0; waitForStart(); while (opModeIsActive()) { if (gamepad1.aWasPressed()) presses++; telemetry.addData("p", presses); telemetry.update(); } } }`;
    const { op, state } = load(src, () => ({ ...emptyGamepad(), a }));
    op.init(); op.start();
    a = true; op.loop(); op.loop(); a = false; op.loop(); a = true; op.loop();
    expect(state.tel).toEqual(['p : 2']);
  });
});
