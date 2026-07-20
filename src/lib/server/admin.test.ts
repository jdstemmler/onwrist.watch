import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users, watches, watchPhotos, authSessions } from './db/schema';
import { createFsStorage } from './storage/fs';
import { StateError } from './sessions';
import {
	ensureAdmin,
	isAdmin,
	listUsersWithMeta,
	setUserDisabled,
	deleteUser,
	setQuotaMultiplier
} from './admin';

let db: DB;
let root: string;
beforeEach(async () => {
	db = await createTestDb();
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-test-'));
});
afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
	delete process.env.ADMIN_EMAIL; // don't leak the env mutation into other suites
});

describe('ensureAdmin', () => {
	it('is a no-op when ADMIN_EMAIL is unset', async () => {
		delete process.env.ADMIN_EMAIL;
		await ensureAdmin(db);
		expect(await db.select().from(users)).toHaveLength(0);
	});

	it('creates exactly one admin with a normalized email and is idempotent', async () => {
		process.env.ADMIN_EMAIL = '  Admin@Onwrist.WATCH ';
		await ensureAdmin(db);
		await ensureAdmin(db);
		const admins = (await db.select().from(users)).filter((u) => u.role === 'admin');
		expect(admins).toHaveLength(1);
		expect(admins[0].email).toBe('admin@onwrist.watch');
		expect(admins[0].emailVerifiedAt).not.toBeNull();
		expect(admins[0].passwordHash.startsWith('$argon2id$')).toBe(true);
	});

	it('does not create a second admin when one already exists (different email)', async () => {
		await db.insert(users).values({ email: 'first@admin.com', passwordHash: 'x', role: 'admin' });
		process.env.ADMIN_EMAIL = 'second@admin.com';
		await ensureAdmin(db);
		expect((await db.select().from(users)).filter((u) => u.role === 'admin')).toHaveLength(1);
	});

	it('is a no-op (does not throw, does not promote) when a member already occupies ADMIN_EMAIL', async () => {
		await db.insert(users).values({ email: 'admin@onwrist.watch', passwordHash: 'x', role: 'member' });
		process.env.ADMIN_EMAIL = 'Admin@Onwrist.WATCH';
		await expect(ensureAdmin(db)).resolves.not.toThrow();
		const all = await db.select().from(users);
		expect(all).toHaveLength(1);
		expect(all[0].role).toBe('member');
	});
});

describe('isAdmin', () => {
	it('is true only for an admin user', () => {
		expect(isAdmin(null)).toBe(false);
		expect(isAdmin({ role: 'member' })).toBe(false);
		expect(isAdmin({ role: 'admin' })).toBe(true);
	});
});

