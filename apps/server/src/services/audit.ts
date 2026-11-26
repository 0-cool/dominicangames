import type { DB } from '../db/index.ts';
import { auditLogs, errorLogs } from '../db/schema.ts';

export async function audit(db: DB, e: { actorUserId?: string | null; action: string; targetType?: string; targetId?: string; ip?: string; details?: Record<string, unknown> }) {
  await db.insert(auditLogs).values({ actorUserId: e.actorUserId ?? null, action: e.action, targetType: e.targetType, targetId: e.targetId, ip: e.ip, details: e.details });
}

export async function logError(db: DB, e: { source: 'server' | 'client'; message: string; stack?: string; context?: Record<string, unknown>; userId?: string | null }) {
  try {
    await db.insert(errorLogs).values({ source: e.source, message: e.message.slice(0, 2000), stack: e.stack?.slice(0, 8000), context: e.context, userId: e.userId ?? null });
  } catch {
    /* never fail the request because of error logging */
  }
}
