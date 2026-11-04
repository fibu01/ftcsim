import { GamepadState } from '../sim/gamepad';
import { Robot } from '../sim/robot';

// Phase 1 built-in TeleOp. Same math as BasicOmniOpMode_Linear in reference/ftc-sdk-samples.
// Phase 2 replaces this with the pasted Java OpMode.
export function defaultTeleop(gamepad1: GamepadState, robot: Robot) {
  const m = robot.motors;
  const axial = -gamepad1.left_stick_y;
  const lateral = gamepad1.left_stick_x;
  const yaw = gamepad1.right_stick_x;
  let fl = axial + lateral + yaw;
  let fr = axial - lateral - yaw;
  let bl = axial - lateral + yaw;
  let br = axial + lateral - yaw;
  let max = Math.max(Math.abs(fl), Math.abs(fr), Math.abs(bl), Math.abs(br));
  if (max > 1) { fl /= max; fr /= max; bl /= max; br /= max; }
  const scale = gamepad1.b ? 0.35 : 1;
  m.frontLeft.setPower(fl * scale); m.frontRight.setPower(fr * scale);
  m.backLeft.setPower(bl * scale); m.backRight.setPower(br * scale);
  m.intake.setPower(gamepad1.right_trigger - gamepad1.left_trigger);
  m.lift.setPower((gamepad1.dpad_up ? 1 : 0) - (gamepad1.dpad_down ? 1 : 0));
  robot.wantLaunch = gamepad1.right_bumper;
}