describe('listUsersWithMeta', () => {
	it('aggregates watch count, storage bytes and last-active per user', async () => {
		const storage = createFsStorage(root);
		const [a] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		const [b] = await db.insert(users).values({ email: 'b@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: a.id, brand: 'A', model: 'B' }).returning();
		await storage.put(`${a.id}/${w.id}/p.webp`, Buffer.alloc(100));
		await db.insert(watchPhotos).values({ watchId: w.id, filePath: `${a.id}/${w.id}/p.webp` });
		await db.insert(authSessions).values({ userId: a.id, tokenHash: 'h', expiresAt: new Date(Date.now() + 1e6) });

		const rows = await listUsersWithMeta(db, storage);
		const ra = rows.find((r) => r.id === a.id)!;
		const rb = rows.find((r) => r.id === b.id)!;
		expect(ra.watchCount).toBe(1);
		expect(ra.storageBytes).toBe(100);
		expect(ra.lastActiveAt).not.toBeNull();
		expect(rb.watchCount).toBe(0);
		expect(rb.storageBytes).toBe(0);
		expect(rb.lastActiveAt).toBeNull();
	});
});

describe('setUserDisabled', () => {
	it('sets disabled_at and revokes the user’s sessions on disable, clears it on enable', async () => {
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		await db.insert(authSessions).values({ userId: u.id, tokenHash: 'h', expiresAt: new Date(Date.now() + 1e6) });
		await setUserDisabled(db, u.id, true);
		expect((await db.select().from(users).where(eq(users.id, u.id)))[0].disabledAt).not.toBeNull();
		expect(await db.select().from(authSessions)).toHaveLength(0);
		await setUserDisabled(db, u.id, false);
		expect((await db.select().from(users).where(eq(users.id, u.id)))[0].disabledAt).toBeNull();
	});

	it('rejects disabling an admin (lockout guard) but still allows re-enabling one', async () => {
		const [adm] = await db.insert(users).values({ email: 'adm@b.com', passwordHash: 'x', role: 'admin' }).returning();
		await db.insert(authSessions).values({ userId: adm.id, tokenHash: 'h', expiresAt: new Date(Date.now() + 1e6) });

		await expect(setUserDisabled(db, adm.id, true)).rejects.toThrow(StateError);
		expect((await db.select().from(users).where(eq(users.id, adm.id)))[0].disabledAt).toBeNull();
		expect(await db.select().from(authSessions).where(eq(authSessions.userId, adm.id))).toHaveLength(1);

		await expect(setUserDisabled(db, adm.id, false)).resolves.not.toThrow();
	});

	it('still allows disabling a member', async () => {
		const [m] = await db.insert(users).values({ email: 'm2@b.com', passwordHash: 'x' }).returning();
		await setUserDisabled(db, m.id, true);
		expect((await db.select().from(users).where(eq(users.id, m.id)))[0].disabledAt).not.toBeNull();
	});
});

describe('deleteUser', () => {
	it('removes the user, cascades their rows, deletes their photo files, and rejects deleting an admin', async () => {
		const storage = createFsStorage(root);
		const [m] = await db.insert(users).values({ email: 'm@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: m.id, brand: 'A', model: 'B' }).returning();
		await storage.put(`${m.id}/${w.id}/p.webp`, Buffer.alloc(10));
		await db.insert(watchPhotos).values({ watchId: w.id, filePath: `${m.id}/${w.id}/p.webp` });

		await deleteUser(db, m.id, storage);
		expect(await db.select().from(users).where(eq(users.id, m.id))).toHaveLength(0);
		expect(await db.select().from(watches)).toHaveLength(0);
		expect(await storage.get(`${m.id}/${w.id}/p.webp`)).toBeNull();

		const [adm] = await db.insert(users).values({ email: 'x@a.com', passwordHash: 'x', role: 'admin' }).returning();
		await expect(deleteUser(db, adm.id, storage)).rejects.toThrow(StateError);
	});

	it('deletes rows before files: a failing storage still removes the user', async () => {
		const storage = createFsStorage(root);
		const [m] = await db.insert(users).values({ email: 'm@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: m.id, brand: 'A', model: 'B' }).returning();
		await storage.put(`${m.id}/${w.id}/p.webp`, Buffer.alloc(10));
		await db.insert(watchPhotos).values({ watchId: w.id, filePath: `${m.id}/${w.id}/p.webp` });

		const failing = {
			...storage,
			delete: async () => {
				throw new Error('storage down');
			}
		};

		await expect(deleteUser(db, m.id, failing)).rejects.toThrow('storage down');
		// Row-first ordering: the user (and cascaded rows) are gone even though
		// file deletion failed — orphan files, never dangling rows.
		expect((await db.select().from(users).where(eq(users.id, m.id))).length).toBe(0);
	});
});

describe('setQuotaMultiplier', () => {
	it('clamps to an integer ≥ 1', async () => {
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		await setQuotaMultiplier(db, u.id, 0);
		expect((await db.select().from(users).where(eq(users.id, u.id)))[0].quotaMultiplier).toBe(1);
		await setQuotaMultiplier(db, u.id, 3);
		expect((await db.select().from(users).where(eq(users.id, u.id)))[0].quotaMultiplier).toBe(3);
	});
});
