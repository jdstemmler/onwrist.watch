import crypto from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { DB } from './db';
import { authSessions, users } from './db/schema';
import { hashToken } from './tokens';
import { config } from './config';
import { StateError } from './sessions';

export const SESSION_COOKIE = 'wrist_session';

const DAY = 86_400_000;

export type SessionUser = {
	id: number;
	email: string;
	role: 'admin' | 'member';
	homeTz: string;
	staleSessionHours: number;
	verified: boolean;
};

/** Creates a session row and returns the (unhashed) cookie token. Member
 * sessions get `config.sessionDays` (sliding, see validateSession); admin
 * sessions get a fixed 24h expiry that never slides. */
export async function createSession(db: DB, userId: number, now = new Date()): Promise<string> {
	const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
	const days = user?.role === 'admin' ? 1 : config.sessionDays;
	const token = crypto.randomBytes(32).toString('base64url');
	await db.insert(authSessions).values({
		userId,
		tokenHash: hashToken(token),
		expiresAt: new Date(now.getTime() + days * DAY)
	});
	return token;
}

/** Joins the session to its user in one query. Null if the token is
 * missing/garbage, the session has expired, or the user is disabled.
 * Renews (slides) the expiry for member sessions once past half-life of
 * `config.sessionDays`; admin sessions (fixed 24h) never slide. */
export async function validateSession(
	db: DB,
	token: string,
	now = new Date()
): Promise<SessionUser | null> {
	if (!token) return null;
	const rows = await db
		.select({ s: authSessions, u: users })
		.from(authSessions)
		.innerJoin(users, eq(users.id, authSessions.userId))
		.where(eq(authSessions.tokenHash, hashToken(token)))
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	const { s, u } = row;
	if (s.expiresAt.getTime() <= now.getTime()) return null;
	if (u.disabledAt) return null;

	if (u.role === 'member' && s.expiresAt.getTime() - now.getTime() < (config.sessionDays * DAY) / 2) {
		await db
			.update(authSessions)
			.set({ expiresAt: new Date(now.getTime() + config.sessionDays * DAY) })
			.where(eq(authSessions.id, s.id));
	}

	return {
		id: u.id,
		email: u.email,
		role: u.role,
		homeTz: u.homeTz,
		staleSessionHours: u.staleSessionHours,
		verified: u.emailVerifiedAt !== null
	};
}

/** Whether `hooks.server.ts` should re-set the session cookie on this
 * request so a rolling maxAge keeps sliding with activity. Mirrors
 * validateSession's slide/no-slide split: members slide (DB row *and*
 * cookie both need refreshing so the client doesn't get logged out from
 * under an alive server-side session), admins are a fixed 24h and never
 * slide either place. */
export function shouldSlideCookie(user: SessionUser | null): boolean {
	return user !== null && user.role === 'member';
}

export async function revokeSession(db: DB, token: string): Promise<void> {
	await db.delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)));
}

export async function revokeAllSessions(db: DB, userId: number): Promise<void> {
	await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function pruneSessions(db: DB, now = new Date()): Promise<void> {
	await db.delete(authSessions).where(lt(authSessions.expiresAt, now));
}

/** Guards mutating actions: throws (403) unless the session user has
 * verified their email. Call at the top of every mutating action. */
export function requireVerified(user: SessionUser): void {
	if (!user.verified) {
		throw new StateError('Verify your email to make changes — check your inbox', 403);
	}
}

/** Routing gate used by hooks.server.ts. Everything is protected except the
 * public landing page, the login/signup/verify/reset flows, and the static
 * assets they need. */
export function routeClass(pathname: string): 'public' | 'protected' {
	if (
		pathname === '/' ||
		pathname === '/login' ||
		pathname === '/signup' ||
		pathname === '/verify' ||
		pathname === '/reset' ||
		pathname === '/reset/confirm' ||
		pathname === '/manifest.webmanifest' ||
		pathname === '/favicon.ico'
	)
		return 'public';
	if (pathname.startsWith('/_app/') || pathname.startsWith('/icon-')) return 'public';
	return 'protected';
}
