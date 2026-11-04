import { describe, it, expect } from 'vitest';
import { powerKinematics, inverseKinematics, driveAcceleration, FL, FR, BL, BR } from '../src/sim/mecanum';
import { ROBOT } from '../src/config';

describe('mecanum kinematics', () => {
  it('equal power drives forward only', () => {
    const m = powerKinematics([1, 1, 1, 1]);
    expect(m.x).toBe(1); expect(m.y).toBe(0); expect(m.theta).toBe(0);
  });
  it('BasicOmni right-strafe pattern gives negative y (left) and no yaw', () => {
    // lateral = +1 from the sample: FL=+1, FR=-1, BL=-1, BR=+1
    const m = powerKinematics([1, -1, -1, 1]);
    expect(m.x).toBe(0); expect(m.y).toBe(-1); expect(m.theta).toBe(0);
  });
  it('BasicOmni yaw pattern turns clockwise (negative theta)', () => {
    const m = powerKinematics([1, -1, 1, -1]);
    expect(m.theta).toBe(-1); expect(m.x).toBe(0); expect(m.y).toBe(0);
  });
  it('inverse kinematics of pure forward gives equal wheel speeds', () => {
    const w = inverseKinematics({ x: 1, y: 0, theta: 0 });
    expect(w[FL]).toBeCloseTo(1 / ROBOT.wheelRadius); expect(w[FR]).toBeCloseTo(w[FL]); expect(w[BL]).toBeCloseTo(w[FL]); expect(w[BR]).toBeCloseTo(w[FL]);
  });
  it('accelerates forward from rest under full forward effort', () => {
    const a = driveAcceleration({ x: 0, y: 0, theta: 0 }, { x: 1, y: 0, theta: 0 }, 12, true);
    expect(a.x).toBeGreaterThan(2); expect(Math.abs(a.y)).toBeLessThan(1e-9); expect(Math.abs(a.theta)).toBeLessThan(1e-9);
  });
  it('coasting decelerates against motion', () => {
    const a = driveAcceleration({ x: 1, y: 0, theta: 0 }, { x: 0, y: 0, theta: 0 }, 12, false);
    expect(a.x).toBeLessThan(0);
  });
  it('reaches a steady state below the configured max velocity', () => {
    let v = 0;
    for (let i = 0; i < 500; i++) v += driveAcceleration({ x: v, y: 0, theta: 0 }, { x: 1, y: 0, theta: 0 }, 12, true).x * 0.02;
    expect(v).toBeGreaterThan(1.0); expect(v).toBeLessThanOrEqual(1.5 + 1e-6);
  });
});
