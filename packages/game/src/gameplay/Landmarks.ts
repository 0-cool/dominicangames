import type * as THREE from 'three';
import type { LandmarkInfo } from '@sd/shared';
import type { GameEvent, HudMarker } from '../engine/types.ts';

/** Discoverable real landmarks: notification with a short factual description + small reward. */
export class Landmarks {
  private found = new Set<string>();
  constructor(private readonly list: LandmarkInfo[], private readonly emit: (e: GameEvent) => void) {}

  restore(ids: string[]) {
    for (const id of ids) this.found.add(id);
  }

  discovered(): string[] {
    return [...this.found];
  }

  get total() {
    return this.list.length;
  }

  update(p: THREE.Vector3, reward: (amount: number) => void) {
    for (const l of this.list) {
      if (this.found.has(l.id)) continue;
      if ((p.x - l.x) ** 2 + (p.z - l.z) ** 2 < l.radius * l.radius) {
        this.found.add(l.id);
        reward(50);
        this.emit({ type: 'notification', kind: 'landmark', title: `Lugar descubierto: ${l.name}`, text: `${l.description} (+RD$50)` });
      }
    }
  }

  markers(): HudMarker[] {
    return this.list.map((l) => ({ x: l.x, z: l.z, kind: this.found.has(l.id) ? 'landmark_found' : 'landmark', label: l.name }));
  }
}
