import { sql, eq, lt } from 'drizzle-orm';
import type { DB } from './db';
import { rateLimits } from './db/schema';

export const LIMITS = {
	loginIp: { max: 10, windowMs: 900_000 },
	loginAccount: { max: 10, windowMs: 900_000 },
	signupIp: { max: 5, windowMs: 3_600_000 },
	resetAccount: { max: 3, windowMs: 3_600_000 },
	resetIp: { max: 5, windowMs: 3_600_000 },
	resendVerify: { max: 3, windowMs: 3_600_000 },
	emailChange: { max: 3, windowMs: 86_400_000 },
	passwordChange: { max: 5, windowMs: 3_600_000 },
	accountDelete: { max: 5, windowMs: 3_600_000 },
	demoIp: { max: 10, windowMs: 900_000 }
} as const;
export type LimitName = keyof typeof LIMITS;

/** Largest configured window — anything older than this can never come back
 * into play, so pruneRateLimits treats it as the retention horizon. */
const MAX_WINDOW_MS = Math.max(...Object.values(LIMITS).map((l) => l.windowMs));

/** Fixed window: one upsert. If the stored window expired, start a new one at
 * count=1; else increment. Returns whether this call is within the limit. */
export async function rateLimit(db: DB, name: LimitName, key: string, now = new Date()): Promise<boolean> {
	const { max, windowMs } = LIMITS[name];
	const cutoff = new Date(now.getTime() - windowMs);
	const rows = await db
		.insert(rateLimits)
		.values({ key, windowStart: now, count: 1 })
		.onConflictDoUpdate({
			target: rateLimits.key,
			set: {
				count: sql`case when ${rateLimits.windowStart} < ${cutoff} then 1 else ${rateLimits.count} + 1 end`,
				windowStart: sql`case when ${rateLimits.windowStart} < ${cutoff} then ${now} else ${rateLimits.windowStart} end`
			}
		})
		.returning();
	return rows[0].count <= max;
}

/** Read-only variant: reports whether `key` is currently under limit
 * WITHOUT incrementing. Used to gate an attempt before we know if it's
 * legitimate (e.g. login), so only real failures consume a slot. */
export async function rateLimitCheck(db: DB, name: LimitName, key: string, now = new Date()): Promise<boolean> {
	const { max, windowMs } = LIMITS[name];
	const cutoff = new Date(now.getTime() - windowMs);
	const rows = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
	const row = rows[0];
	if (!row || row.windowStart < cutoff) return true;
	return row.count < max;
}

/** Deletes rows whose window has aged past every possible limit's window —
 * they can never be checked against again. Call this alongside other
 * login-time housekeeping (see pruneSessions) so the table doesn't grow
 * unbounded under sustained traffic. */
export async function pruneRateLimits(db: DB, now = new Date()): Promise<void> {
	const cutoff = new Date(now.getTime() - MAX_WINDOW_MS);
	await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
}
