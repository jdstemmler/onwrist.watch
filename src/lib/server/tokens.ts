import crypto from 'node:crypto';
import { and, eq, gt, isNull, isNotNull, lt, or } from 'drizzle-orm';
import type { DB } from './db';
import { emailTokens, type EmailToken } from './db/schema';

export const TTL = { verify: 86_400_000, reset: 1_800_000, emailChange: 86_400_000 } as const;

export const hashToken = (token: string) =>
	crypto.createHash('sha256').update(token).digest('hex');

export async function issueToken(
	db: DB,
	userId: number,
	purpose: 'verify' | 'reset' | 'email_change',
	ttlMs: number,
	newEmail?: string,
	now = new Date()
): Promise<string> {
	const raw = crypto.randomBytes(32).toString('base64url');
	await db.insert(emailTokens).values({
		userId,
		purpose,
		tokenHash: hashToken(raw),
		newEmail: newEmail ?? null,
		expiresAt: new Date(now.getTime() + ttlMs)
	});
	return raw;
}

/** Marks the token used and returns it — atomically, so a raced double-click
 * consumes exactly once. Null for missing/expired/used/wrong purpose. */
export async function consumeToken(
	db: DB,
	raw: string,
	purpose: 'verify' | 'reset' | 'email_change',
	now = new Date()
): Promise<EmailToken | null> {
	const rows = await db
		.update(emailTokens)
		.set({ usedAt: now })
		.where(
			and(
				eq(emailTokens.tokenHash, hashToken(raw)),
				eq(emailTokens.purpose, purpose),
				isNull(emailTokens.usedAt),
				gt(emailTokens.expiresAt, now)
			)
		)
		.returning();
	return rows[0] ?? null;
}

/** Deletes expired and already-used tokens — they can never be consumed
 * again, they'd just accumulate forever. Called from the same login-time
 * housekeeping as pruneSessions/pruneRateLimits. */
export async function pruneTokens(db: DB, now = new Date()): Promise<void> {
	await db.delete(emailTokens).where(or(lt(emailTokens.expiresAt, now), isNotNull(emailTokens.usedAt)));
}
