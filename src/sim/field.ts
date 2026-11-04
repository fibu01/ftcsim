import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FIELD, GAME } from '../config';
import { foamTile } from '../render/textures';
import { Rng } from '../util/rng';

// Placeholder BIOBUZZ layout. Every position and size here is [confirm in manual].
export interface Ball { body: RAPIER.RigidBody; mesh: THREE.Mesh; kind: 'POLLEN' | 'NECTAR'; held: boolean; scored: boolean }

export class Field {
  group = new THREE.Group();
  balls: Ball[] = [];
  hiveCount = 0;
  hiveTipped = false;
  private cell!: THREE.Group;
  private cellBody!: RAPIER.RigidBody;
  private cellAngle = 0;
  hiveCenter = new THREE.Vector3(FIELD.size / 2 - 0.45, 0.75, 0);
  rampCenter = new THREE.Vector3(0, 0, -0.9);
  flowers: THREE.Vector3[] = [];

  private world!: RAPIER.World;
  private physicsBuilders: (() => void)[] = [];

  constructor(world: RAPIER.World, private seed: number) {
    this.world = world;
    this.buildFloorAndWalls();
    this.buildRamp();
    this.buildFlowers();
    this.buildHive();
    this.spawnBalls();
    this.buildVenue();
  }

  // Recreate every physics body in a fresh world. Meshes stay. Called on reset for determinism.
  attach(world: RAPIER.World) {
    this.world = world;
    for (const b of this.physicsBuilders) b();
    const rng = new Rng(this.seed);
    for (const b of this.balls) {
      const r = b.kind === 'POLLEN' ? GAME.pollenRadius : GAME.nectarRadius;
      const [x, z] = ballSpot(b.kind, rng);
      b.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, r + 0.01, z).setLinearDamping(1.2).setAngularDamping(1.5));
      this.world.createCollider(RAPIER.ColliderDesc.ball(r).setFriction(0.6).setRestitution(0.05).setMass(0.07), b.body);
      b.held = false; b.scored = false;
    }
    this.hiveTipped = false; this.hiveCount = 0; this.cellAngle = 0;
  }

  private fixedBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0, rotZ = 0) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ));
    const build = () => {
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), b);
    };
    this.physicsBuilders.push(build); build();
  }

  private buildFloorAndWalls() {
    const S = FIELD.size, H = FIELD.wallHeight;
    this.fixedBox(0, -0.05, 0, S / 2 + 0.5, 0.05, S / 2 + 0.5);
    const tile = foamTile(); tile.repeat.set(S / FIELD.tile, S / FIELD.tile);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.95, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.group.add(floor);

    const poly = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ee, transparent: true, opacity: 0.22, roughness: 0.15, metalness: 0, transmission: 0, side: THREE.DoubleSide });
    const alu = new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 0.6, roughness: 0.55 });
    const line = new THREE.MeshStandardMaterial({ color: 0x22c6ff, emissive: 0x22c6ff, emissiveIntensity: 1.1 });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const cx = Math.cos(a) * (S / 2 + 0.01), cz = Math.sin(a) * (S / 2 + 0.01);
      this.fixedBox(cx, H / 2, cz, 0.02, H / 2, S / 2 + 0.02, -a);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.012, H, S), poly);
      wall.position.set(cx, H / 2, cz); wall.rotation.y = -a; this.group.add(wall);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, S + 0.04), alu);
      top.position.set(cx, H + 0.015, cz); top.rotation.y = -a; top.castShadow = true; this.group.add(top);
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, S + 0.04), alu);
      bottom.position.set(cx, 0.01, cz); bottom.rotation.y = -a; this.group.add(bottom);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, S - 0.1), line);
      glow.position.set(cx * 0.985, 0.025, cz * 0.985); glow.rotation.y = -a; this.group.add(glow);
    }
    // Corner posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 0.03, 0.05), alu);
      post.position.set(sx * (S / 2 + 0.01), (H + 0.03) / 2, sz * (S / 2 + 0.01)); post.castShadow = true; this.group.add(post);
    }
  }

  private buildRamp() {
    // Low plateau with two slopes, placeholder for a field obstacle. [confirm in manual]
    const c = this.rampCenter, h = 0.07, w = 1.2, top = 0.5, slope = 0.45;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d3137, roughness: 0.7, metalness: 0.2 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xffb000, emissiveIntensity: 1.2 });
    this.fixedBox(c.x, h / 2, c.z, top / 2, h / 2, w / 2);
    const plat = new THREE.Mesh(new THREE.BoxGeometry(top, h, w), mat); plat.position.set(c.x, h / 2, c.z); plat.castShadow = plat.receiveShadow = true; this.group.add(plat);
    const ang = Math.atan2(h, slope), len = Math.hypot(h, slope);
    for (const s of [-1, 1]) {
      const cx = c.x + s * (top / 2 + slope / 2), cy = h / 2;
      this.fixedBox(cx, cy - 0.015, c.z, len / 2, 0.02, w / 2, 0, -s * ang);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, w), mat);
      m.position.set(cx, cy - 0.015, c.z); m.rotation.z = -s * ang; m.castShadow = m.receiveShadow = true; this.group.add(m);
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, w), edge);
      e.position.set(c.x + s * top / 2, h + 0.004, c.z); this.group.add(e);
    }
  }

  private buildFlowers() {
    // FLOWERS: upright tubes that hold POLLEN and NECTAR. Six placeholders. [confirm in manual]
    const tube = new THREE.MeshPhysicalMaterial({ color: 0xb8f0d8, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0 });
    const basePlate = new THREE.MeshStandardMaterial({ color: 0x2b8a5a, roughness: 0.6 });
    const spots: [number, number][] = [[-1.3, 1.4], [-1.3, -1.4], [0.4, 1.4], [0.4, -1.4], [-0.5, -0.4], [1.1, -1.2]];
    for (const [x, z] of spots) {
      this.flowers.push(new THREE.Vector3(x, 0, z));
      const build = () => { const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.22, z)); this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.22, 0.09), b); };
      this.physicsBuilders.push(build); build();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.44, 24, 1, true), tube);
      t.position.set(x, 0.22, z); t.castShadow = true; this.group.add(t);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 24), basePlate);
      base.position.set(x, 0.01, z); this.group.add(base);
    }
  }

  private buildHive() {
    // HIVE with a CELL that TIPS when enough pieces are launched in. Placeholder geometry. [confirm in manual]
    const c = this.hiveCenter;
    const frame = new THREE.MeshStandardMaterial({ color: 0x8d9299, metalness: 0.85, roughness: 0.35 });
    const hex = new THREE.MeshStandardMaterial({ color: 0xffa21a, roughness: 0.5, metalness: 0.2, emissive: 0x3a2200, emissiveIntensity: 0.6 });
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, c.y, 0.04), frame);
      post.position.set(c.x, c.y / 2, c.z + sz * 0.35); post.castShadow = true; this.group.add(post);
      this.fixedBox(c.x, c.y / 2, c.z + sz * 0.35, 0.02, c.y / 2, 0.02);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.78), frame);
    beam.position.set(c.x, c.y, c.z); this.group.add(beam);
    // Cell: open basket on a pivot
    this.cell = new THREE.Group(); this.cell.position.copy(c);
    const floorM = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.6), hex); floorM.position.set(-0.05, 0.0, 0); this.cell.add(floorM);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.6), hex); back.position.set(0.12, 0.11, 0); this.cell.add(back);
    for (const sz of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.02), hex); side.position.set(-0.05, 0.11, sz * 0.3); this.cell.add(side); }
    this.cell.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(this.cell);
    const build = () => {
      this.cellBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.18, 0.01, 0.3).setTranslation(-0.05, 0, 0), this.cellBody);
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.01, 0.11, 0.3).setTranslation(0.12, 0.11, 0), this.cellBody);
      for (const sz of [-1, 1]) this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.18, 0.11, 0.01).setTranslation(-0.05, 0.11, sz * 0.3), this.cellBody);
    };
    this.physicsBuilders.push(build); build();
  }

  private spawnBalls() {
    const rng = new Rng(this.seed);
    const pollen = new THREE.MeshPhysicalMaterial({ color: 0xffd400, roughness: 0.35, metalness: 0, clearcoat: 0.6 });
    const nectar = new THREE.MeshPhysicalMaterial({ color: 0x7a3cff, roughness: 0.3, metalness: 0, clearcoat: 0.7 });
    const make = (kind: 'POLLEN' | 'NECTAR', x: number, z: number) => {
      const r = kind === 'POLLEN' ? GAME.pollenRadius : GAME.nectarRadius;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, r + 0.01, z).setLinearDamping(1.2).setAngularDamping(1.5));
      this.world.createCollider(RAPIER.ColliderDesc.ball(r).setFriction(0.6).setRestitution(0.05).setMass(0.07), body);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), kind === 'POLLEN' ? pollen : nectar);
      mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh);
      this.balls.push({ body, mesh, kind, held: false, scored: false });
    };
    for (let i = 0; i < GAME.pollenCount; i++) { const [x, z] = ballSpot('POLLEN', rng); make('POLLEN', x, z); }
    for (let i = 0; i < GAME.nectarCount; i++) { const [x, z] = ballSpot('NECTAR', rng); make('NECTAR', x, z); }
  }

  private buildVenue() {
    const S = FIELD.size;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.001; ground.receiveShadow = true; this.group.add(ground);
    const truss = new THREE.MeshStandardMaterial({ color: 0x3b3f45, metalness: 0.8, roughness: 0.5 });
    const bulb = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xfff2d0, emissiveIntensity: 6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5.5, 0.15), truss);
      t.position.set(sx * (S / 2 + 1.2), 2.75, sz * (S / 2 + 1.2)); this.group.add(t);
    }
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, S + 2.55), truss);
      beam.position.set(sx * (S / 2 + 1.2), 5.5, 0); this.group.add(beam);
      for (let i = -2; i <= 2; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), bulb);
        b.position.set(sx * (S / 2 + 1.2), 5.35, i * 1.2); this.group.add(b);
      }
    }
    // Driver station table on the -x side
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 1.8), new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.8 }));
    table.position.set(-S / 2 - 0.6, 0.45, 0); table.castShadow = true; this.group.add(table);
  }

  // Count pieces in the CELL and tip it when the threshold is reached.
  step(dt: number) {
    const c = this.hiveCenter;
    let inCell = 0;
    for (const b of this.balls) {
      if (b.held) continue;
      const p = b.body.translation();
      const inside = Math.abs(p.x - (c.x - 0.05)) < 0.18 && Math.abs(p.z - c.z) < 0.3 && p.y > c.y - 0.05 && p.y < c.y + 0.3;
      if (inside) inCell++;
      if (inside && !b.scored) { b.scored = true; }
    }
    this.hiveCount = inCell;
    if (!this.hiveTipped && inCell >= GAME.hiveTipThreshold) this.hiveTipped = true;
    const target = this.hiveTipped ? -1.1 : 0;
    this.cellAngle += (target - this.cellAngle) * Math.min(1, dt * 4);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.cellAngle);
    this.cellBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    this.cell.quaternion.copy(q);
  }

  syncVisual() {
    for (const b of this.balls) {
      const p = b.body.translation(), q = b.body.rotation();
      b.mesh.position.set(p.x, p.y, p.z); b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
}

// Spawn areas keep the start lane (z near 0.6 on the -x side) clear.
export function ballSpot(kind: 'POLLEN' | 'NECTAR', rng: Rng): [number, number] {
  return kind === 'POLLEN' ? [rng.range(-0.6, 0.9), rng.range(-1.4, 0.2)] : [rng.range(-1.0, -0.3), rng.range(-1.2, 0.0)];
}
