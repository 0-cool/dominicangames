import { and, asc, eq } from 'drizzle-orm';
import type { TaponStats } from '@sd/shared';
import { SIM_VERSION, replayRun, sameResult } from '@sd/tapon/sim';
import type { DB } from '../../db/index.ts';
import { arcadeRuns } from '../../db/schema.ts';
import { logError } from '../../services/audit.ts';

export type VerifyOutcome = 'verified' | 'rejected' | 'saved';

/** Steps replayed between two pauses (≈15 ms of work) so the server keeps answering requests meanwhile. */
const CHUNK = 30;
const pause = () => new Promise<void>((r) => setImmediate(r));

/**
 * Server-side replay of El Tapón runs. The game simulation is deterministic (seed issued by the server + the
 * player's inputs at fixed steps), so re-running it here reproduces the exact score. Runs wait in the database
 * with status `pending` and are verified one at a time; a restart simply picks them up again.
 */
export class ReplayVerifier {
  private running = false;
  private stopped = false;
  private waiters = new Map<string, ((o: VerifyOutcome) => void)[]>();

  constructor(
    private readonly db: DB,
    private readonly gameId: string,
  ) {}

  /** Starts working through pending runs (no-op when already running). */
  kick() {
    if (this.running || this.stopped) return;
    this.running = true;
    void this.loop().finally(() => {
      this.running = false;
    });
  }

  stop() {
    this.stopped = true;
  }

  /** Queues the run and waits for its outcome, or resolves null after `timeoutMs` (it keeps being verified). */
  wait(runId: string, timeoutMs: number): Promise<VerifyOutcome | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const list = this.waiters.get(runId)?.filter((f) => f !== done);
        if (list?.length) this.waiters.set(runId, list);
        else this.waiters.delete(runId);
        resolve(null);
      }, timeoutMs);
      const done = (o: VerifyOutcome) => {
        clearTimeout(timer);
        resolve(o);
      };
      this.waiters.set(runId, [...(this.waiters.get(runId) ?? []), done]);
      this.kick();
    });
  }

  private async loop() {
    while (!this.stopped) {
      const [run] = await this.db
        .select()
        .from(arcadeRuns)
        .where(and(eq(arcadeRuns.gameId, this.gameId), eq(arcadeRuns.status, 'pending')))
        .orderBy(asc(arcadeRuns.finishedAt))
        .limit(1);
      if (!run) return;
      let outcome: VerifyOutcome;
      let reasons: string[] | null = null;
      try {
        const r = await this.check(run);
        outcome = r.ok ? 'verified' : 'rejected';
        if (!r.ok) reasons = [r.reason];
      } catch (e) {
        if (this.stopped) return;
        // a bug here must not cost the player the run: keep it in their history, out of the table
        outcome = 'saved';
        reasons = ['verify_error'];
        await logError(this.db, { source: 'server', message: `El Tapón replay failed: ${(e as Error).message}`, stack: (e as Error).stack, context: { runId: run.id }, userId: run.userId });
      }
      if (this.stopped) return;
      await this.db
        .update(arcadeRuns)
        .set({ status: outcome, verifiedAt: outcome === 'verified' ? new Date() : null, rejectReasons: reasons, replay: null })
        .where(and(eq(arcadeRuns.id, run.id), eq(arcadeRuns.status, 'pending')));
      for (const f of this.waiters.get(run.id) ?? []) f(outcome);
      this.waiters.delete(run.id);
    }
  }

  private async check(run: typeof arcadeRuns.$inferSelect): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (run.simVersion !== SIM_VERSION) return { ok: false, reason: 'old_version' };
    if (!run.replay || run.score === null || !run.stats) return { ok: false, reason: 'no_replay' };
    const r = await replayRun(run.seed, run.replay.inputs, run.replay.steps + 1, { chunk: CHUNK, pause: () => (this.stopped ? Promise.reject(new Error('stopped')) : pause()) });
    if (!r) return { ok: false, reason: 'bad_replay' };
    return sameResult(r, { score: run.score, stats: run.stats as unknown as TaponStats, steps: run.replay.steps }) ? { ok: true } : { ok: false, reason: 'replay_mismatch' };
  }
}
