import { Api } from '../lib/api.ts';

/**
 * DominicanGames Core SDK — play session tracking for any game hosted on the platform.
 *
 *   const s = new PlaySession('santo-domingo-open-world');
 *   await s.start();      // when the player actually starts playing
 *   …                     // heartbeats are sent every minute while the tab is visible
 *   await s.end();        // on exit (also sent with keepalive when the page is closed)
 *
 * Feeds “Continuar jugando”, “Jugados recientemente”, play time and admin analytics. Tracking failures never
 * interrupt the game.
 */
export class PlaySession {
  private id: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ended = false;
  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') this.beat();
  };
  private readonly onPageHide = () => void this.end(true);

  constructor(readonly gameId: string) {}

  get active() {
    return !!this.id && !this.ended;
  }

  async start(): Promise<void> {
    if (this.id || this.ended) return;
    try {
      const r = await Api.startSession(this.gameId);
      this.id = r.sessionId;
      this.timer = setInterval(() => document.visibilityState === 'visible' && this.beat(), 60_000);
      document.addEventListener('visibilitychange', this.onHide);
      window.addEventListener('pagehide', this.onPageHide);
    } catch {
      /* analytics only — never block play */
    }
  }

  private beat() {
    if (this.id && !this.ended) Api.heartbeat(this.id).catch(() => undefined);
  }

  async end(keepalive = false): Promise<void> {
    if (!this.id || this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
    await Api.endSession(this.id, keepalive).catch(() => undefined);
  }
}
