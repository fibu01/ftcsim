// Mirrors the fields of the FTC SDK Gamepad class that the workshop skeleton uses.
export interface GamepadState {
  left_stick_x: number; left_stick_y: number;
  right_stick_x: number; right_stick_y: number;
  left_trigger: number; right_trigger: number;
  left_bumper: boolean; right_bumper: boolean;
  dpad_up: boolean; dpad_down: boolean; dpad_left: boolean; dpad_right: boolean;
  a: boolean; b: boolean; x: boolean; y: boolean;
}
export const emptyGamepad = (): GamepadState => ({
  left_stick_x: 0, left_stick_y: 0, right_stick_x: 0, right_stick_y: 0,
  left_trigger: 0, right_trigger: 0, left_bumper: false, right_bumper: false,
  dpad_up: false, dpad_down: false, dpad_left: false, dpad_right: false,
  a: false, b: false, x: false, y: false,
});
