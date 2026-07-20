import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DB } from './db';
import { users, watches, watchPhotos, authSessions } from './db/schema';
import { hashPassword, emailKey } from './passwords';
import { revokeAllSessions } from './auth';
import { StateError, lockUser } from './sessions';
import { getStorage, type PhotoStorage } from './storage';

/** Boot-time seed: create the ops admin from ADMIN_EMAIL if none exists.
 * Idempotent; no-op without ADMIN_EMAIL or when any admin already exists.
 * The password is unusable random bytes — the operator sets a real one via
 * the forgot-password flow. Never emails, never rewrites an existing user.
 * If a MEMBER already occupies the ADMIN_EMAIL address, the insert conflicts
 * on the unique email index and is silently skipped (no-op, not a crash) —
 * this must never throw, since hooks.server.ts awaits it on every request. */
export async function ensureAdmin(db: DB): Promise<void> {
	const raw = process.env.ADMIN_EMAIL?.trim();
	if (!raw) return;
	const existing = (await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1))[0];
	if (existing) return;
	const key = emailKey(raw);
	const unusable = crypto.randomBytes(32).toString('base64url');
	await db
		.insert(users)
		.values({
			email: key,
			passwordHash: await hashPassword(unusable),
			role: 'admin',
			emailVerifiedAt: new Date()
		})
		.onConflictDoNothing({ target: users.email });

	const seeded = (await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1))[0];
	if (!seeded) {
		console.warn(
			`ensureAdmin: ADMIN_EMAIL (${key}) is already taken by a non-admin account; no admin was seeded.`
		);
	}
}

export function isAdmin(user: { role: 'admin' | 'member' } | null): boolean {
	return user?.role === 'admin';
}

export type AdminUserRow = {
	id: number;
	email: string;
	role: 'admin' | 'member';
	verified: boolean;
	disabled: boolean;
	watchCount: number;
	storageBytes: number;
	lastActiveAt: Date | null;
	quotaMultiplier: number;
};

export async function listUsersWithMeta(db: DB, storage: PhotoStorage = getStorage()): Promise<AdminUserRow[]> {
	const us = await db.select().from(users).orderBy(users.createdAt);
	const rows: AdminUserRow[] = [];
	for (const u of us) {
		const [{ count } = { count: 0 }] = await db
			.select({ count: sql<number>`cast(count(*) as int)` })
			.from(watches)
			.where(eq(watches.userId, u.id));
		const [{ last } = { last: null }] = await db
			.select({ last: sql<Date | null>`max(${authSessions.createdAt})` })
			.from(authSessions)
			.where(eq(authSessions.userId, u.id));
		rows.push({
			id: u.id,
			email: u.email,
			role: u.role,
			verified: u.emailVerifiedAt !== null,
			disabled: u.disabledAt !== null,
			watchCount: Number(count),
			storageBytes: await storage.sizeOfPrefix(`${u.id}/`),
			lastActiveAt: last,
			quotaMultiplier: u.quotaMultiplier
		});
	}
	return rows;
}

export async function setUserDisabled(db: DB, userId: number, disabled: boolean, now = new Date()): Promise<void> {
	if (disabled) {
		const target = (await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0];
		if (target?.role === 'admin') throw new StateError('Admin accounts cannot be disabled here', 400);
	}
	await db.transaction(async (tx) => {
		await tx.update(users).set({ disabledAt: disabled ? now : null }).where(eq(users.id, userId));
		if (disabled) await revokeAllSessions(tx, userId);
	});
}

export async function deleteUser(db: DB, userId: number, storage: PhotoStorage = getStorage()): Promise<void> {
	const photoKeys = await db.transaction(async (tx) => {
		const target = (await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0];
		if (!target) return [];
		if (target.role === 'admin') throw new StateError('Admin accounts cannot be deleted here', 400);
		// Collect keys and drop the rows behind the user lock — savePhoto
		// serializes behind the same lock, so a concurrent upload can't land a
		// photo between the SELECT and the DELETE and leave its file orphaned
		// forever. Same shape as deleteAccount.
		await lockUser(tx, userId);
		const keys = (
			await tx
				.select({ filePath: watchPhotos.filePath })
				.from(watchPhotos)
				.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
				.where(eq(watches.userId, userId))
		).map((p) => p.filePath);
		// Rows first, files second: a crash in between leaves reclaimable orphan
		// files (quota-inflating but harmless) instead of rows pointing at missing
		// files — same ordering as deleteWatch and deleteAccount.
		await tx.delete(users).where(eq(users.id, userId)); // FKs cascade watches/sessions/photos/tokens rows
		return keys;
	});
	for (const key of photoKeys) await storage.delete(key);
}

export async function setQuotaMultiplier(db: DB, userId: number, n: number): Promise<void> {
	const clamped = Math.max(1, Math.floor(n));
	await db.update(users).set({ quotaMultiplier: clamped }).where(eq(users.id, userId));
}
