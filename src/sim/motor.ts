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
  noiseTicks = 0;            // added on read when sensor noise is on
  private heldVelocity = 0; private heldPosition = 0; // read-hold copies
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
    if (m === 'STOP_AND_RESET_ENCODER') { this.resetEncoder(); this.power = 0; }
  }
  getMode() { return this.mode; }
  setZeroPowerBehavior(z: ZeroPowerBehavior) { this.zeroPowerBehavior = z; }
  getCurrentPosition() { return Math.round(this.heldPosition + this.noiseTicks); }
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

  // effective power after direction and faults
  effectivePower() { return this.power * this.sign() * this.mountSign * (this.reversedFault ? -1 : 1); }
  private sign() { return this.direction === 'REVERSE' ? -1 : 1; }

  integrate(dt: number) {
    if (this.encoderFrozen) return;
    this.encoderPosition += (this.angularVelocity * this.sign() * this.mountSign / (2 * Math.PI)) * ROBOT.ticksPerRev * dt;
  }
}
