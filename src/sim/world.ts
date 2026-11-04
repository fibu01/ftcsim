import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TICK, FIELD, GAME } from '../config';
import { Robot } from './robot';
import { Field } from './field';
import { GamepadState, emptyGamepad } from './gamepad';
import { FAULTS } from './faults';
import { ROBOT } from '../config';
import { Rng } from '../util/rng';

const CAPTURE_TIME = 0.4; // seconds for a ball to travel from the roller to the hold point

export interface LogEntry { t: number; level: 'info' | 'warn' | 'error'; msg: string }
export type RunState = 'stopped' | 'running' | 'paused';
export type Mode = 'teleop' | 'auto' | 'match';
export type Phase = 'AUTO' | 'TRANSITION' | 'TELEOP' | 'DONE';
// Manual TU07 10.4: AUTO 30 s, 8 s transition, TELEOP 2:00.
export const AUTO_SECONDS = 30, TRANSITION_SECONDS = 8, TELEOP_SECONDS = 120;

export const START = { x: -FIELD.size / 2 + 0.5, z: 0.9, yaw: 0 }; // lane along z = 0.9 is clear of flowers and the hive posts

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
  private faultRng = new Rng(3); private nextGamepadDrop = 6; private padDownUntil = -1; private nextHubDrop = 9;
  seed = 1;
  private acc = 0;
  private prevFaults = FAULTS.map(f => f.on);
  private launchLatch = false;
  private scoredCount = 0;
  opmode: (g: GamepadState, r: Robot) => void = () => {};
  autoOpmode: (r: Robot, sim: Simulation) => void = () => {};
  mode: Mode = 'teleop';
  phase: Phase = 'TELEOP';
  matchTime = 0; // seconds since the current phase started

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

  run() {
    if (this.state === 'running') return;
    if (this.state === 'stopped') {
      this.phase = this.mode === 'teleop' ? 'TELEOP' : 'AUTO'; this.matchTime = 0;
      this.info(this.mode === 'match' ? 'Match start: AUTO' : this.mode === 'auto' ? 'Autonomous started' : 'TeleOp started');
    }
    this.state = 'running';
  }
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
    this.faultRng = new Rng(3); this.nextGamepadDrop = 6; this.padDownUntil = -1; this.nextHubDrop = 9;
    this.state = 'stopped'; this.phase = this.mode === 'teleop' ? 'TELEOP' : 'AUTO'; this.matchTime = 0; this.info('Reset');
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
    // Gamepad disconnect: the driver station drops the pad for a moment, sticks read zero.
    const gd = FAULTS.find(f => f.id === 'gamepadDisconnect')!, hd = FAULTS.find(f => f.id === 'hubDisconnect')!;
    if (gd.on && this.time >= this.nextGamepadDrop) { this.padDownUntil = this.time + 0.8 + 1.5 * gd.severity; this.nextGamepadDrop = this.time + 5 + this.faultRng.range(0, 8) * (1.2 - gd.severity); this.warn('Gamepad disconnected'); }
    const pad = this.time < this.padDownUntil ? emptyGamepad() : this.gamepad1;
    if (hd.on && this.time >= this.nextHubDrop && this.robot.hubDown <= 0) { this.robot.hubDown = 1 + 2 * hd.severity; this.robot.hubDownReason = 'HUB DISCONNECT'; this.nextHubDrop = this.time + 6 + this.faultRng.range(0, 10) * (1.2 - hd.severity); }
    const hubWasDown = this.robot.hubDown > 0;
    if (this.phase === 'AUTO') this.autoOpmode(this.robot, this);
    else if (this.phase === 'TELEOP') this.opmode(pad, this.robot);
    else for (const m of Object.values(this.robot.motors)) m.setPower(0); // TRANSITION and DONE: OpMode stopped, motors off
    this.robot.step(TICK);
    if (this.robot.hubDown > 0 && !hubWasDown) this.error(`${this.robot.hubDownReason}: hub reset, motors off for ${this.robot.hubDown.toFixed(1)} s`);
    if (this.robot.hubDown <= 0 && hubWasDown) this.info('Hub back');
    this.matchTime += TICK;
    if (this.phase === 'AUTO' && this.matchTime >= AUTO_SECONDS) {
      if (this.mode === 'match') { this.phase = 'TRANSITION'; this.matchTime = 0; this.info(`AUTO over. Autonomous OpMode stopped. ${TRANSITION_SECONDS} s until TELEOP.`); }
      else { this.phase = 'DONE'; this.stop(); this.info(`Autonomous over. Score ${this.score()}`); }
    } else if (this.phase === 'TRANSITION' && this.matchTime >= TRANSITION_SECONDS) {
      this.phase = 'TELEOP'; this.matchTime = 0; this.info('TELEOP. Drivers take control.');
    } else if (this.phase === 'TELEOP' && this.mode === 'match' && this.matchTime >= TELEOP_SECONDS) {
      this.phase = 'DONE'; this.stop(); this.info(`Match over. Score ${this.score()} (${this.field.hiveCount} in CELL, HIVE ${this.field.hiveTipped ? 'tipped' : 'not tipped'}; no LEAVE, PARK, FLOWER or GARDEN scoring yet)`);
    }
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
      if (r.capture) r.capture.t += TICK / CAPTURE_TIME;
      if (r.capture && r.capture.t >= 1) r.capture = null;
      const h = r.heldBallPoint();
      r.heldBall.setNextKinematicTranslation({ x: h.x, y: h.y, z: h.z });
      if (r.wantLaunch && !this.launchLatch && !r.capture) {
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
        const w = new THREE.Vector3(p.x, p.y, p.z);
        const l = r.worldToLocal(w);
        // In front of the roller, within reach, low enough to be on the floor.
        const inMouth = l.x > ROBOT.length / 2 - 0.02 && l.x < ROBOT.length / 2 + 0.16 && Math.abs(l.z) < 0.16 && p.y < 0.16;
        if (inMouth) {
          b.held = true; b.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          r.heldBall = b.body; r.capture = { from: l, t: 0 }; this.info('Intake: got ' + b.kind); break;
        }
        // Roller pulls balls in from a short cone in front, so you don't have to hit them dead on.
        const d = Math.hypot(p.x - ip.x, p.z - ip.z);
        if (d < 0.4 && l.x > 0 && Math.abs(l.z) < 0.3 && p.y < 0.16) {
          const v = b.body.linvel(), k = 0.25, speed = 1.0;
          const tx = ((ip.x - p.x) / d) * speed, tz = ((ip.z - p.z) / d) * speed;
          b.body.setLinvel({ x: v.x + (tx - v.x) * k, y: v.y, z: v.z + (tz - v.z) * k }, true);
        }
      }
    }
    this.launchLatch = r.wantLaunch;
  }

  // Table 10-2 points for what the sim can count today: pieces in the CELL and tips. LEAVE, PARK, FLOWER and GARDEN scoring need the real layout (roadmap item 7).
  score() { return this.field.hiveCount * GAME.pointsPerPieceInCell + (this.field.hiveTipped ? GAME.pointsPerHiveTip : 0); }

  syncVisual() { this.robot.syncVisual(0); this.field.syncVisual(); }

  telemetry(): [string, string][] {
    const r = this.robot, m = r.motors;
    const rows: [string, string][] = [
      ['t', this.time.toFixed(2) + ' s  tick ' + this.tick],
      ['phase', this.phase + (this.phase === 'DONE' ? '' : `  ${Math.max(0, (this.phase === 'AUTO' ? AUTO_SECONDS : this.phase === 'TRANSITION' ? TRANSITION_SECONDS : TELEOP_SECONDS) - this.matchTime).toFixed(0)} s left`)],
      ['score', `${this.score()}  (tips and CELL only)`],
      ['IMU yaw', (r.imuYaw() * 180 / Math.PI).toFixed(1) + ' deg  (true ' + (r.yaw * 180 / Math.PI).toFixed(1) + ')'],
      ['yaw rate', (r.yawRate * 180 / Math.PI).toFixed(1) + ' deg/s'],
    ];
    for (const mo of [m.frontLeft, m.frontRight, m.backLeft, m.backRight])
      rows.push([mo.name, `pwr ${mo.getPower().toFixed(2)}  vel ${mo.getVelocity().toFixed(0)}  enc ${mo.getCurrentPosition()}`]);
    rows.push(['drift', r.driftIndicator > 0.15 ? `WARN ${(r.driftIndicator * 180 / Math.PI).toFixed(0)} deg/s uncommanded` : 'ok']);
    rows.push(['drag', r.dragIndicator > 0.12 ? `WARN L/R mismatch ${(r.dragIndicator * 100).toFixed(0)}%` : 'ok']);
    rows.push(['intake', r.heldBall ? 'holding' : r.intakeActive() ? 'running' : 'idle']);
    rows.push(['lift', (r.liftPos * 1000).toFixed(0) + ' mm  enc ' + m.lift.getCurrentPosition()]);
    rows.push(['hive', `${this.field.hiveCount} in cell${this.field.hiveTipped ? '  TIPPED' : ''}`]);
    rows.push(['battery', `${r.voltage.toFixed(2)} V  ${r.amps.toFixed(1)} A` + (r.hubDown > 0 ? `  ${r.hubDownReason}` : '')]);
    return rows;
  }
}
