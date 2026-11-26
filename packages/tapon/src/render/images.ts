/**
 * Rasterises SVG sprites to bitmaps at the size they are drawn (crisp at any window size). Each sprite is
 * rendered once per resolution bucket and cached.
 */
export type Bitmap = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg decode failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function canvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Rasterise one SVG at `scale` (sprite px → bitmap px). */
export async function rasterize(svg: string, w: number, h: number, scale: number): Promise<Bitmap> {
  const img = await svgImage(svg);
  const cw = Math.max(1, Math.ceil(w * scale));
  const ch = Math.max(1, Math.ceil(h * scale));
  const c = canvas(cw, ch);
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  g.drawImage(img, 0, 0, cw, ch);
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(c);
    } catch {
      return c;
    }
  }
  return c;
}

export class SpriteCache {
  private map = new Map<string, Bitmap>();
  private pending = new Map<string, Promise<void>>();
  scale = 1;

  constructor(private readonly svgOf: (id: string) => { svg: string; w: number; h: number } | undefined) {}

  get(id: string): Bitmap | undefined {
    return this.map.get(id);
  }

  /** Make sure every listed sprite exists at the current scale. */
  async load(ids: Iterable<string>, scale = this.scale): Promise<void> {
    this.scale = scale;
    const jobs: Promise<void>[] = [];
    for (const id of ids) {
      const key = `${id}@${scale.toFixed(2)}`;
      if (this.map.has(id) && this.pending.get(id) === undefined && this.keys.get(id) === key) continue;
      const s = this.svgOf(id);
      if (!s) continue;
      const job = rasterize(s.svg, s.w, s.h, scale)
        .then((bmp) => {
          this.map.set(id, bmp);
          this.keys.set(id, key);
        })
        .catch(() => undefined)
        .finally(() => this.pending.delete(id));
      this.pending.set(id, job);
      jobs.push(job);
    }
    await Promise.all(jobs);
  }

  private keys = new Map<string, string>();

  /** Add an extra SVG (e.g. a generated building) under its own id. */
  async add(id: string, svg: string, w: number, h: number, scale = this.scale): Promise<void> {
    const bmp = await rasterize(svg, w, h, scale);
    this.map.set(id, bmp);
    this.keys.set(id, `${id}@${scale.toFixed(2)}`);
  }

  delete(id: string) {
    this.map.delete(id);
    this.keys.delete(id);
  }
}
