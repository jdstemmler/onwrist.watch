import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { createTestDb } from './db/test-utils';
import { authSessions, users } from './db/schema';
import {
	createSession,
	validateSession,
	revokeSession,
	revokeAllSessions,
	pruneSessions,
	routeClass,
	shouldSlideCookie,
	type SessionUser
} from './auth';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const T0 = new Date('2026-07-16T00:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const atHours = (hours: number) => new Date(T0.getTime() + hours * HOUR);

let db: DB;
let uid: number;
beforeEach(async () => {
	db = await createTestDb();
	const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
	uid = u.id;
});

describe('sessions', () => {
	it('roundtrips: created token validates to the session user, garbage does not', async () => {
		const token = await createSession(db, uid, T0);
		expect(token.length).toBeGreaterThanOrEqual(32);
		const su = await validateSession(db, token, T0);
		expect(su?.email).toBe('a@b.com');
		expect(su?.verified).toBe(false);
		expect(await validateSession(db, 'not-a-token', T0)).toBeNull();
		expect(await validateSession(db, '', T0)).toBeNull();
	});

	it('control-2b: session token is stored hashed', async () => {
		const token = await createSession(db, uid, T0);
		const rows = await db.select().from(authSessions);
		expect(rows).toHaveLength(1);
		expect(rows[0].tokenHash).not.toBe(token);
		expect(rows[0].tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
	});

	it('expires after the configured window when unused', async () => {
		const token = await createSession(db, uid, T0);
		expect(await validateSession(db, token, at(31))).toBeNull();
	});

	it('a touch near the end of the window renews it (sliding)', async () => {
		const token = await createSession(db, uid, T0);
		expect(await validateSession(db, token, at(29))).not.toBeNull(); // renews to day 59
		expect(await validateSession(db, token, at(31))).not.toBeNull();
	});

	it('slides expiry forward when past half-life', async () => {
		const token = await createSession(db, uid, T0);
		expect(await validateSession(db, token, at(20))).not.toBeNull(); // renews here
		expect(await validateSession(db, token, at(45))).not.toBeNull(); // alive only if renewed
	});

	it('admin sessions are fixed 24h and never slide', async () => {
		await db.update(users).set({ role: 'admin' }).where(eq(users.id, uid));
		const token = await createSession(db, uid, T0);
		const expectedExpiry = T0.getTime() + DAY;

		expect(await validateSession(db, token, atHours(13))).not.toBeNull();
		const row = (await db.select().from(authSessions))[0];
		expect(row.expiresAt.getTime()).toBe(expectedExpiry); // unchanged despite the +13h validate

		expect(await validateSession(db, token, atHours(20))).not.toBeNull();
		expect(await validateSession(db, token, atHours(25))).toBeNull();
	});

	it('control-8b: a disabled user cannot validate a session', async () => {
		const token = await createSession(db, uid, T0);
		await db.update(users).set({ disabledAt: T0 }).where(eq(users.id, uid));
		expect(await validateSession(db, token, T0)).toBeNull();
	});

	it('exposes isDemo on the session user', async () => {
		const [demo] = await db
			.insert(users)
			.values({ email: 'demo@x.test', passwordHash: 'x', isDemo: true })
			.returning();
		const token = await createSession(db, demo.id, T0);
		expect((await validateSession(db, token, T0))?.isDemo).toBe(true);

		const memberToken = await createSession(db, uid, T0);
		expect((await validateSession(db, memberToken, T0))?.isDemo).toBe(false);
	});

	it('revoke logs the token out immediately', async () => {
		const token = await createSession(db, uid, T0);
		await revokeSession(db, token);
		expect(await validateSession(db, token, T0)).toBeNull();
	});

	it('revokeAllSessions removes every session for a user', async () => {
		const t1 = await createSession(db, uid, T0);
		const t2 = await createSession(db, uid, T0);
		await revokeAllSessions(db, uid);
		expect(await validateSession(db, t1, T0)).toBeNull();
		expect(await validateSession(db, t2, T0)).toBeNull();
	});

	it('prune removes only expired rows', async () => {
		const longAgo = new Date(T0.getTime() - 40 * DAY);
		const dead = await createSession(db, uid, longAgo); // expires at longAgo+30d = T0-10d, already expired
		const alive = await createSession(db, uid, T0);
		await pruneSessions(db, at(2));
		expect(await validateSession(db, alive, at(2))).not.toBeNull();
		expect(await validateSession(db, dead, at(2))).toBeNull();
		expect(await db.select().from(authSessions)).toHaveLength(1);
	});
});

describe('shouldSlideCookie', () => {
	const member: SessionUser = {
		id: 1,
		email: 'a@b.com',
		role: 'member',
		homeTz: 'America/Los_Angeles',
		staleSessionHours: 24,
		verified: true
	};
	const admin: SessionUser = { ...member, role: 'admin' };

	it('slides for a signed-in member', () => {
		expect(shouldSlideCookie(member)).toBe(true);
	});

	it('never slides for admin (fixed 24h, matches validateSession)', () => {
		expect(shouldSlideCookie(admin)).toBe(false);
	});

	it('does nothing when there is no user (unauthenticated)', () => {
		expect(shouldSlideCookie(null)).toBe(false);
	});
});

describe('routeClass', () => {
	it.each([
		['/login', 'public'],
		['/signup', 'public'],
		['/verify', 'public'],
		['/reset', 'public'],
		['/reset/confirm', 'public'],
		['/manifest.webmanifest', 'public'],
		['/healthz', 'public'],
		['/privacy', 'public'],
		['/icon-192.png', 'public'],
		['/icon-512.png', 'public'],
		['/favicon.ico', 'public'],
		['/apple-touch-icon.png', 'public'],
		['/_app/immutable/chunk.js', 'public'],
		['/', 'public'],
		['/log', 'protected'],
		['/stats', 'protected'],
		['/watches/3/edit', 'protected'],
		['/photos/1/abc.jpg', 'protected'],
		['/loginx', 'protected'], // prefix confusion must not leak
		['/reset/confirm/extra', 'protected'], // exact match only, not a prefix
		['/resetx', 'protected']
	])('%s -> %s', (path, cls) => {
		expect(routeClass(path)).toBe(cls);
	});
});
