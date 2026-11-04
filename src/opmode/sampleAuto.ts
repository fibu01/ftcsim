import { Robot } from '../sim/robot';
import { Simulation } from '../sim/world';
import * as THREE from 'three';

// Built-in autonomous (PRD scenario 2): find POLLEN, intake it, turn to the HIVE, launch, park.
// Uses what a student OpMode would have: IMU yaw, encoders, a vision bearing to a target, and time.
// Phase 2 replaces this with the pasted Java autonomous.
type Step = 'seek' | 'collect' | 'aimHive' | 'approach' | 'launch' | 'park' | 'done';
let step: Step = 'seek'; let stepTime = 0; let lastTick = -1;

function drive(r: Robot, axial: number, lateral: number, yaw: number) {
  let fl = axial + lateral + yaw, fr = axial - lateral - yaw, bl = axial - lateral + yaw, br = axial + lateral - yaw;
  const max = Math.max(1, Math.abs(fl), Math.abs(fr), Math.abs(bl), Math.abs(br));
  r.motors.frontLeft.setPower(fl / max); r.motors.frontRight.setPower(fr / max);
  r.motors.backLeft.setPower(bl / max); r.motors.backRight.setPower(br / max);
}

// Vision stand-in: nearest free POLLEN in a 70 degree cone ahead, as bearing and distance.
function seePollen(r: Robot, sim: Simulation) {
  let best: { bearing: number; distance: number } | null = null;
  for (const b of sim.field.balls) {
    if (b.held || b.kind !== 'POLLEN' || b.scored) continue;
    const p = b.body.translation();
    const v = r.bearingTo(new THREE.Vector3(p.x, p.y, p.z));
    if (Math.abs(v.bearing) < 0.61 && (!best || v.distance < best.distance)) best = v;
  }
  return best;
}

export function sampleAuto(r: Robot, sim: Simulation) {
  if (sim.tick < lastTick || sim.tick === 0) { step = 'seek'; stepTime = 0; }
  lastTick = sim.tick; stepTime += 0.02;
  const turnTo = (bearing: number) => Math.max(-0.6, Math.min(0.6, -bearing * 1.6)); // yaw power is clockwise positive
  r.wantLaunch = false;
  if (sim.matchTime > 24 && step !== 'park' && step !== 'done') { step = 'park'; stepTime = 0; } // leave time to park
  switch (step) {
    case 'seek': {
      const t = seePollen(r, sim);
      r.motors.intake.setPower(1);
      if (!t) { drive(r, 0, 0, 0.35); if (stepTime > 6) step = 'park'; break; } // scan
      drive(r, 0.55, 0, turnTo(t.bearing));
      if (r.heldBall) { step = 'collect'; stepTime = 0; }
      break;
    }
    case 'collect': { // keep rolling in while the ball travels up
      drive(r, 0, 0, 0); r.motors.intake.setPower(1);
      if (stepTime > 0.6) { step = 'aimHive'; stepTime = 0; r.motors.intake.setPower(0); }
      break;
    }
    case 'aimHive': {
      const h = r.bearingTo(sim.field.hiveCenter);
      drive(r, 0, 0, turnTo(h.bearing)); r.motors.lift.setPower(1);
      if (Math.abs(h.bearing) < 0.06) { step = 'approach'; stepTime = 0; }
      break;
    }
    case 'approach': {
      const h = r.bearingTo(sim.field.hiveCenter);
      // Hold a launch window 0.85 to 1.05 m out. Back up if the last cycle left us too close.
      const axial = h.distance > 1.05 ? 0.6 : h.distance < 0.85 ? -0.5 : 0;
      drive(r, axial, 0, turnTo(h.bearing)); r.motors.lift.setPower(1);
      if (axial === 0 && Math.abs(h.bearing) < 0.05 && Math.abs(r.yawRate) < 0.2 && r.liftPos > 0.4) { step = 'launch'; stepTime = 0; }
      break;
    }
    case 'launch': {
      drive(r, 0, 0, 0); r.motors.lift.setPower(0);
      if (stepTime > 0.3) r.wantLaunch = true;
      if (stepTime > 0.6) { step = 'seek'; stepTime = 0; } // go again until the clock says park
      break;
    }
    case 'park': { // back off toward the driver side and stop. Park zone is a placeholder. [confirm in manual]
      r.motors.lift.setPower(-1);
      const target = r.bearingTo(new THREE.Vector3(-1.2, 0, 1.2));
      drive(r, target.distance > 0.3 ? 0.5 : 0, 0, turnTo(target.bearing));
      if (target.distance <= 0.3) { step = 'done'; }
      break;
    }
    case 'done': drive(r, 0, 0, 0); r.motors.lift.setPower(0); break;
  }
}
