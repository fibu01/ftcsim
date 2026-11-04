import { GamepadState, emptyGamepad } from '../sim/gamepad';

// Keyboard: W/S forward and back, A/D strafe, left/right arrows rotate,
// Q/E intake in and out, R/F lift up and down, Shift slow mode (B), Space launch (right bumper).
// A real controller through the Gamepad API takes over when any of its sticks move.
export class Input {
  private keys = new Set<string>();
  private lastPad: GamepadState = emptyGamepad();
  usingController = false;

  constructor() {
    const inField = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement;
    window.addEventListener('keydown', e => { if (!inField(e.target)) { this.keys.add(e.code); if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); } });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(code: string) { return this.keys.has(code); }

  read(): GamepadState {
    const g = emptyGamepad();
    const k = (c: string) => this.keys.has(c);
    g.left_stick_y = (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);   // forward is negative, like the real gamepad
    g.left_stick_x = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    g.right_stick_x = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0);
    g.right_trigger = k('KeyQ') ? 1 : 0;
    g.left_trigger = k('KeyE') ? 1 : 0;
    g.dpad_up = k('KeyR'); g.dpad_down = k('KeyF');
    g.b = k('ShiftLeft') || k('ShiftRight');
    g.right_bumper = k('Space');
    g.a = k('KeyZ');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : v);
      const p: GamepadState = {
        left_stick_x: dz(pad.axes[0] ?? 0), left_stick_y: dz(pad.axes[1] ?? 0),
        right_stick_x: dz(pad.axes[2] ?? 0), right_stick_y: dz(pad.axes[3] ?? 0),
        left_trigger: pad.buttons[6]?.value ?? 0, right_trigger: pad.buttons[7]?.value ?? 0,
        left_bumper: !!pad.buttons[4]?.pressed, right_bumper: !!pad.buttons[5]?.pressed,
        dpad_up: !!pad.buttons[12]?.pressed, dpad_down: !!pad.buttons[13]?.pressed,
        dpad_left: !!pad.buttons[14]?.pressed, dpad_right: !!pad.buttons[15]?.pressed,
        a: !!pad.buttons[0]?.pressed, b: !!pad.buttons[1]?.pressed, x: !!pad.buttons[2]?.pressed, y: !!pad.buttons[3]?.pressed,
      };
      const active = Object.values(p).some(v => (typeof v === 'number' ? Math.abs(v) > 0 : v));
      const keyActive = Object.values(g).some(v => (typeof v === 'number' ? Math.abs(v) > 0 : v));
      this.usingController = active || (this.usingController && !keyActive);
      if (this.usingController) { this.lastPad = p; return p; }
    }
    return g;
  }
}
