import type { RoadGraphData } from '@sd/shared';

/** Grid index over named road segments → "what street am I on?" for the HUD. */
export class StreetIndex {
  private cells = new Map<string, number[]>();
  private segs: { ax: number; az: number; bx: number; bz: number; name: string }[] = [];
  private readonly cell = 40;

  constructor(roads: RoadGraphData) {
    for (const e of roads.edges) {
      if (!e.name) continue;
      for (let i = 0; i + 3 < e.pts.length; i += 2) {
        const s = { ax: e.pts[i], az: e.pts[i + 1], bx: e.pts[i + 2], bz: e.pts[i + 3], name: e.name };
        const id = this.segs.push(s) - 1;
        const x0 = Math.floor(Math.min(s.ax, s.bx) / this.cell);
        const x1 = Math.floor(Math.max(s.ax, s.bx) / this.cell);
        const z0 = Math.floor(Math.min(s.az, s.bz) / this.cell);
        const z1 = Math.floor(Math.max(s.az, s.bz) / this.cell);
        for (let x = x0; x <= x1; x++)
          for (let z = z0; z <= z1; z++) {
            const k = `${x},${z}`;
            const arr = this.cells.get(k);
            if (arr) arr.push(id);
            else this.cells.set(k, [id]);
          }
      }
    }
  }

  nearest(x: number, z: number, maxDist = 22): string | null {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    let best: string | null = null;
    let bd = maxDist * maxDist;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const ids = this.cells.get(`${cx + i},${cz + j}`);
        if (!ids) continue;
        for (const id of ids) {
          const s = this.segs[id];
          const dx = s.bx - s.ax;
          const dz = s.bz - s.az;
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
          const px = s.ax + dx * t - x;
          const pz = s.az + dz * t - z;
          const d = px * px + pz * pz;
          if (d < bd) {
            bd = d;
            best = s.name;
          }
        }
      }
    return best;
  }
}
