import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from './db';
import { users, emailTokens, watches, watchPhotos, type User } from './db/schema';
import { emailKey, hashPassword } from './passwords';
import { passwordPolicyError } from './password-policy';
import { StateError, lockUser } from './sessions';
import { revokeAllSessions } from './auth';
import { getStorage, type PhotoStorage } from './storage';

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

/** Self-serve account deletion. Refuses to remove the last admin — `/admin`
 * would 404 forever with no recovery path. The users-row cascade drops
 * watches / wear_sessions / watch_photos / auth_sessions / email_tokens;
 * photo *files* go explicitly afterward, same rationale as deleteWatch: a
 * crash in between leaves reclaimable orphaned files, never live rows
 * pointing at missing files. */
export async function deleteAccount(
	db: DB,
	userId: number,
	storage: PhotoStorage = getStorage()
): Promise<void> {
	const photoKeys = await db.transaction(async (tx) => {
		// Admins lock every admin row (ordered by id, so two concurrent admin
		// self-deletions serialize instead of deadlocking) — otherwise both
		// could pass the last-admin count and leave zero. Members take the
		// ordinary per-user lock. The own row is locked either way, so this
		// serializes with every other lockUser() mutation path. Reading the
		// role unlocked first is sound: roles never change at runtime.
		const user = await getUser(tx, userId);
		if (!user) return [];
		if (user.role === 'admin') {
			const admins = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.orderBy(users.id)
				.for('update');
			if (admins.length <= 1) {
				throw new StateError("You're the last admin — this account can't be deleted", 400);
			}
		} else {
			await lockUser(tx, userId);
		}
		const keys = (
			await tx
				.select({ filePath: watchPhotos.filePath })
				.from(watchPhotos)
				.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
				.where(eq(watches.userId, userId))
		).map((p) => p.filePath);
		await tx.delete(users).where(eq(users.id, userId));
		return keys;
	});
	for (const key of photoKeys) await storage.delete(key);
}

export async function updatePrefs(
	db: DB,
	userId: number,
	prefs: { homeTz?: string; staleSessionHours?: number }
): Promise<void> {
	await db.update(users).set(prefs).where(eq(users.id, userId));
}
