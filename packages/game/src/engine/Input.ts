import { DEFAULT_BINDINGS, type GameAction } from '@sd/shared';

/** Keyboard + mouse input with remappable bindings and pointer lock. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private bindings: Record<GameAction, string> = { ...DEFAULT_BINDINGS };
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  sensitivity = 1;
  invertY = false;
  enabled = true;
  private cleanup: (() => void)[] = [];

  constructor(private readonly el: HTMLElement) {
    const kd = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    };
    const ku = (e: KeyboardEvent) => this.down.delete(e.code);
    const mm = (e: MouseEvent) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };
    const wh = (e: WheelEvent) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    };
    const plc = () => {
      this.locked = document.pointerLockElement === this.el;
    };
    const blur = () => this.down.clear();
    const md = (e: MouseEvent) => {
      if (!this.enabled) return;
      if (e.button === 0) {
        if (!this.locked) this.lock();
        else this.pressed.add('Mouse0');
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('mousemove', mm);
    window.addEventListener('wheel', wh, { passive: true });
    window.addEventListener('blur', blur);
    document.addEventListener('pointerlockchange', plc);
    el.addEventListener('mousedown', md);
    this.cleanup.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('wheel', wh);
      window.removeEventListener('blur', blur);
      document.removeEventListener('pointerlockchange', plc);
      el.removeEventListener('mousedown', md);
    });
  }

  lock() {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      /* not allowed outside a user gesture */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setBindings(b: Partial<Record<string, string>>) {
    this.bindings = { ...DEFAULT_BINDINGS, ...(b as Record<GameAction, string>) };
  }

  held(a: GameAction): boolean {
    const code = this.bindings[a];
    if (a === 'forward' && this.down.has('ArrowUp')) return true;
    if (a === 'backward' && this.down.has('ArrowDown')) return true;
    if (a === 'left' && this.down.has('ArrowLeft')) return true;
    if (a === 'right' && this.down.has('ArrowRight')) return true;
    if (a === 'sprint' && this.down.has('ShiftRight')) return true;
    return this.down.has(code);
  }

  hit(a: GameAction): boolean {
    return this.pressed.has(this.bindings[a]);
  }

  hitCode(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Simulated input for automated tests (debug API only). */
  simulate(code: string, isDown: boolean) {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  /** Clear one-shot presses but keep held keys (deterministic stepping in tests). */
  endFrameKeepHeld() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  dispose() {
    this.unlock();
    for (const c of this.cleanup) c();
  }
}
