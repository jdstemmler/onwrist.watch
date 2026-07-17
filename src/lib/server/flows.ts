import crypto from 'node:crypto';
import type { DB } from './db';
import type { Mailer } from './mail';
import {
	verifyEmail,
	resetEmail,
	emailChangeVerify,
	emailChangedNotice,
	accountExistsEmail
} from './mail/templates';
import { config } from './config';
import { emailKey, passwordPolicyError, hashPassword, verifyPasswordHash } from './passwords';
import { createUser, findUserByEmail, getUser, markVerified, setPassword, applyEmailChange } from './users';
import { issueToken, consumeToken, TTL } from './tokens';
import { createSession, revokeSession } from './auth';
import { rateLimit } from './rate-limit';

export type FlowDeps = { db: DB; mailer: Mailer; now?: Date };
export type CaptchaDeps = FlowDeps & {
	verifyCaptcha: (token: string, ip?: string) => Promise<boolean>;
};

export type FlowError = { ok: false; status: number; message: string };

const RATE_LIMIT_MESSAGE = 'Too many attempts — try again later';
const LOGIN_FAIL_MESSAGE = 'Email or password is wrong';
const BAD_TOKEN_MESSAGE = 'That link is no good — request a fresh one';

/** Precomputed once (lazily, memoized) so a login against a nonexistent
 * email hashes a real argon2id value instead of short-circuiting — keeps
 * "no such account" and "wrong password" indistinguishable by timing. */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
	if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(32).toString('hex'));
	return dummyHash;
}

export type CookieOptions = { httpOnly: true; sameSite: 'lax'; path: '/'; maxAge: number };

/** Admin sessions are a fixed 24h; member sessions use config.sessionDays. */
export function sessionCookieOptions(role: 'admin' | 'member'): CookieOptions {
	return {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		maxAge: (role === 'admin' ? 1 : config.sessionDays) * 86_400
	};
}

/** Signup: rate-limited by IP, captcha-gated, uniform response regardless of
 * whether the email already has an account (only the mail sent differs). */
