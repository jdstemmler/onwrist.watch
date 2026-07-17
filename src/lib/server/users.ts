import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { users, type User } from './db/schema';
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

/** Re-hashes the password (policy-checked) and revokes every existing
 * session for the user — a password change ends all other logins. */
export async function setPassword(db: DB, userId: number, password: string): Promise<void> {
	const policyError = passwordPolicyError(password);
	if (policyError) throw new StateError(policyError);
	const passwordHash = await hashPassword(password);
	await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
	await revokeAllSessions(db, userId);
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
