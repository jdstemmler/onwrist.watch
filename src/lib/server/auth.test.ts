import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import { authSessions } from './db/schema';
import {
	verifyPassword,
	createSession,
	validateSession,
	revokeSession,
	pruneSessions,
	routeClass,
	loginLockedMs,
	recordLoginFailure,
	recordLoginSuccess
} from './auth';

const DAY = 86_400_000;
const T0 = new Date('2026-07-16T00:00:00Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

let db: DB;
beforeEach(() => {
	db = createDb(':memory:');
	recordLoginSuccess(); // reset throttle state between tests
});

describe('verifyPassword', () => {
	it('accepts the configured password and rejects others', () => {
		expect(verifyPassword('wrist-check', 'wrist-check')).toBe(true);
		expect(verifyPassword('wrong', 'wrist-check')).toBe(false);
		expect(verifyPassword('', 'wrist-check')).toBe(false);
	});

	it('fails closed when no password is configured', () => {
		expect(verifyPassword('anything', '')).toBe(false);
		expect(verifyPassword('', '')).toBe(false);
	});
});

describe('sessions', () => {
	it('roundtrips: created token validates, garbage does not', () => {
		const token = createSession(db, 30, T0);
		expect(token.length).toBeGreaterThanOrEqual(32);
		expect(validateSession(db, token, 30, T0)).toBe(true);
		expect(validateSession(db, 'not-a-token', 30, T0)).toBe(false);
		expect(validateSession(db, '', 30, T0)).toBe(false);
	});

	it('stores only a hash of the token', () => {
		const token = createSession(db, 30, T0);
		const rows = db.select().from(authSessions).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].tokenHash).not.toContain(token);
	});

	it('expires after the configured window when unused', () => {
		const token = createSession(db, 30, T0);
		expect(validateSession(db, token, 30, at(31))).toBe(false);
	});

	it('a touch near the end of the window renews it (sliding)', () => {
		const token = createSession(db, 30, T0);
		expect(validateSession(db, token, 30, at(29))).toBe(true); // renews to day 59
		expect(validateSession(db, token, 30, at(31))).toBe(true);
	});

	it('slides expiry forward when past half-life', () => {
		const token = createSession(db, 30, T0);
		expect(validateSession(db, token, 30, at(20))).toBe(true); // renews here
		expect(validateSession(db, token, 30, at(45))).toBe(true); // alive only if renewed
	});

	it('revoke logs the token out immediately', () => {
		const token = createSession(db, 30, T0);
		revokeSession(db, token);
		expect(validateSession(db, token, 30, T0)).toBe(false);
	});

	it('prune removes only expired rows', () => {
		const dead = createSession(db, 1, T0);
		const alive = createSession(db, 30, T0);
		pruneSessions(db, at(2));
		expect(validateSession(db, alive, 30, at(2))).toBe(true);
		expect(validateSession(db, dead, 30, at(2))).toBe(false);
		expect(db.select().from(authSessions).all()).toHaveLength(1);
	});
});

describe('login throttle', () => {
	it('locks for 30s after 5 consecutive failures and resets on success', () => {
		const now = T0.getTime();
		for (let i = 0; i < 4; i++) recordLoginFailure(now);
		expect(loginLockedMs(now)).toBe(0);
		recordLoginFailure(now);
		expect(loginLockedMs(now)).toBeGreaterThan(0);
		expect(loginLockedMs(now + 31_000)).toBe(0);
		recordLoginSuccess();
		recordLoginFailure(now + 40_000);
		expect(loginLockedMs(now + 40_000)).toBe(0); // counter restarted
	});
});

describe('routeClass', () => {
	it.each([
		['/login', 'public'],
		['/manifest.webmanifest', 'public'],
		['/icon-192.png', 'public'],
		['/icon-512.png', 'public'],
		['/favicon.ico', 'public'],
		['/_app/immutable/chunk.js', 'public'],
		['/', 'protected'],
		['/log', 'protected'],
		['/stats', 'protected'],
		['/watches/3/edit', 'protected'],
		['/photos/1/abc.jpg', 'protected'],
		['/loginx', 'protected'] // prefix confusion must not leak
	])('%s -> %s', (path, cls) => {
		expect(routeClass(path)).toBe(cls);
	});
});
