import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { createTestDb } from './db/test-utils';
import { users, watches, watchPhotos, wearSessions } from './db/schema';
import { StateError } from './sessions';
import { createSession, validateSession } from './auth';
import { issueToken, consumeToken, TTL } from './tokens';
import { watchFormSchema, createWatch } from './watches';
import type { PhotoStorage } from './storage';
import {
	createUser,
	findUserByEmail,
	getUser,
	markVerified,
	setPassword,
	applyEmailChange,
	updatePrefs,
	deleteAccount
} from './users';

let db: DB;
beforeEach(async () => {
	db = await createTestDb();
});

describe('createUser', () => {
	it('normalizes the email and hashes the password', async () => {
		const user = await createUser(db, '  A@B.COM ', 'correct-horse-battery');
		expect(user.email).toBe('a@b.com');
		const [row] = await db.select().from(users).where(eq(users.id, user.id));
		expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
	});

	it('throws StateError on a weak password', async () => {
		await expect(createUser(db, 'a@b.com', 'short')).rejects.toBeInstanceOf(StateError);
	});
});

describe('findUserByEmail', () => {
	it("finds a user regardless of case/whitespace ('  A@B.COM ')", async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		const found = await findUserByEmail(db, '  A@B.COM ');
		expect(found?.id).toBe(created.id);
	});

	it('returns null when missing', async () => {
		expect(await findUserByEmail(db, 'nobody@nowhere.com')).toBeNull();
	});
});

describe('getUser', () => {
	it('returns the row by id, null otherwise', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		expect((await getUser(db, created.id))?.email).toBe('a@b.com');
		expect(await getUser(db, created.id + 999)).toBeNull();
	});
});

describe('markVerified', () => {
	it('sets emailVerifiedAt', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		expect(created.emailVerifiedAt).toBeNull();
		const now = new Date('2026-07-16T00:00:00Z');
		await markVerified(db, created.id, now);
		expect((await getUser(db, created.id))?.emailVerifiedAt?.getTime()).toBe(now.getTime());
	});
});

describe('setPassword', () => {
	it('control-8a: re-hashes the password and revokes all sessions', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		const t1 = await createSession(db, created.id);
		const t2 = await createSession(db, created.id);
		const oldHash = (await getUser(db, created.id))?.passwordHash;

		await setPassword(db, created.id, 'a-new-good-password');

		const row = await getUser(db, created.id);
		expect(row?.passwordHash).not.toBe(oldHash);
		expect(row?.passwordHash?.startsWith('$argon2id$')).toBe(true);
		expect(await validateSession(db, t1)).toBeNull();
		expect(await validateSession(db, t2)).toBeNull();
	});

	it('throws StateError on a weak new password', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		await expect(setPassword(db, created.id, 'short')).rejects.toBeInstanceOf(StateError);
	});

	it('kills outstanding email_change/reset tokens but leaves verify tokens alone', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		const changeToken = await issueToken(db, created.id, 'email_change', TTL.emailChange, 'new@b.com');
		const resetToken = await issueToken(db, created.id, 'reset', TTL.reset);
		const verifyToken = await issueToken(db, created.id, 'verify', TTL.verify);

		await setPassword(db, created.id, 'a-new-good-password');

		expect(await consumeToken(db, changeToken, 'email_change')).toBeNull();
		expect(await consumeToken(db, resetToken, 'reset')).toBeNull();
		expect((await consumeToken(db, verifyToken, 'verify'))?.userId).toBe(created.id);
	});
});

describe('applyEmailChange', () => {
	it('updates the email (normalized) and refreshes emailVerifiedAt', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		const now = new Date('2026-07-16T00:00:00Z');
		await applyEmailChange(db, created.id, '  New@Address.COM ', now);
		const row = await getUser(db, created.id);
		expect(row?.email).toBe('new@address.com');
		expect(row?.emailVerifiedAt?.getTime()).toBe(now.getTime());
	});
});