export async function signup(
	deps: CaptchaDeps,
	input: { email: string; password: string; captchaToken: string },
	ip: string
): Promise<{ ok: true; sent: true } | FlowError> {
	const { db, mailer, now, verifyCaptcha } = deps;

	if (!(await rateLimit(db, 'signupIp', `signup:ip:${ip}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}
	if (!(await verifyCaptcha(input.captchaToken, ip))) {
		return { ok: false, status: 400, message: 'Captcha failed — try again' };
	}
	const policyError = passwordPolicyError(input.password);
	if (policyError) return { ok: false, status: 400, message: policyError };

	const existing = await findUserByEmail(db, input.email);
	if (existing) {
		await mailer.send(accountExistsEmail(existing.email));
	} else {
		const user = await createUser(db, input.email, input.password);
		const token = await issueToken(db, user.id, 'verify', TTL.verify, undefined, now);
		await mailer.send(verifyEmail(user.email, token));
	}
	return { ok: true, sent: true };
}

/** Consumes a token from the `/verify` link — either a signup verification
 * or (same route) the confirmation half of a change-email flow. Never
 * throws on a bad token; the page always renders 200. */
export async function verify(deps: FlowDeps, token: string): Promise<{ ok: true } | { ok: false; message: string }> {
	const { db, mailer, now } = deps;

	const verifyRow = await consumeToken(db, token, 'verify', now);
	if (verifyRow) {
		await markVerified(db, verifyRow.userId, now);
		return { ok: true };
	}

	const changeRow = await consumeToken(db, token, 'email_change', now);
	if (changeRow) {
		const oldUser = await getUser(db, changeRow.userId);
		await applyEmailChange(db, changeRow.userId, changeRow.newEmail!, now);
		if (oldUser) await mailer.send(emailChangedNotice(oldUser.email));
		return { ok: true };
	}

	return { ok: false, message: BAD_TOKEN_MESSAGE };
}

/** Login: rate-limited by IP and by account, timing-equalized against
 * account enumeration, fixation-safe (issues a fresh session token; revokes
 * the pre-login cookie's token if one was supplied). Unverified users are
 * allowed to log in — browse-only enforcement is `requireVerified`. */
export async function login(
	deps: FlowDeps,
	input: { email: string; password: string; oldToken?: string },
	ip: string
): Promise<
	| { ok: true; token: string; cookie: CookieOptions; userId: number; verified: boolean }
	| FlowError
> {
	const { db, now } = deps;

	const ipOk = await rateLimit(db, 'loginIp', `login:ip:${ip}`, now);
	const acctOk = await rateLimit(db, 'loginAccount', `login:acct:${emailKey(input.email)}`, now);
	if (!ipOk || !acctOk) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await findUserByEmail(db, input.email);
	const hashToCheck = user?.passwordHash ?? (await getDummyHash());
	const passwordOk = await verifyPasswordHash(hashToCheck, input.password);

	if (!user || !passwordOk || user.disabledAt) {
		return { ok: false, status: 401, message: LOGIN_FAIL_MESSAGE };
	}

	if (input.oldToken) await revokeSession(db, input.oldToken);
	const token = await createSession(db, user.id, now);
	return {
		ok: true,
		token,
		cookie: sessionCookieOptions(user.role),
		userId: user.id,
		verified: user.emailVerifiedAt !== null
	};
}

/** Reset request: uniform response regardless of account existence. */
export async function requestReset(
	deps: FlowDeps,
	input: { email: string }
): Promise<{ ok: true; sent: true } | FlowError> {
	const { db, mailer, now } = deps;

	if (!(await rateLimit(db, 'resetAccount', `reset:acct:${emailKey(input.email)}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await findUserByEmail(db, input.email);
	if (user) {
		const token = await issueToken(db, user.id, 'reset', TTL.reset, undefined, now);
		await mailer.send(resetEmail(user.email, token));
	}
	return { ok: true, sent: true };
}

/** Reset confirm: policy-checks the new password before touching the token,
 * so a doomed submission never burns a single-use token. Revokes every
 * other session for the account (via setPassword). */
export async function confirmReset(
	deps: FlowDeps,
	input: { token: string; password: string }
): Promise<{ ok: true } | FlowError> {
	const { db, now } = deps;

	const policyError = passwordPolicyError(input.password);
	if (policyError) return { ok: false, status: 400, message: policyError };

	const row = await consumeToken(db, input.token, 'reset', now);
	if (!row) return { ok: false, status: 400, message: BAD_TOKEN_MESSAGE };

	await setPassword(db, row.userId, input.password);
	return { ok: true };
}

/** Change-email request: requires re-verifying the current password.
 * Uniform response whether or not the new address already has an account —
 * the existing-account branch sends a side-channel notice instead of a
 * confirmation link. Sessions are retained (this isn't a password change). */
export async function requestEmailChange(
	deps: FlowDeps,
	userId: number,
	currentPassword: string,
	newEmail: string
): Promise<{ ok: true; sent: true } | FlowError> {
	const { db, mailer, now } = deps;

	if (!(await rateLimit(db, 'emailChange', `emailchange:acct:${userId}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await getUser(db, userId);
	if (!user || !(await verifyPasswordHash(user.passwordHash, currentPassword))) {
		return { ok: false, status: 401, message: 'Current password is wrong' };
	}

	const normalizedNew = emailKey(newEmail);
	const existing = await findUserByEmail(db, normalizedNew);
	if (existing) {
		await mailer.send(accountExistsEmail(existing.email));
	} else {
		const token = await issueToken(db, userId, 'email_change', TTL.emailChange, normalizedNew, now);
		await mailer.send(emailChangeVerify(normalizedNew, token));
	}
	return { ok: true, sent: true };
}

/** Resend verification: rate-limited per account; a no-op send (but still
 * "sent") when the account is already verified, so this never becomes an
 * enumeration or spam vector against a stranger's inbox. */
export async function resendVerification(
	deps: FlowDeps,
	userId: number
): Promise<{ ok: true; sent: true } | FlowError> {
	const { db, mailer, now } = deps;

	if (!(await rateLimit(db, 'resendVerify', `resendverify:acct:${userId}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await getUser(db, userId);
	if (user && !user.emailVerifiedAt) {
		const token = await issueToken(db, userId, 'verify', TTL.verify, undefined, now);
		await mailer.send(verifyEmail(user.email, token));
	}
	return { ok: true, sent: true };
}
