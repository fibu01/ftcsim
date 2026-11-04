import * as THREE from 'three';

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One foam tile with interlocking edge suggestion and speckle. Repeated per tile.
export function foamTile(): THREE.CanvasTexture {
  const [c, g] = canvas(512);
  g.fillStyle = '#4c5055'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  let s = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = ((s >>> 16) & 0xff) / 255 - 0.5;
    img.data[i] += n * 22; img.data[i + 1] += n * 22; img.data[i + 2] += n * 22;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(20,22,24,0.55)'; g.lineWidth = 6;
  g.strokeRect(3, 3, 506, 506);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2;
  g.strokeRect(10, 10, 492, 492);
  return tex(c, 1);
}

// Flat hex pattern for chassis panels. Returns color and roughness maps.
export function honeycomb(): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const [c, g] = canvas(512);
  const [rc, rg] = canvas(512);
  g.fillStyle = '#2a2d31'; g.fillRect(0, 0, 512, 512);
  rg.fillStyle = '#9a9a9a'; rg.fillRect(0, 0, 512, 512);
  const r = 22, h = r * Math.sqrt(3);
  for (let row = -1; row < 512 / h + 1; row++) {
    for (let col = -1; col < 512 / (1.5 * r) + 1; col++) {
      const x = col * 1.5 * r, y = row * h + (col % 2 ? h / 2 : 0);
      for (const [ctx, fill] of [[g, '#15171a'], [rg, '#e0e0e0']] as const) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          ctx.lineTo(x + (r - 4) * Math.cos(a), y + (r - 4) * Math.sin(a));
        }
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      }
    }
  }
  return { map: tex(c, 3), roughnessMap: tex(rc, 3) };
}

// Simple sprocket chain: alternating links. Offset animates to show it moving.
export function chain(): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  g.fillStyle = '#0d0e10'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8c9096';
  for (let i = 0; i < 128; i += 16) g.fillRect(44, i + 2, 40, 10);
  g.fillStyle = '#4a4e54';
  for (let i = 8; i < 128; i += 16) g.fillRect(52, i + 2, 24, 8);
  const t = tex(c, 1); t.repeat.set(1, 6); return t;
}
