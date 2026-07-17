import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DB } from './db';
import { users, watches, watchPhotos, authSessions } from './db/schema';
import { hashPassword, emailKey } from './passwords';
import { revokeAllSessions } from './auth';
import { StateError } from './sessions';
import { getStorage, type PhotoStorage } from './storage';

/** Boot-time seed: create the ops admin from ADMIN_EMAIL if none exists.
 * Idempotent; no-op without ADMIN_EMAIL or when any admin already exists.
 * The password is unusable random bytes — the operator sets a real one via
 * the forgot-password flow. Never emails, never rewrites an existing user. */
export async function ensureAdmin(db: DB): Promise<void> {
	const raw = process.env.ADMIN_EMAIL?.trim();
	if (!raw) return;
	const existing = (await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1))[0];
	if (existing) return;
	const unusable = crypto.randomBytes(32).toString('base64url');
	await db.insert(users).values({
		email: emailKey(raw),
		passwordHash: await hashPassword(unusable),
		role: 'admin',
		emailVerifiedAt: new Date()
	});
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
		if (target?.role === 'admin') throw new StateError('Admin accounts can’t be disabled here', 400);
	}
	await db.transaction(async (tx) => {
		await tx.update(users).set({ disabledAt: disabled ? now : null }).where(eq(users.id, userId));
		if (disabled) await revokeAllSessions(tx, userId);
	});
}

export async function deleteUser(db: DB, userId: number, storage: PhotoStorage = getStorage()): Promise<void> {
	const target = (await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1))[0];
	if (!target) return;
	if (target.role === 'admin') throw new StateError('Admin accounts can’t be deleted here', 400);
	// Remove photo files before the cascade drops their rows (files aren't cascaded).
	const photos = await db
		.select({ filePath: watchPhotos.filePath })
		.from(watchPhotos)
		.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
		.where(eq(watches.userId, userId));
	for (const p of photos) await storage.delete(p.filePath);
	await db.delete(users).where(eq(users.id, userId)); // FKs cascade watches/sessions/photos/tokens rows
}

export async function setQuotaMultiplier(db: DB, userId: number, n: number): Promise<void> {
	const clamped = Math.max(1, Math.floor(n));
	await db.update(users).set({ quotaMultiplier: clamped }).where(eq(users.id, userId));
}
