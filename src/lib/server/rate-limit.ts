import { sql } from 'drizzle-orm';
import type { DB } from './db';
import { rateLimits } from './db/schema';

export const LIMITS = {
	loginIp: { max: 10, windowMs: 900_000 },
	loginAccount: { max: 10, windowMs: 900_000 },
	signupIp: { max: 5, windowMs: 3_600_000 },
	resetAccount: { max: 3, windowMs: 3_600_000 },
	resendVerify: { max: 3, windowMs: 3_600_000 },
	emailChange: { max: 3, windowMs: 86_400_000 }
} as const;
export type LimitName = keyof typeof LIMITS;

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
