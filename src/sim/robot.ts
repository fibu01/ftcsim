import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ROBOT, TICK, DRIVE, GAME } from '../config';
import { SimMotor } from './motor';
import { driveAcceleration, powerKinematics, inverseKinematics, FL, FR, BL, BR, Motion } from './mecanum';
import { honeycomb, chain } from '../render/textures';
import { fault } from './faults';
import { Rng } from '../util/rng';

const IZZ = ROBOT.mass * (ROBOT.length ** 2 + ROBOT.width ** 2) / 12;

export class Robot {
  body!: RAPIER.RigidBody;
  group = new THREE.Group();
  motors = {
    frontLeft: new SimMotor('frontLeft', -1), frontRight: new SimMotor('frontRight'),
    backLeft: new SimMotor('backLeft', -1), backRight: new SimMotor('backRight'),
    lift: new SimMotor('lift'), intake: new SimMotor('intake'),
  };
  liftPos = 0; // meters
  intakeAngle = 0;
  heldBall: RAPIER.RigidBody | null = null;
  // Capture animation: ball moves from the intake mouth up to the hold point over CAPTURE_TIME.
  capture: { from: THREE.Vector3; t: number } | null = null;
  wantLaunch = false;
  yaw = 0; yawRate = 0;
  wheelAngles = [0, 0, 0, 0];
  private wheels: THREE.Group[] = [];
  private carriage!: THREE.Group;
  private chainMat!: THREE.MeshStandardMaterial;
  private intakeRoller!: THREE.Group;
  private rng = new Rng(7);
  dragIndicator = 0; driftIndicator = 0;
  onRamp = false;
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();

  constructor(world: RAPIER.World, start: { x: number; z: number; yaw: number }) {
    this.attach(world, start);
    this.motors.frontLeft.setDirection('REVERSE');
    this.motors.backLeft.setDirection('REVERSE');
    this.buildVisual();
  }

