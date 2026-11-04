import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TICK, FIELD, GAME } from '../config';
import { Robot } from './robot';
import { Field } from './field';
import { GamepadState, emptyGamepad } from './gamepad';
import { FAULTS } from './faults';

export interface LogEntry { t: number; level: 'info' | 'warn' | 'error'; msg: string }
export type RunState = 'stopped' | 'running' | 'paused';

export const START = { x: -FIELD.size / 2 + 0.5, z: 0.6, yaw: 0 };

export class Simulation {
  world: RAPIER.World;
  robot: Robot;
  field: Field;
  scene = new THREE.Group();
  time = 0; tick = 0;
  state: RunState = 'stopped';
  speed = 1;
  log: LogEntry[] = [];
  gamepad1: GamepadState = emptyGamepad();
  voltage = 12.6;
  seed = 1;
  private acc = 0;
  private prevFaults = FAULTS.map(f => f.on);
  private launchLatch = false;
  private scoredCount = 0;
  opmode: (g: GamepadState, r: Robot) => void = () => {};

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = TICK;
    this.field = new Field(this.world, this.seed);
    this.robot = new Robot(this.world, START);
    this.scene.add(this.field.group, this.robot.group);
    this.info('Simulator ready. Press Run.');
  }

  info(msg: string) { this.push('info', msg); }
  warn(msg: string) { this.push('warn', msg); }
  error(msg: string) { this.push('error', msg); }
  private push(level: LogEntry['level'], msg: string) {
    this.log.push({ t: this.time, level, msg });
    if (this.log.length > 400) this.log.shift();
  }

  run() { if (this.state !== 'running') { this.state = 'running'; this.info('OpMode started'); } }
  pause() { if (this.state === 'running') { this.state = 'paused'; this.info('Paused'); } }
  stop() { this.state = 'stopped'; for (const m of Object.values(this.robot.motors)) m.setPower(0); this.info('OpMode stopped'); }
  stepOnce() { this.state = 'paused'; this.tickOnce(); }

  // Rebuild the physics world so a reset run replays bit for bit.
  reset() {
    this.world.free();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = TICK;
    this.field.attach(this.world);
    this.robot.attach(this.world, START);
    this.robot.reset();
    this.time = 0; this.tick = 0; this.acc = 0; this.scoredCount = 0; this.launchLatch = false;
    this.state = 'stopped'; this.info('Reset');
  }

  // Advance by wall-clock dt, scaled by speed. Fixed 20 ms ticks.
  advance(dt: number) {
    if (this.state !== 'running') return;
    this.acc += Math.min(dt, 0.1) * this.speed;
    let n = 0;
    while (this.acc >= TICK && n < 25) { this.tickOnce(); this.acc -= TICK; n++; }
  }

  private tickOnce() {
    FAULTS.forEach((f, i) => {
      if (f.on !== this.prevFaults[i]) { this.warn(`Fault ${f.on ? 'ON' : 'off'}: ${f.label}`); this.prevFaults[i] = f.on; }
    });
    this.opmode(this.gamepad1, this.robot);
    this.robot.step(TICK, this.voltage);
    this.handleBalls();
    this.field.step(TICK);
    this.world.step();
    this.time += TICK; this.tick++;
    if (this.robot.onRamp && this.tick % 25 === 0) this.info('On the ramp');
    if (this.field.hiveTipped && this.scoredCount < 1) { this.scoredCount = 1; this.info('HIVE TIPPED'); }
  }

  private handleBalls() {
    const r = this.robot;
    if (r.heldBall) {
      const h = r.holdPoint();
      r.heldBall.setNextKinematicTranslation({ x: h.x, y: h.y, z: h.z });
      if (r.wantLaunch && !this.launchLatch) {
        const v = r.launchVelocity();
        r.heldBall.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        r.heldBall.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
        const ball = this.field.balls.find(b => b.body === r.heldBall)!; ball.held = false;
        r.heldBall = null; this.info('Launched ' + ball.kind);
      }
    } else if (r.intakeActive()) {
      const ip = r.intakePoint();
      for (const b of this.field.balls) {
        if (b.held) continue;
        const p = b.body.translation();
        if (Math.hypot(p.x - ip.x, p.z - ip.z) < 0.13 && p.y < 0.2) {
          b.held = true; b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          r.heldBall = b.body; this.info('Intake: got ' + b.kind); break;
        }
      }
    }
    this.launchLatch = r.wantLaunch;
  }

  syncVisual() { this.robot.syncVisual(0); this.field.syncVisual(); }

  telemetry(): [string, string][] {
    const r = this.robot, m = r.motors;
    const rows: [string, string][] = [
      ['t', this.time.toFixed(2) + ' s  tick ' + this.tick],
      ['IMU yaw', (r.yaw * 180 / Math.PI).toFixed(1) + ' deg'],
      ['yaw rate', (r.yawRate * 180 / Math.PI).toFixed(1) + ' deg/s'],
    ];
    for (const mo of [m.frontLeft, m.frontRight, m.backLeft, m.backRight])
      rows.push([mo.name, `pwr ${mo.getPower().toFixed(2)}  vel ${mo.getVelocity().toFixed(0)}  enc ${mo.getCurrentPosition()}`]);
    rows.push(['drift', r.driftIndicator > 0.15 ? `WARN ${(r.driftIndicator * 180 / Math.PI).toFixed(0)} deg/s uncommanded` : 'ok']);
    rows.push(['drag', r.dragIndicator > 0.12 ? `WARN L/R mismatch ${(r.dragIndicator * 100).toFixed(0)}%` : 'ok']);
    rows.push(['intake', r.heldBall ? 'holding' : r.intakeActive() ? 'running' : 'idle']);
    rows.push(['lift', (r.liftPos * 1000).toFixed(0) + ' mm  enc ' + m.lift.getCurrentPosition()]);
    rows.push(['hive', `${this.field.hiveCount} in cell${this.field.hiveTipped ? '  TIPPED' : ''}`]);
    rows.push(['voltage', this.voltage.toFixed(1) + ' V']);
    return rows;
  }
}
