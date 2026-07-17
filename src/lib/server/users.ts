import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from './db';
import { users, emailTokens, type User } from './db/schema';
import { emailKey, passwordPolicyError, hashPassword } from './passwords';
import { StateError } from './sessions';
import { revokeAllSessions } from './auth';

/** Normalizes the email, enforces the password policy, and hashes the
 * password. Role defaults to 'member' (schema default). A Postgres unique
 * violation on email propagates to the caller — callers pre-check. */
export async function createUser(db: DB, email: string, password: string): Promise<User> {
	const policyError = passwordPolicyError(password);
	if (policyError) throw new StateError(policyError);
	const passwordHash = await hashPassword(password);
	const [row] = await db
		.insert(users)
		.values({ email: emailKey(email), passwordHash })
		.returning();
	return row;
}

/** True for a Postgres unique-constraint violation (SQLSTATE 23505), however
 * many wrapper layers drizzle's driver puts around it. Used to catch
 * TOCTOU races on `email` (concurrent signup / concurrent email-change). */
export function isUniqueViolation(e: unknown): boolean {
	return (e as { cause?: { code?: string } } | null)?.cause?.code === '23505';
}

export async function findUserByEmail(db: DB, email: string): Promise<User | null> {
	const rows = await db.select().from(users).where(eq(users.email, emailKey(email))).limit(1);
	return rows[0] ?? null;
}

export async function getUser(db: DB, id: number): Promise<User | null> {
	const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function markVerified(db: DB, userId: number, now = new Date()): Promise<void> {
	await db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, userId));
}

/** Re-hashes the password (policy-checked), revokes every existing session
 * for the user, and kills any outstanding email_change/reset tokens — a
 * password change/reset must invalidate anything an attacker holding one of
 * those tokens could still use (takeover-persistence). `verify` tokens are
 * left alone: a legitimately-unverified user resetting their password should
 * still be able to verify with the link already in their inbox. */
export async function setPassword(db: DB, userId: number, password: string): Promise<void> {
	const policyError = passwordPolicyError(password);
	if (policyError) throw new StateError(policyError);
	const passwordHash = await hashPassword(password);
	await db.transaction(async (tx) => {
		await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
		await revokeAllSessions(tx, userId);
		await tx
			.delete(emailTokens)
			.where(and(eq(emailTokens.userId, userId), inArray(emailTokens.purpose, ['email_change', 'reset'])));
	});
}

export async function applyEmailChange(
	db: DB,
	userId: number,
	newEmail: string,
	now = new Date()
): Promise<void> {
	await db
		.update(users)
		.set({ email: emailKey(newEmail), emailVerifiedAt: now })
		.where(eq(users.id, userId));
}

export async function updatePrefs(
	db: DB,
	userId: number,
	prefs: { homeTz?: string; staleSessionHours?: number }
): Promise<void> {
	await db.update(users).set(prefs).where(eq(users.id, userId));
}
