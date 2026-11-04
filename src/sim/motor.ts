import { ROBOT } from '../config';

export const MAX_TICKS_PER_SEC = (ROBOT.motorFreeRpm / 60) * ROBOT.ticksPerRev;

// Surface follows DcMotor in the FTC SDK samples (reference/ftc-sdk-samples). Names are not invented.
export type Direction = 'FORWARD' | 'REVERSE';
export type RunMode = 'RUN_WITHOUT_ENCODER' | 'RUN_USING_ENCODER' | 'STOP_AND_RESET_ENCODER' | 'RUN_TO_POSITION';
export type ZeroPowerBehavior = 'BRAKE' | 'FLOAT';

export class SimMotor {
  power = 0;                 // commanded, -1..1
  direction: Direction = 'FORWARD';
  mode: RunMode = 'RUN_WITHOUT_ENCODER';
  zeroPowerBehavior: ZeroPowerBehavior = 'BRAKE';
  angularVelocity = 0;       // rad/s, set by the drivetrain each tick
  private encoderPosition = 0; // ticks, float accumulator
  encoderFrozen = false;     // encoder dropout fault
  noiseTicks = 0;            // added on read when sensor noise is on
  targetPosition = 0;        // RUN_TO_POSITION target, ticks
  targetTolerance = 5;       // ticks, SDK default [estimate]
  velocityTarget: number | null = null; // ticks/s when setVelocity() was used
  enabled = true;
  amps = 0;                  // estimated draw, set by the robot each tick
  private heldVelocity = 0; private heldPosition = 0; // read-hold copies
  reversedFault = false;     // motor reversed fault

  // mountSign is -1 for motors mounted mirrored (the left side), so positive motor power drives the robot backward
  // until the OpMode calls setDirection(REVERSE). Same as a real mecanum base.
  constructor(public readonly name: string, public readonly mountSign: 1 | -1 = 1) {}

  setPower(p: number) { this.power = Math.max(-1, Math.min(1, p)); this.velocityTarget = null; }
  // DcMotorEx.setVelocity in ticks per second. Mapped onto power against the free speed.
  setVelocity(ticksPerSec: number) { this.velocityTarget = ticksPerSec; this.power = Math.max(-1, Math.min(1, ticksPerSec / MAX_TICKS_PER_SEC)); }
  setTargetPosition(t: number) { this.targetPosition = Math.round(t); }
  getTargetPosition() { return this.targetPosition; }
  isBusy() { return this.mode === 'RUN_TO_POSITION' && Math.abs(this.targetPosition - this.encoderPosition) > this.targetTolerance; }
  getPower() { return this.power; }
  setDirection(d: Direction) { this.direction = d; }
  getDirection() { return this.direction; }
  setMode(m: RunMode) {
    this.mode = m;
    if (m === 'STOP_AND_RESET_ENCODER') { this.resetEncoder(); this.power = 0; }
  }
  getMode() { return this.mode; }
  setZeroPowerBehavior(z: ZeroPowerBehavior) { this.zeroPowerBehavior = z; }
  getCurrentPosition() { return Math.round(this.heldPosition + this.noiseTicks); }
  rawPosition() { return this.encoderPosition; }
  // ticks per second, like DcMotorEx.getVelocity()
  getVelocity() { return this.heldVelocity; }
  // Called when the hub refreshes its reads.
  latch() {
    this.heldPosition = this.encoderPosition;
    // A dead encoder reports no movement at all: position holds and velocity reads 0.
    this.heldVelocity = this.encoderFrozen ? 0 : (this.angularVelocity / (2 * Math.PI)) * ROBOT.ticksPerRev * this.sign() * this.mountSign;
  }
  resetEncoder() { this.encoderPosition = 0; this.heldPosition = 0; this.heldVelocity = 0; }
  // Free wheel speed (rad/s) the motor would reach at this power and voltage with no load.
  commandedSpeed(voltage: number) { return this.effectivePower() * (voltage / 12) * (ROBOT.motorFreeRpm * 2 * Math.PI / 60); }

  // effective power after run mode, direction, and faults
  effectivePower() {
    if (!this.enabled) return 0;
    let p = this.power;
    if (this.mode === 'RUN_TO_POSITION') {
      // Proportional approach to the target, capped by the magnitude of setPower(). Like the hub's position PID, roughly. [estimate]
      const err = this.targetPosition - this.encoderPosition;
      const approach = Math.max(-1, Math.min(1, err / (ROBOT.ticksPerRev * 0.25)));
      p = Math.abs(this.power) * approach;
    }
    return p * this.sign() * this.mountSign * (this.reversedFault ? -1 : 1);
  }
  private sign() { return this.direction === 'REVERSE' ? -1 : 1; }

  integrate(dt: number) {
    if (this.encoderFrozen) return;
    this.encoderPosition += (this.angularVelocity * this.sign() * this.mountSign / (2 * Math.PI)) * ROBOT.ticksPerRev * dt;
  }
}
