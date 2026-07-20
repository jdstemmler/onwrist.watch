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
import { emailKey, emailFormatError, hashPassword, verifyPasswordHash } from './passwords';
import { passwordPolicyError } from './password-policy';
import {
	createUser,
	findUserByEmail,
	getUser,
	markVerified,
	setPassword,
	applyEmailChange,
	isUniqueViolation
} from './users';
import { issueToken, consumeToken, TTL } from './tokens';
import { createSession, revokeSession } from './auth';
import { rateLimit, rateLimitCheck } from './rate-limit';
import { StateError } from './sessions';

/** Fire-and-forget send for the network leg of a user-facing flow: never
 * awaited, so its latency can't become a timing oracle for anything the
 * caller branched on (account existence, email availability, ...). The fake
 * mailer used in tests records synchronously before its promise settles, so
 * `mailer.sent` assertions still see it immediately after the flow returns. */
function sendAsync(mailer: Mailer, mail: Parameters<Mailer['send']>[0]): void {
	mailer.send(mail).catch((e) => console.error('mail send failed', e));
}

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

export type CookieOptions = {
	httpOnly: true;
	sameSite: 'lax';
	path: '/';
	secure: boolean;
	maxAge: number;
};

/** Admin sessions are a fixed 24h; member sessions use config.sessionDays.
 * `secure` is pinned explicitly in production rather than trusting
 * SvelteKit's URL-based default, so a misconfigured ORIGIN can't silently
 * downgrade the session cookie to plain HTTP. */
export function sessionCookieOptions(role: 'admin' | 'member'): CookieOptions {
	return {
		httpOnly: true,
		sameSite: 'lax',
		path: '/',
		secure: process.env.NODE_ENV === 'production',
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
	const formatError = emailFormatError(input.email);
	if (formatError) return { ok: false, status: 400, message: formatError };
	if (!(await verifyCaptcha(input.captchaToken, ip))) {
		return { ok: false, status: 400, message: 'Captcha failed — try again' };
	}
	const policyError = passwordPolicyError(input.password);
	if (policyError) return { ok: false, status: 400, message: policyError };

	const existing = await findUserByEmail(db, input.email);
	if (existing) {
		// Pay the same argon2 cost the "new account" branch pays via
		// hashPassword — otherwise the awaited-hash time itself becomes an
		// enumeration signal even with the network send made fire-and-forget.
		await verifyPasswordHash(await getDummyHash(), input.password);
		sendAsync(mailer, accountExistsEmail(existing.email));
	} else {
		try {
			const user = await createUser(db, input.email, input.password);
			const token = await issueToken(db, user.id, 'verify', TTL.verify, undefined, now);
			sendAsync(mailer, verifyEmail(user.email, token));
		} catch (e) {
			if (!isUniqueViolation(e)) throw e;
			// TOCTOU: another request created this email between our
			// existence check and this insert. Same uniform outcome as the
			// existing-email branch above — never a 500.
			await verifyPasswordHash(await getDummyHash(), input.password);
			sendAsync(mailer, accountExistsEmail(emailKey(input.email)));
		}
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
		try {
			await applyEmailChange(db, changeRow.userId, changeRow.newEmail!, now);
		} catch (e) {
			if (!isUniqueViolation(e)) throw e;
			// TOCTOU: someone else claimed this address between the
			// change-request and now clicking the link. The token is already
			// consumed (single-use); fold this into the generic bad-token
			// failure rather than a verify-page 500.
			return { ok: false, message: BAD_TOKEN_MESSAGE };
		}
		if (oldUser) sendAsync(mailer, emailChangedNotice(oldUser.email));
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
	const ipKey = `login:ip:${ip}`;
	const acctKey = `login:acct:${emailKey(input.email)}`;

	// Read-only: don't consume a slot just for showing up. Only a FAILED
	// attempt burns one below — otherwise a legitimate user's own successful
	// logins would eventually lock them out, and an attacker could burn a
	// victim's login budget by triggering successes (there are none to
	// trigger, but the asymmetry is the point).
	if (!(await rateLimitCheck(db, 'loginIp', ipKey, now)) || !(await rateLimitCheck(db, 'loginAccount', acctKey, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await findUserByEmail(db, input.email);
	const hashToCheck = user?.passwordHash ?? (await getDummyHash());
	const passwordOk = await verifyPasswordHash(hashToCheck, input.password);

	if (!user || !passwordOk || user.disabledAt) {
		await rateLimit(db, 'loginIp', ipKey, now);
		await rateLimit(db, 'loginAccount', acctKey, now);
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
	input: { email: string },
	ip: string
): Promise<{ ok: true; sent: true } | FlowError> {
	const { db, mailer, now } = deps;

	if (!(await rateLimit(db, 'resetIp', `reset:ip:${ip}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}
	const formatError = emailFormatError(input.email);
	if (formatError) return { ok: false, status: 400, message: formatError };
	if (!(await rateLimit(db, 'resetAccount', `reset:acct:${emailKey(input.email)}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await findUserByEmail(db, input.email);
	if (user) {
		const token = await issueToken(db, user.id, 'reset', TTL.reset, undefined, now);
		sendAsync(mailer, resetEmail(user.email, token));
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

	const formatError = emailFormatError(newEmail);
	if (formatError) return { ok: false, status: 400, message: formatError };

	const normalizedNew = emailKey(newEmail);
	const existing = await findUserByEmail(db, normalizedNew);
	if (existing) {
		sendAsync(mailer, accountExistsEmail(existing.email));
	} else {
		const token = await issueToken(db, userId, 'email_change', TTL.emailChange, normalizedNew, now);
		sendAsync(mailer, emailChangeVerify(normalizedNew, token));
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
		sendAsync(mailer, verifyEmail(user.email, token));
	}
	return { ok: true, sent: true };
}

/** Password change (settings): rate-limited per account, requires
 * re-verifying the current password before touching it. setPassword revokes
 * every other session for the account on success — the caller (the settings
 * route) clears the current cookie and bounces to /login. */
export async function changePassword(
	deps: FlowDeps,
	userId: number,
	currentPassword: string,
	newPassword: string
): Promise<{ ok: true } | FlowError> {
	const { db, now } = deps;

	if (!(await rateLimit(db, 'passwordChange', `pwchange:acct:${userId}`, now))) {
		return { ok: false, status: 429, message: RATE_LIMIT_MESSAGE };
	}

	const user = await getUser(db, userId);
	if (!user || !(await verifyPasswordHash(user.passwordHash, currentPassword))) {
		return { ok: false, status: 401, message: 'Current password is wrong' };
	}

	try {
		await setPassword(db, userId, newPassword);
	} catch (e) {
		if (e instanceof StateError) return { ok: false, status: e.status, message: e.message };
		throw e;
	}
	return { ok: true };
}
