import { ROBOT } from '../config';

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
  reversedFault = false;     // motor reversed fault

  // mountSign is -1 for motors mounted mirrored (the left side), so positive motor power drives the robot backward
  // until the OpMode calls setDirection(REVERSE). Same as a real mecanum base.
  constructor(public readonly name: string, public readonly mountSign: 1 | -1 = 1) {}

  setPower(p: number) { this.power = Math.max(-1, Math.min(1, p)); }
  getPower() { return this.power; }
  setDirection(d: Direction) { this.direction = d; }
  getDirection() { return this.direction; }
  setMode(m: RunMode) {
    this.mode = m;
    if (m === 'STOP_AND_RESET_ENCODER') { this.encoderPosition = 0; this.power = 0; }
  }
  getMode() { return this.mode; }
  setZeroPowerBehavior(z: ZeroPowerBehavior) { this.zeroPowerBehavior = z; }
  getCurrentPosition() { return Math.round(this.encoderPosition); }
  // ticks per second, like DcMotorEx.getVelocity()
  getVelocity() { return (this.angularVelocity / (2 * Math.PI)) * ROBOT.ticksPerRev * this.sign() * this.mountSign; }

  // effective power after direction and faults
  effectivePower() { return this.power * this.sign() * this.mountSign * (this.reversedFault ? -1 : 1); }
  private sign() { return this.direction === 'REVERSE' ? -1 : 1; }

  integrate(dt: number) {
    if (this.encoderFrozen) return;
    this.encoderPosition += (this.angularVelocity * this.sign() * this.mountSign / (2 * Math.PI)) * ROBOT.ticksPerRev * dt;
  }
}