function recordingStorage(): PhotoStorage & { deleted: string[] } {
	const deleted: string[] = [];
	return {
		kind: 'fs',
		deleted,
		async put() {},
		async get() {
			return null;
		},
		async delete(key: string) {
			deleted.push(key);
		},
		async sizeOfPrefix() {
			return 0;
		}
	};
}

describe('deleteAccount', () => {
	async function seedTenant(email: string) {
		const user = await createUser(db, email, 'correct-horse-battery');
		const watch = await createWatch(
			db,
			user.id,
			watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' })
		);
		const photoKey = `${user.id}/${watch.id}/photo.webp`;
		await db.insert(watchPhotos).values({ watchId: watch.id, filePath: photoKey, isPrimary: true });
		await db.insert(wearSessions).values({
			watchId: watch.id,
			startedAt: new Date('2026-07-01T00:00:00Z'),
			endedAt: new Date('2026-07-01T08:00:00Z'),
			source: 'web'
		});
		return { user, watch, photoKey };
	}

	it("deletes the user's rows and exactly their photo files; the other tenant is untouched", async () => {
		const alice = await seedTenant('alice@b.com');
		const bob = await seedTenant('bob@b.com');
		const storage = recordingStorage();

		await deleteAccount(db, alice.user.id, storage);

		expect(await getUser(db, alice.user.id)).toBeNull();
		expect(await db.select().from(watches).where(eq(watches.userId, alice.user.id))).toHaveLength(0);
		expect(storage.deleted).toEqual([alice.photoKey]);

		// Bob's world is intact: row, watch, photo row, wear session, file untouched.
		expect(await getUser(db, bob.user.id)).not.toBeNull();
		expect(await db.select().from(watches).where(eq(watches.userId, bob.user.id))).toHaveLength(1);
		expect(
			await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, bob.watch.id))
		).toHaveLength(1);
		expect(
			await db.select().from(wearSessions).where(eq(wearSessions.watchId, bob.watch.id))
		).toHaveLength(1);
		expect(storage.deleted).not.toContain(bob.photoKey);
	});

	it('revokes sessions via the cascade and frees the email for a fresh signup', async () => {
		const alice = await seedTenant('alice@b.com');
		const token = await createSession(db, alice.user.id);

		await deleteAccount(db, alice.user.id, recordingStorage());

		expect(await validateSession(db, token)).toBeNull();
		const again = await createUser(db, 'alice@b.com', 'correct-horse-battery');
		expect(again.email).toBe('alice@b.com');
	});

	it('refuses to delete the last admin', async () => {
		const adm = await createUser(db, 'admin@b.com', 'correct-horse-battery');
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, adm.id));

		await expect(deleteAccount(db, adm.id, recordingStorage())).rejects.toBeInstanceOf(StateError);
		expect(await getUser(db, adm.id)).not.toBeNull();
	});

	it('lets a non-last admin self-delete', async () => {
		const a1 = await createUser(db, 'admin1@b.com', 'correct-horse-battery');
		const a2 = await createUser(db, 'admin2@b.com', 'correct-horse-battery');
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, a1.id));
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, a2.id));

		await deleteAccount(db, a1.id, recordingStorage());

		expect(await getUser(db, a1.id)).toBeNull();
		expect(await getUser(db, a2.id)).not.toBeNull();
	});

	it('is a no-op for a missing user', async () => {
		const storage = recordingStorage();
		await deleteAccount(db, 9999, storage);
		expect(storage.deleted).toHaveLength(0);
	});
});

describe('updatePrefs', () => {
	it('updates only the provided fields', async () => {
		const created = await createUser(db, 'a@b.com', 'correct-horse-battery');
		await updatePrefs(db, created.id, { homeTz: 'Europe/Berlin' });
		let row = await getUser(db, created.id);
		expect(row?.homeTz).toBe('Europe/Berlin');
		expect(row?.staleSessionHours).toBe(24);

		await updatePrefs(db, created.id, { staleSessionHours: 6 });
		row = await getUser(db, created.id);
		expect(row?.homeTz).toBe('Europe/Berlin');
		expect(row?.staleSessionHours).toBe(6);
	});
});
