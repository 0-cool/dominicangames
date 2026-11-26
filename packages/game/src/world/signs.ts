import * as THREE from 'three';
import type { ShopKind } from '@sd/shared';
import { G } from '../render/materials.ts';

const STYLE: Record<ShopKind, { bg: string; fg: string; accent: string }> = {
  colmado: { bg: '#c8102e', fg: '#ffffff', accent: '#ffd100' },
  banca: { bg: '#0b6e4f', fg: '#ffffff', accent: '#ffd23f' },
  farmacia: { bg: '#f7f7f7', fg: '#007a3d', accent: '#00a651' },
  picapollo: { bg: '#ffb703', fg: '#7a1c00', accent: '#d00000' },
  restaurante: { bg: '#3d1f0d', fg: '#ffe8c2', accent: '#e76f51' },
  cafeteria: { bg: '#5b3a29', fg: '#fff3e0', accent: '#d4a373' },
  bar: { bg: '#14213d', fg: '#fca311', accent: '#e5e5e5' },
  tienda: { bg: '#e0f2fe', fg: '#0c4a6e', accent: '#f472b6' },
  repuestos: { bg: '#1f2937', fg: '#facc15', accent: '#ef4444' },
  ferreteria: { bg: '#f59e0b', fg: '#111827', accent: '#1f2937' },
  salon: { bg: '#fdf2f8', fg: '#9d174d', accent: '#ec4899' },
  banco: { bg: '#0f3d5e', fg: '#ffffff', accent: '#9bd3ff' },
};

/** Global atlas of shop signs (fictional names), drawn with Canvas 2D on demand. */
export class SignAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  private cells = new Map<string, number>();
  private ctx: CanvasRenderingContext2D;
  static readonly CW = 384;
  static readonly CH = 96;
  static readonly COLS = 5;
  static readonly ROWS = 21;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048;
    this.canvas.height = 2048;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.6, emissiveMap: this.texture, emissive: 0x000000 });
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = G.uNight;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2((uv.x + aCell.x) * (384.0 / 2048.0), (uv.y + aCell.y) * (96.0 / 2048.0) + 32.0 / 2048.0); vEmissiveMapUv = vMapUv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += texture2D(emissiveMap, vEmissiveMapUv).rgb * uNight * 0.9;');
    };
    this.material.customProgramCacheKey = () => 'signs';
  }

  cell(kind: ShopKind, name: string): [number, number] {
    const key = `${kind}|${name}`;
    let idx = this.cells.get(key);
    if (idx === undefined) {
      idx = this.cells.size % (SignAtlas.COLS * SignAtlas.ROWS);
      this.cells.set(key, idx);
      this.draw(idx, kind, name);
    }
    return [idx % SignAtlas.COLS, SignAtlas.ROWS - 1 - Math.floor(idx / SignAtlas.COLS)];
  }

  private draw(idx: number, kind: ShopKind, name: string) {
    const c = this.ctx;
    const x = (idx % SignAtlas.COLS) * SignAtlas.CW;
    const y = Math.floor(idx / SignAtlas.COLS) * SignAtlas.CH;
    const s = STYLE[kind];
    c.fillStyle = s.bg;
    c.fillRect(x, y, SignAtlas.CW, SignAtlas.CH);
    c.fillStyle = s.accent;
    c.fillRect(x, y + SignAtlas.CH - 12, SignAtlas.CW, 12);
    c.fillRect(x, y, SignAtlas.CW, 6);
    const [prefix, ...rest] = name.split(' ');
    c.fillStyle = s.fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 20px "Arial Narrow", Arial, sans-serif';
    c.fillText(prefix.toUpperCase(), x + SignAtlas.CW / 2, y + 24);
    let size = 40;
    const label = rest.join(' ');
    do {
      c.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
      size -= 2;
    } while (c.measureText(label).width > SignAtlas.CW - 24 && size > 16);
    c.fillText(label, x + SignAtlas.CW / 2, y + 60);
    if (kind === 'farmacia') {
      c.fillStyle = s.accent;
      c.fillRect(x + 14, y + 34, 30, 10);
      c.fillRect(x + 24, y + 24, 10, 30);
    }
    this.texture.needsUpdate = true;
  }

  /** Instanced sign boards for a chunk. */
  buildMesh(shops: { x: number; y: number; z: number; rot: number; kind: ShopKind; name: string }[]): THREE.InstancedMesh | null {
    if (!shops.length) return null;
    const geo = new THREE.PlaneGeometry(3.2, 0.8);
    geo.translate(0, 0, 0.06);
    const cells = new Float32Array(shops.length * 2);
    const mesh = new THREE.InstancedMesh(geo, this.material, shops.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    shops.forEach((s, i) => {
      const [cx, cy] = this.cell(s.kind, s.name);
      cells[i * 2] = cx;
      cells[i * 2 + 1] = cy;
      q.setFromAxisAngle(up, s.rot);
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    mesh.computeBoundingSphere();
    return mesh;
  }
}