  attach(world: RAPIER.World, start: { x: number; z: number; yaw: number }) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, ROBOT.wheelRadius + 0.01, start.z)
      .setRotation(yawQuat(start.yaw))
      .enabledRotations(false, true, false)
      .setLinearDamping(0).setAngularDamping(0).setCcdEnabled(true);
    this.body = world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid(ROBOT.length / 2, ROBOT.wheelRadius, ROBOT.trackWidth / 2 + ROBOT.wheelWidth / 2)
      .setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0).setMass(ROBOT.mass);
    world.createCollider(col, this.body);
    this.updateYaw();
  }

  reset() {
    for (const m of Object.values(this.motors)) { m.setPower(0); m.setMode('STOP_AND_RESET_ENCODER'); m.setMode('RUN_WITHOUT_ENCODER'); }
    this.liftPos = 0; this.heldBall = null; this.capture = null; this.rng = new Rng(7);
  }

  // body-frame velocity: x forward, y left, theta ccw
  bodyVelocity(): Motion {
    const lv = this.body.linvel(), av = this.body.angvel();
    const yaw = this.yaw;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);     // forward in world
    const lx = -Math.sin(yaw), lz = -Math.cos(yaw);    // left in world
    return { x: lv.x * fx + lv.z * fz, y: lv.x * lx + lv.z * lz, theta: av.y };
  }

  updateYaw() {
    const q = this.body.rotation();
    this.tmpQ.set(q.x, q.y, q.z, q.w);
    this.tmpV.set(1, 0, 0).applyQuaternion(this.tmpQ);
    this.yaw = Math.atan2(-this.tmpV.z, this.tmpV.x);
    this.yawRate = this.body.angvel().y;
  }

  step(dt: number, voltage: number) {
    this.updateYaw();
    const m = this.motors;
    const drag = fault('bindingDrag'), ramp = fault('rampDrift'), rev = fault('motorReversed'), enc = fault('encoderDropout'), jam = fault('intakeJam');
    m.backRight.reversedFault = rev.on;
    m.frontLeft.encoderFrozen = enc.on;

    const p = [m.frontLeft.effectivePower(), m.frontRight.effectivePower(), m.backLeft.effectivePower(), m.backRight.effectivePower()];
    // Binding drag: the left side loses effort in proportion to severity, so the robot pulls left.
    if (drag.on) { p[FL] *= 1 - 0.6 * drag.severity; p[BL] *= 1 - 0.6 * drag.severity; }
    const effort = powerKinematics(p);
    const brake = Object.values(m).slice(0, 4).some(x => x.zeroPowerBehavior === 'BRAKE');
    const vel = this.bodyVelocity();
    const acc = driveAcceleration(vel, effort, voltage, brake);

    // Ramp drift: on the ramp, heading wanders. Seeded so replays match.
    const pos = this.body.translation();
    this.onRamp = pos.y > ROBOT.wheelRadius + 0.03;
    if (ramp.on && this.onRamp) acc.theta += (this.rng.next() - 0.35) * 30 * ramp.severity;

    // Pitch and roll are locked, so no out-of-plane terms.
    const yaw = this.yaw;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw), lx = -Math.sin(yaw), lz = -Math.cos(yaw);
    const F = { x: ROBOT.mass * (acc.x * fx + acc.y * lx), y: 0, z: ROBOT.mass * (acc.x * fz + acc.y * lz) };
    this.body.resetForces(true); this.body.resetTorques(true);
    this.body.addForce(F, true);
    this.body.addTorque({ x: 0, y: IZZ * acc.theta, z: 0 }, true);

    // Encoders follow the real body motion.
    const w = inverseKinematics(vel);
    const list = [m.frontLeft, m.frontRight, m.backLeft, m.backRight];
    list.forEach((mo, i) => { mo.angularVelocity = w[i]; mo.integrate(dt); this.wheelAngles[i] += w[i] * dt; });

    // Indicators for telemetry.
    const leftV = (w[FL] + w[BL]) / 2, rightV = (w[FR] + w[BR]) / 2;
    const highPower = Math.abs(effort.x) > 0.5;
    this.dragIndicator = highPower ? Math.abs(leftV - rightV) / (Math.abs(leftV) + Math.abs(rightV) + 1e-6) : 0;
    this.driftIndicator = Math.abs(effort.theta) < 0.05 && Math.abs(effort.x) + Math.abs(effort.y) > 0.3 ? Math.abs(vel.theta) : 0;

    // Lift
    const lp = m.lift.effectivePower();
    this.liftPos = Math.max(0, Math.min(ROBOT.liftTravel, this.liftPos + lp * ROBOT.liftSpeed * dt));
    m.lift.angularVelocity = (lp * ROBOT.liftSpeed) / 0.02; m.lift.integrate(dt);

    // Intake
    const ip = jam.on ? 0 : m.intake.effectivePower();
    m.intake.angularVelocity = ip * 60; m.intake.integrate(dt);
    this.intakeAngle += ip * 60 * dt;
    void DRIVE; void TICK;
  }

  intakeActive() { return !fault('intakeJam').on && this.motors.intake.effectivePower() > 0.2; }
  // Robot-local point (x forward, y up, z right) to world.
  localToWorld(x: number, y: number, z: number): THREE.Vector3 {
    const p = this.body.translation(), c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return new THREE.Vector3(p.x + c * x + s * z, p.y - ROBOT.wheelRadius + y, p.z - s * x + c * z);
  }
  worldToLocal(w: THREE.Vector3): THREE.Vector3 {
    const p = this.body.translation(), c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const dx = w.x - p.x, dz = w.z - p.z;
    return new THREE.Vector3(c * dx - s * dz, w.y - (p.y - ROBOT.wheelRadius), s * dx + c * dz);
  }
  // Bearing (rad, ccw positive) and distance from the robot to a world point.
  bearingTo(w: THREE.Vector3): { bearing: number; distance: number } {
    const l = this.worldToLocal(w);
    return { bearing: Math.atan2(-l.z, l.x), distance: Math.hypot(l.x, l.z) };
  }
  intakePoint(): THREE.Vector3 {
    const p = this.body.translation();
    return new THREE.Vector3(p.x + Math.cos(this.yaw) * (ROBOT.length / 2 + 0.06), GAME.pollenRadius, p.z - Math.sin(this.yaw) * (ROBOT.length / 2 + 0.06));
  }
  holdPoint(): THREE.Vector3 { return this.localToWorld(0.05, ROBOT.wheelRadius * 2 + 0.12 + this.liftPos, 0); }
  // Where the held ball is right now, following the capture animation.
  heldBallPoint(): THREE.Vector3 {
    const hold = this.worldToLocal(this.holdPoint());
    if (!this.capture) return this.holdPoint();
    const k = Math.min(1, this.capture.t);
    const e = k * k * (3 - 2 * k);
    const l = this.capture.from.clone().lerp(hold, e);
    // Arc: dip under the plate then rise behind the intake
    l.y += Math.sin(e * Math.PI) * 0.03;
    return this.localToWorld(l.x, l.y, l.z);
  }
  launchVelocity(): THREE.Vector3 {
    const v = GAME.launchSpeed;
    return new THREE.Vector3(Math.cos(this.yaw) * v * 0.8, v * 0.6, -Math.sin(this.yaw) * v * 0.8);
  }

  syncVisual(alpha: number) {
    void alpha;
    const p = this.body.translation(), q = this.body.rotation();
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    this.wheels.forEach((w, i) => { w.rotation.z = -this.wheelAngles[i]; });
    this.carriage.position.y = this.liftPos;
    this.chainMat.map!.offset.y = (this.liftPos / 0.05) % 1;
    this.intakeRoller.rotation.z = -this.intakeAngle;
  }

  private buildVisual() {
    const g = this.group;
    const hc = honeycomb();
    const panel = new THREE.MeshStandardMaterial({ map: hc.map, roughnessMap: hc.roughnessMap, metalness: 0.75, roughness: 0.45 });
    const alu = new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 0.6, roughness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.8 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xf5a300, metalness: 0.3, roughness: 0.5, emissive: 0x331f00 });
    const L = ROBOT.length, W = ROBOT.width, base = -ROBOT.wheelRadius; // ground in local y

    const plate = new THREE.Mesh(new THREE.BoxGeometry(L, 0.012, W), panel);
    plate.position.y = base + 0.056; plate.castShadow = plate.receiveShadow = true; g.add(plate);
    // Side rails (channel) along x
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, 0.03), alu);
      rail.position.set(0, base + 0.082, s * (W / 2 - 0.015)); rail.castShadow = true; g.add(rail);
    }
    // Front and back cross bars
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, W - 0.06), alu);
      bar.position.set(s * (L / 2 - 0.015), base + 0.082, 0); g.add(bar);
    }
    // Control hub and battery
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.14), black);
    hub.position.set(-0.08, base + 0.077, 0.08); g.add(hub);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.012), new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 3 }));
    led.position.set(-0.04, base + 0.094, 0.14); g.add(led);
    const batt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), accent);
    batt.position.set(-0.1, base + 0.082, -0.1); g.add(batt);

    // Wheels
    const positions: [number, number, number][] = [
      [ROBOT.wheelbase / 2, 0, -ROBOT.trackWidth / 2], // FL (left = -z)
      [ROBOT.wheelbase / 2, 0, ROBOT.trackWidth / 2],  // FR
      [-ROBOT.wheelbase / 2, 0, -ROBOT.trackWidth / 2], // BL
      [-ROBOT.wheelbase / 2, 0, ROBOT.trackWidth / 2], // BR
    ];
    positions.forEach((p, i) => {
      const w = this.mecanumWheel(i === FL || i === BR ? 1 : -1, alu, black);
      w.position.set(p[0], 0, p[2]);
      g.add(w); this.wheels.push(w);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), alu);
      axle.rotation.x = Math.PI / 2; axle.position.set(p[0], 0, p[2] - Math.sign(p[2]) * 0.03); g.add(axle);
    });

    // Elevator: two rails, chain, carriage
    const railH = ROBOT.liftTravel + 0.12;
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.025, railH, 0.025), alu);
      r.position.set(-0.02, base + 0.062 + railH / 2, s * 0.08); r.castShadow = true; g.add(r);
    }
    this.chainMat = new THREE.MeshStandardMaterial({ map: chain(), metalness: 0.8, roughness: 0.4 });
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.02, railH - 0.02), this.chainMat);
    ch.position.set(-0.035, base + 0.062 + railH / 2, 0); ch.rotation.y = -Math.PI / 2; g.add(ch);
    for (const y of [0.01, railH - 0.01]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), black);
      sp.rotation.x = Math.PI / 2; sp.position.set(-0.035, base + 0.062 + y, 0); g.add(sp);
    }
    this.carriage = new THREE.Group();
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.2), panel);
    car.position.set(0.01, base + 0.112, 0); car.castShadow = true; this.carriage.add(car);
    // Launcher: two flywheels on the carriage
    for (const s of [-1, 1]) {
      const fw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 24), accent);
      fw.rotation.x = Math.PI / 2; fw.position.set(0.09, base + 0.142, s * 0.075); this.carriage.add(fw);
    }
    g.add(this.carriage);

    // Intake roller at the front. Group spins about its local Z (the axle, left-right in robot frame).
    const rollerG = new THREE.Group();
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(ROBOT.intakeRadius, ROBOT.intakeRadius, W - 0.1, 20), black);
    roller.rotation.x = Math.PI / 2; rollerG.add(roller);
    for (let k = 0; k < 6; k++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, W - 0.1), accent);
      const a = (k / 6) * Math.PI * 2;
      rib.position.set(Math.cos(a) * ROBOT.intakeRadius, Math.sin(a) * ROBOT.intakeRadius, 0);
      rib.rotation.z = a; rollerG.add(rib);
    }
    rollerG.position.set(L / 2 + 0.045, base + 0.05, 0);
    this.intakeRoller = rollerG; g.add(rollerG);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.02), alu);
      arm.position.set(L / 2 + 0.02, base + 0.05, s * (W / 2 - 0.04)); g.add(arm);
    }
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  private mecanumWheel(rollerSign: number, alu: THREE.Material, black: THREE.Material): THREE.Group {
    const w = new THREE.Group();
    const r = ROBOT.wheelRadius;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, ROBOT.wheelWidth, 24), alu);
    hub.rotation.x = Math.PI / 2; w.add(hub);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, ROBOT.wheelWidth * 0.6, 24), black);
    rim.rotation.x = Math.PI / 2; w.add(rim);
    const rollerGeo = new THREE.CapsuleGeometry(r * 0.22, ROBOT.wheelWidth * 0.9, 4, 10);
    const rollerMat = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.9, metalness: 0.05 });
    const n = 8;
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2;
      const m = new THREE.Mesh(rollerGeo, rollerMat);
      const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
      m.position.copy(radial).multiplyScalar(r * 0.78);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), phi);
      const tilt = new THREE.Quaternion().setFromAxisAngle(radial, rollerSign * Math.PI / 4);
      m.quaternion.copy(tilt.multiply(q));
      w.add(m);
    }
    return w;
  }
}

export function yawQuat(yaw: number) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}
