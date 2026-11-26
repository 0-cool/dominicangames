import * as THREE from 'three';

/** UV regions of the procedural foliage atlas. */
export const LEAF: [number, number, number, number] = [0, 0, 0.5, 1];
export const FROND: [number, number, number, number] = [0.5, 0.5, 1, 1];
export const SOLID_UV: [number, number] = [0.875, 0.125];

/**
 * Procedural foliage atlas (Canvas 2D): broadleaf cluster (left half), pinnate
 * palm frond (top-right) and an opaque white texel block (bottom-right) used by
 * trunks so the whole tree is one material / draw call.
 */
export function makeFoliageAtlas(): THREE.DataTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // broadleaf cluster: many small leaves inside a soft circle
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 118;
    const x = 128 + Math.cos(a) * r;
    const y = 256 + Math.sin(a) * r * 1.9;
    const l = 10 + rnd() * 10;
    const sh = 150 + Math.floor(rnd() * 105);
    g.fillStyle = `rgb(${sh},${sh},${sh})`;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, l, l * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // palm frond: rachis + drooping leaflets
  const fx0 = 256;
  const fy0 = 0;
  g.strokeStyle = 'rgb(200,200,180)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(fx0 + 128, fy0 + 4);
  g.lineTo(fx0 + 128, fy0 + 252);
  g.stroke();
  for (let y = 8; y < 250; y += 5) {
    const t = y / 250;
    const len = 118 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 8;
    for (const sgn of [-1, 1]) {
      const sh = 170 + Math.floor(rnd() * 80);
      g.strokeStyle = `rgb(${sh},${sh},${sh})`;
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(fx0 + 128, fy0 + y);
      g.quadraticCurveTo(fx0 + 128 + sgn * len * 0.6, fy0 + y + 6, fx0 + 128 + sgn * len, fy0 + y + 18 + rnd() * 6);
      g.stroke();
    }
  }
  // solid block for trunks
  g.fillStyle = '#ffffff';
  g.fillRect(384, 384, 128, 128);
  return dilatedTexture(g.getImageData(0, 0, S, S), S);
}

/**
 * Transparent texels of a canvas are black, and mip-mapping averages that black into the leaf edges (dark
 * fringes and dark cards in the distance). Copy into a DataTexture whose transparent texels take the average
 * leaf grey instead (alpha stays 0), flipping rows like a CanvasTexture would.
 */
function dilatedTexture(img: ImageData, S: number): THREE.DataTexture {
  const src = img.data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] > 200) {
      r += src[i];
      gg += src[i + 1];
      b += src[i + 2];
      n++;
    }
  }
  const fill = n ? [r / n, gg / n, b / n] : [200, 200, 200];
  const out = new Uint8Array(src.length);
  for (let y = 0; y < S; y++) {
    const sy = S - 1 - y;
    for (let x = 0; x < S; x++) {
      const i = (sy * S + x) * 4;
      const o = (y * S + x) * 4;
      const a = src[i + 3];
      const k = a / 255;
      // un-premultiply edge texels towards the fill colour so partially transparent edges are not darkened
      out[o] = a ? Math.round(src[i] * k + fill[0] * (1 - k)) : fill[0];
      out[o + 1] = a ? Math.round(src[i + 1] * k + fill[1] * (1 - k)) : fill[1];
      out[o + 2] = a ? Math.round(src[i + 2] * k + fill[2] * (1 - k)) : fill[2];
      out[o + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
