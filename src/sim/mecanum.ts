import { DRIVE, ROBOT } from '../config';

// Body frame: x forward, y left, theta counter-clockwise (seen from above).
// Model form follows the fitted FTCodeSim drivetrain (docs/reference-projects.md):
// a = kA * V * effort - backEMF * |effort| * v - decel * sign(v)

export interface Motion { x: number; y: number; theta: number }
export const FL = 0, FR = 1, BL = 2, BR = 3;
export const R = ROBOT.wheelbase / 2 + ROBOT.trackWidth / 2;

export function powerKinematics(p: number[]): Motion {
  const [fl, fr, bl, br] = p;
  return {
    x: (fl + fr + bl + br) / 4,
    y: (-fl + fr + bl - br) / 4,
    theta: (-fl + fr - bl + br) / 4,
  };
}

export function inverseKinematics(m: Motion): number[] {
  const r = ROBOT.wheelRadius;
  return [
    (m.x - m.y - m.theta * R) / r, // FL
    (m.x + m.y + m.theta * R) / r, // FR
    (m.x + m.y - m.theta * R) / r, // BL
    (m.x - m.y + m.theta * R) / r, // BR
  ];
}

export function interpolate(xv: number, yv: number, theta: number): number {
  const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
  return 1 / (c / xv + s / yv);
}

function axis(v: number, effort: number, maxVel: number, maxAccel: number, decel: number, voltage: number, brake: boolean): number {
  const backEMF = maxAccel / maxVel;
  const kA = (backEMF * maxVel + decel) / DRIVE.nominalVoltage;
  let a = kA * voltage * effort;
  if (Math.sign(v) === Math.sign(effort)) a -= backEMF * Math.abs(effort) * v;
  if (effort === 0 ? brake : Math.sign(v) !== Math.sign(effort)) a -= v * 6; // braking: exponential-ish stop
  else a -= decel * Math.sign(v);
  return a;
}

// Returns body-frame acceleration for current body-frame velocity and motor effort.
export function driveAcceleration(vel: Motion, effort: Motion, voltage: number, brake: boolean): Motion {
  const dir = Math.atan2(vel.y, vel.x);
  const maxVel = interpolate(DRIVE.maxForwardVel, DRIVE.maxStrafeVel, dir);
  const decel = interpolate(DRIVE.forwardDecel, DRIVE.strafeDecel, dir);
  const acc: Motion = {
    x: axis(vel.x, effort.x, maxVel, DRIVE.maxAccel, decel, voltage, brake),
    y: axis(vel.y, effort.y, maxVel, DRIVE.maxAccel, decel, voltage, brake),
    theta: axis(vel.theta, effort.theta, DRIVE.maxAngularVel, DRIVE.maxAngularAccel, DRIVE.turnDecel, voltage, brake),
  };
  const stationary =
    Math.abs(vel.x) < DRIVE.staticVelocity && Math.abs(vel.y) < DRIVE.staticVelocity &&
    Math.abs(vel.theta) < DRIVE.staticAngular &&
    Math.abs(effort.x) < 0.05 && Math.abs(effort.y) < 0.05 && Math.abs(effort.theta) < 0.05;
  if (stationary) return { x: -vel.x / 0.02, y: -vel.y / 0.02, theta: -vel.theta / 0.02 };
  return acc;
}
