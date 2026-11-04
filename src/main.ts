import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from './sim/world';
import { View } from './render/scene';
import { Hud } from './ui/hud';
import { Input } from './input/input';
import { defaultTeleop } from './opmode/defaultTeleop';
import { FAULTS } from './sim/faults';
import { sampleAuto } from './opmode/sampleAuto';

async function main() {
  await RAPIER.init();
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const view = new View(canvas);
  const sim = new Simulation();
  sim.opmode = defaultTeleop;
  sim.autoOpmode = sampleAuto;
  view.scene.add(sim.scene);
  const hud = new Hud(sim, view);
  const input = new Input();
  (window as any).sim = sim; (window as any).view = view; (window as any).FAULTS = FAULTS;

  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    sim.gamepad1 = input.read();
    sim.advance(dt);
    sim.syncVisual();
    view.update(sim.robot, dt);
    view.render();
    hud.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
main().catch(e => { console.error(e); document.body.innerHTML = `<pre style="color:#ff4d5e;padding:20px">${e?.stack ?? e}</pre>`; });
