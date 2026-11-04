import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FIELD } from '../config';
import { Robot } from '../sim/robot';

export type CameraMode = 'orbit' | 'chase' | 'driver' | 'robot';
export type Quality = 'high' | 'low';

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'orbit';
  quality: Quality = 'high';
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private orbit: OrbitControls;
  private chasePos = new THREE.Vector3();
  private lookAt = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene.background = new THREE.Color(0x07080a);
    this.scene.fog = new THREE.FogExp2(0x07080a, 0.045);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
    this.camera.position.set(-3.2, 2.4, 3.0);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.target.set(0, 0.2, 0); this.orbit.enableDamping = true; this.orbit.maxPolarAngle = Math.PI / 2 - 0.02; this.orbit.minDistance = 0.5; this.orbit.maxDistance = 12;
    this.lights();
    const rp = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 1.0);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(rp); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private lights() {
    const S = FIELD.size;
    this.scene.add(new THREE.HemisphereLight(0x3a4250, 0x0a0a0c, 0.35));
    const key = new THREE.SpotLight(0xfff1dc, 110, 18, Math.PI / 5, 0.5, 1.6);
    key.position.set(2.5, 6, 2.5); key.target.position.set(0, 0, 0); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1; key.shadow.camera.far = 14;
    this.scene.add(key, key.target);
    const fill = new THREE.SpotLight(0xcfe2ff, 50, 18, Math.PI / 4, 0.6, 1.6);
    fill.position.set(-3, 5.5, -2.5); fill.target.position.set(0, 0, 0); this.scene.add(fill, fill.target);
    const rim = new THREE.PointLight(0x22c6ff, 12, 10, 1.8); rim.position.set(0, 1.2, -S / 2 - 0.6); this.scene.add(rim);
    const rim2 = new THREE.PointLight(0xffa21a, 10, 8, 1.8); rim2.position.set(S / 2 + 0.6, 1.2, 0); this.scene.add(rim2);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.bloom.enabled = q === 'high';
    this.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => (mat.needsUpdate = true)); });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setMode(m: CameraMode) {
    this.mode = m; this.orbit.enabled = m === 'orbit';
    this.camera.fov = m === 'robot' ? 75 : 50; this.camera.updateProjectionMatrix();
  }

  update(robot: Robot, dt: number) {
    const p = robot.group.position, yaw = robot.yaw;
    const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const k = 1 - Math.exp(-dt * 6);
    if (this.mode === 'orbit') { this.orbit.update(); }
    else if (this.mode === 'chase') {
      const target = p.clone().addScaledVector(fwd, -1.3).add(new THREE.Vector3(0, 0.8, 0));
      this.chasePos.lerp(target, k); this.camera.position.copy(this.chasePos);
      this.lookAt.lerp(p.clone().add(new THREE.Vector3(0, 0.15, 0)), k); this.camera.lookAt(this.lookAt);
    } else if (this.mode === 'driver') {
      this.camera.position.set(-FIELD.size / 2 - 0.7, 1.5, 0);
      this.lookAt.lerp(p.clone(), k); this.camera.lookAt(this.lookAt);
    } else {
      this.camera.position.copy(p).addScaledVector(fwd, 0.12).add(new THREE.Vector3(0, 0.22, 0));
      this.camera.lookAt(p.clone().addScaledVector(fwd, 2).add(new THREE.Vector3(0, 0.05, 0)));
    }
  }

  render() { if (this.quality === 'high') this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}
