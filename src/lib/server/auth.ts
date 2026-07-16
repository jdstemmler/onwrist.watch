import crypto from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { DB } from './db';
import { authSessions } from './db/schema';

export const SESSION_COOKIE = 'wrist_session';

const DAY = 86_400_000;
const LOCKOUT_MS = 30_000;
const MAX_FAILURES = 5;

/** Constant-time password check. An empty configured password fails closed. */
export function verifyPassword(supplied: string, configured: string): boolean {
	if (!configured) return false;
	// hash both sides so timingSafeEqual gets equal-length buffers
	const a = crypto.createHash('sha256').update(supplied).digest();
	const b = crypto.createHash('sha256').update(configured).digest();
	return crypto.timingSafeEqual(a, b);
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Creates a session row and returns the (unhashed) cookie token. */
export function createSession(db: DB, days: number, now = new Date()): string {
	const token = crypto.randomBytes(32).toString('base64url');
	db.insert(authSessions)
		.values({ tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + days * DAY) })
		.run();
	return token;
}

/** True for a live session; renews the expiry once past its half-life. */
export function validateSession(db: DB, token: string, days: number, now = new Date()): boolean {
	if (!token) return false;
	const row = db
		.select()
		.from(authSessions)
		.where(eq(authSessions.tokenHash, hashToken(token)))
		.get();
	if (!row || row.expiresAt.getTime() <= now.getTime()) return false;
	if (row.expiresAt.getTime() - now.getTime() < (days * DAY) / 2) {
		db.update(authSessions)
			.set({ expiresAt: new Date(now.getTime() + days * DAY) })
			.where(eq(authSessions.id, row.id))
			.run();
	}
	return true;
}

export function revokeSession(db: DB, token: string): void {
	db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token))).run();
}

export function pruneSessions(db: DB, now = new Date()): void {
	db.delete(authSessions).where(lt(authSessions.expiresAt, now)).run();
}

/* In-memory login throttle: global (single-user app, single process).
   Five consecutive failures lock the login form for 30 seconds. */
let failures = 0;
let lockedUntil = 0;

export function loginLockedMs(now = Date.now()): number {
	return Math.max(0, lockedUntil - now);
}

export function recordLoginFailure(now = Date.now()): void {
	failures += 1;
	if (failures >= MAX_FAILURES) {
		lockedUntil = now + LOCKOUT_MS;
		failures = 0;
	}
}

export function recordLoginSuccess(): void {
	failures = 0;
	lockedUntil = 0;
}

/** Routing gate used by hooks.server.ts. Everything is protected except the
 * login page and the static assets the login page itself needs. */
export function routeClass(pathname: string): 'public' | 'protected' {
	if (pathname === '/login' || pathname === '/manifest.webmanifest' || pathname === '/favicon.ico')
		return 'public';
	if (pathname.startsWith('/_app/') || pathname.startsWith('/icon-')) return 'public';
	return 'protected';
}
