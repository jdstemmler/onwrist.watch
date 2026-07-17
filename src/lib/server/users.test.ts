import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { createTestDb } from './db/test-utils';
import { users } from './db/schema';
import { StateError } from './sessions';
import { createSession, validateSession } from './auth';
import {
	createUser,
	findUserByEmail,
	getUser,
	markVerified,
	setPassword,
	applyEmailChange,
	updatePrefs
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
