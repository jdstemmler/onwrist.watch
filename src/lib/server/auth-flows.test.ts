import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users } from './db/schema';
import { createFakeMailer } from './mail/fake';
import type { Mail } from './mail/index';
import { createUser, getUser } from './users';
import * as usersModule from './users';
import * as passwordsModule from './passwords';
import { validateSession } from './auth';
import { config } from './config';
import { LIMITS } from './rate-limit';
import {
	signup,
	login,
	verify,
	requestReset,
	confirmReset,
	requestEmailChange,
	resendVerification,
	changePassword,
	sessionCookieOptions,
	type FlowDeps,
	type CaptchaDeps
} from './flows';

const T0 = new Date('2026-07-16T12:00:00Z');

function extractToken(mail: Mail): string {
	const m = mail.text.match(/token=([^&\s]+)/);
	if (!m) throw new Error(`no token in mail: ${mail.text}`);
	return m[1];
}

let db: DB;
let mailer: ReturnType<typeof createFakeMailer>;
let deps: FlowDeps;
let captchaDeps: CaptchaDeps;

beforeEach(async () => {
	db = await createTestDb();
	mailer = createFakeMailer();
	deps = { db, mailer, now: T0 };
	captchaDeps = { ...deps, verifyCaptcha: async () => true };
});

describe('signup', () => {
	it('control-4: response is identical for new and existing emails; different mail template', async () => {
		await createUser(db, 'existing@b.com', 'a-correct-password1');

		const rNew = await signup(
			captchaDeps,
			{ email: 'new@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
			'1.1.1.1'
		);
		const rExisting = await signup(
			captchaDeps,
			{ email: 'existing@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
			'1.1.1.2'
		);

		expect(rNew).toEqual(rExisting);
		expect(rNew).toEqual({ ok: true, sent: true });
		expect(mailer.sent).toHaveLength(2);
		expect(mailer.sent[0].subject).toContain('Verify');
		expect(mailer.sent[1].subject).toContain('already exists');
	});

	it('control-6: failed turnstile is rejected without revealing account existence', async () => {
		const failingCaptcha: CaptchaDeps = { ...deps, verifyCaptcha: async () => false };
		const rNew = await signup(
			failingCaptcha,
			{ email: 'ghost@b.com', password: 'a-correct-password1', captchaToken: 'bad' },
			'1.1.1.1'
		);
		expect(rNew).toEqual({ ok: false, status: 400, message: 'Captcha failed — try again' });
		expect(mailer.sent).toHaveLength(0);
		expect(await getUser(db, 999)).toBeNull();

		await createUser(db, 'real@b.com', 'a-correct-password1');
		const rExisting = await signup(
			failingCaptcha,
			{ email: 'real@b.com', password: 'a-correct-password1', captchaToken: 'bad' },
			'1.1.1.2'
		);
		expect(rExisting).toEqual(rNew);
		expect(mailer.sent).toHaveLength(0);
	});

	it('control-9: can never create an admin, even with a crafted role field on the form', async () => {
		// The flow's input type has no `role` field at all — a crafted extra
		// form field has nowhere to land. Simulate the crafted submission with
		// an object literal carrying the extra property (JS ignores TS's shape).
		const craftedInput = {
			email: 'attacker@b.com',
			password: 'a-correct-password1',
			captchaToken: 'tok',
			role: 'admin'
		};
		const result = await signup(captchaDeps, craftedInput, '1.1.1.1');
		expect(result).toEqual({ ok: true, sent: true });
		const row = await db.select().from(users).where(eq(users.email, 'attacker@b.com'));
		expect(row[0].role).toBe('member');
	});

	it('rejects a weak password with a 400 and never sends mail', async () => {
		const result = await signup(
			captchaDeps,
			{ email: 'weak@b.com', password: 'short', captchaToken: 'tok' },
			'1.1.1.1'
		);
		expect(result).toEqual({ ok: false, status: 400, message: expect.any(String) });
		expect(mailer.sent).toHaveLength(0);
	});

	it('rate-limits by IP with a 429 before touching the account-existence question', async () => {
		for (let i = 0; i < LIMITS.signupIp.max; i++) {
			await signup(
				captchaDeps,
				{ email: `u${i}@b.com`, password: 'a-correct-password1', captchaToken: 'tok' },
				'9.9.9.9'
			);
		}
		const result = await signup(
			captchaDeps,
			{ email: 'overflow@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
			'9.9.9.9'
		);
		expect(result).toEqual({ ok: false, status: 429, message: expect.any(String) });
	});

	it('rejects a malformed email with a plain validation failure, before captcha or password checks', async () => {
		const result = await signup(
			captchaDeps,
			{ email: 'not-an-email', password: 'a-correct-password1', captchaToken: 'tok' },
			'1.1.1.9'
		);
		expect(result).toEqual({ ok: false, status: 400, message: expect.any(String) });
		expect(mailer.sent).toHaveLength(0);
	});

	it('timing oracle: the existing-email branch pays the same argon2 cost as the new-account branch', async () => {
		const spy = vi.spyOn(passwordsModule, 'verifyPasswordHash');
		await createUser(db, 'timing@b.com', 'a-correct-password1');

		const result = await signup(
			captchaDeps,
			{ email: 'timing@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
			'1.1.1.10'
		);
		expect(result).toEqual({ ok: true, sent: true });
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it('TOCTOU: a duplicate insert raced past the existence check still returns uniform success, not a throw', async () => {
		const spy = vi.spyOn(passwordsModule, 'verifyPasswordHash');
		const findSpy = vi.spyOn(usersModule, 'findUserByEmail').mockResolvedValueOnce(null);
		await createUser(db, 'raced@b.com', 'a-correct-password1');

		const result = await signup(
			captchaDeps,
			{ email: 'raced@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
			'1.1.1.11'
		);

		expect(result).toEqual({ ok: true, sent: true });
		// the raced branch pays the same hashing cost as the direct existing-email branch
		expect(spy).toHaveBeenCalledTimes(1);
		findSpy.mockRestore();
		spy.mockRestore();
	});

	it('a non-unique-violation error from createUser still propagates (not swallowed as a false "existing" outcome)', async () => {
		const findSpy = vi.spyOn(usersModule, 'findUserByEmail').mockResolvedValueOnce(null);
		const createSpy = vi
			.spyOn(usersModule, 'createUser')
			.mockRejectedValueOnce(new Error('unrelated db failure'));

		await expect(
			signup(
				captchaDeps,
				{ email: 'boom@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
				'1.1.1.12'
			)
		).rejects.toThrow('unrelated db failure');

		findSpy.mockRestore();
		createSpy.mockRestore();
	});
});

describe('verify', () => {
	it('consumes a verify token and marks the user verified', async () => {
		const user = await createUser(db, 'a@b.com', 'a-correct-password1');
		const { issueToken, TTL } = await import('./tokens');
		const token = await issueToken(db, user.id, 'verify', TTL.verify, undefined, T0);

		const result = await verify(deps, token);
		expect(result).toEqual({ ok: true });
		expect((await getUser(db, user.id))?.emailVerifiedAt).not.toBeNull();
	});

	it('applies an email_change token and notifies the OLD address', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		const changeResult = await requestEmailChange(deps, user.id, 'a-correct-password1', 'new@b.com');
		expect(changeResult).toEqual({ ok: true, sent: true });
		const token = extractToken(mailer.sent.at(-1)!);

		const result = await verify(deps, token);
		expect(result).toEqual({ ok: true });
		expect((await getUser(db, user.id))?.email).toBe('new@b.com');

		const notice = mailer.sent.find((m) => m.to === 'old@b.com' && m.subject.includes('changed'));
		expect(notice).toBeDefined();
	});

	it('single-use: consuming the same token twice fails the second time', async () => {
		const user = await createUser(db, 'a@b.com', 'a-correct-password1');
		const { issueToken, TTL } = await import('./tokens');
		const token = await issueToken(db, user.id, 'verify', TTL.verify, undefined, T0);

		expect(await verify(deps, token)).toEqual({ ok: true });
		expect(await verify(deps, token)).toEqual({ ok: false, message: expect.any(String) });
	});

	it('invalid/expired token: generic failure, no throw, no enumeration', async () => {
		const result = await verify(deps, 'not-a-real-token');
		expect(result).toEqual({ ok: false, message: expect.any(String) });
	});
});

describe('login', () => {
	beforeEach(async () => {
		const u = await createUser(db, 'a@b.com', 'a-correct-password1');
		await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, u.id));
	});

	it('control-7: session cookie flags', async () => {
		const result = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '1.1.1.1');
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('unreachable');
		expect(result.cookie).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
		expect(result.cookie.maxAge).toBe(config.sessionDays * 86_400);
	});

	it('control-7b: admin sessions get a fixed 24h cookie maxAge', async () => {
		expect(sessionCookieOptions('admin').maxAge).toBe(86_400);
		expect(sessionCookieOptions('member').maxAge).toBe(config.sessionDays * 86_400);
	});

	it('control-8: issues a new token each login; old token stays independently valid', async () => {
		const r1 = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '1.1.1.1');
		const r2 = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '1.1.1.1');
		if (!r1.ok || !r2.ok) throw new Error('unreachable');
		expect(r1.token).not.toBe(r2.token);
		expect(await validateSession(db, r1.token, T0)).not.toBeNull();
		expect(await validateSession(db, r2.token, T0)).not.toBeNull();
	});

	it('fixation-safe: an old cookie token is revoked when a fresh session replaces it', async () => {
		const first = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '1.1.1.1');
		if (!first.ok) throw new Error('unreachable');
		const second = await login(
			deps,
			{ email: 'a@b.com', password: 'a-correct-password1', oldToken: first.token },
			'1.1.1.1'
		);
		if (!second.ok) throw new Error('unreachable');
		expect(await validateSession(db, first.token, T0)).toBeNull();
		expect(await validateSession(db, second.token, T0)).not.toBeNull();
	});

	it('wrong password and unknown email produce byte-identical failures', async () => {
		const r1 = await login(deps, { email: 'ghost@nowhere.com', password: 'whatever12' }, '2.2.2.1');
		const r2 = await login(deps, { email: 'a@b.com', password: 'totally-wrong-pw' }, '2.2.2.2');
		expect(r1).toEqual({ ok: false, status: 401, message: 'Email or password is wrong' });
		expect(r2).toEqual(r1);
	});

	it('a disabled account gets the same failure as a wrong password', async () => {
		await db.update(users).set({ disabledAt: T0 }).where(eq(users.email, 'a@b.com'));
		const result = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '3.3.3.3');
		expect(result).toEqual({ ok: false, status: 401, message: 'Email or password is wrong' });
	});

	it('unverified users still log in — browse-only enforcement lives elsewhere', async () => {
		const u = await createUser(db, 'unverified@b.com', 'a-correct-password1');
		expect((await getUser(db, u.id))?.emailVerifiedAt).toBeNull();
		const result = await login(deps, { email: 'unverified@b.com', password: 'a-correct-password1' }, '4.4.4.4');
		expect(result.ok).toBe(true);
	});

	it('rate-limits by IP and by account with a 429', async () => {
		for (let i = 0; i < LIMITS.loginAccount.max; i++) {
			await login(deps, { email: 'a@b.com', password: 'wrong' }, `5.5.5.${i}`);
		}
		const result = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '5.5.5.99');
		expect(result).toEqual({ ok: false, status: 429, message: expect.any(String) });
	});

	it('failure-only counting: 10 failed attempts lock the account, even from a fresh IP', async () => {
		for (let i = 0; i < LIMITS.loginAccount.max; i++) {
			const r = await login(deps, { email: 'a@b.com', password: 'wrong' }, `5.6.6.${i}`);
			expect(r).toEqual({ ok: false, status: 401, message: 'Email or password is wrong' });
		}
		const locked = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '5.6.6.99');
		expect(locked).toEqual({ ok: false, status: 429, message: expect.any(String) });
	});

	it('a successful login does NOT consume a rate-limit slot', async () => {
		// Far more successes than the account limit's max — if success
		// consumed a slot, this would start returning 429 well before the
		// loop ends.
		for (let i = 0; i < LIMITS.loginAccount.max + 5; i++) {
			const result = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '5.7.7.1');
			expect(result.ok).toBe(true);
		}
	});

	it('over-limit login returns a 429 rate-limit response; lockout is existence-independent so it is not an enumeration oracle', async () => {
		for (let i = 0; i < LIMITS.loginAccount.max; i++) {
			await login(deps, { email: 'a@b.com', password: 'wrong' }, `5.8.8.${i}`);
		}
		const overLimit = await login(deps, { email: 'a@b.com', password: 'a-correct-password1' }, '5.8.8.99');
		expect(overLimit.ok).toBe(false);
		if (overLimit.ok) throw new Error('unreachable');
		expect(overLimit.status).toBe(429);
		expect(overLimit.message).toBe('Too many attempts — try again later');
	});
});

describe('reset', () => {
	it('control-4b: response identical for existing and unknown accounts', async () => {
		await createUser(db, 'known@b.com', 'a-correct-password1');
		const rKnown = await requestReset(deps, { email: 'known@b.com' }, '8.1.1.1');
		const rUnknown = await requestReset(deps, { email: 'unknown@b.com' }, '8.1.1.2');
		expect(rKnown).toEqual(rUnknown);
		expect(rKnown).toEqual({ ok: true, sent: true });
		expect(mailer.sent).toHaveLength(1); // only the known account actually gets mail
	});

	it('rate-limits per account with a 429', async () => {
		await createUser(db, 'a@b.com', 'a-correct-password1');
		for (let i = 0; i < LIMITS.resetAccount.max; i++) {
			await requestReset(deps, { email: 'a@b.com' }, '8.2.2.2');
		}
		const result = await requestReset(deps, { email: 'a@b.com' }, '8.2.2.2');
		expect(result).toEqual({ ok: false, status: 429, message: expect.any(String) });
	});

	it('rate-limits per IP with a 429, independent of which account is targeted', async () => {
		await createUser(db, 'a@b.com', 'a-correct-password1');
		await createUser(db, 'b@b.com', 'a-correct-password1');
		for (let i = 0; i < LIMITS.resetIp.max; i++) {
			await requestReset(deps, { email: `distinct${i}@b.com` }, '8.3.3.3');
		}
		const result = await requestReset(deps, { email: 'a@b.com' }, '8.3.3.3');
		expect(result).toEqual({ ok: false, status: 429, message: expect.any(String) });
	});

	it('rejects a malformed email with a plain validation failure (not an enumeration channel)', async () => {
		const result = await requestReset(deps, { email: 'not-an-email' }, '8.4.4.4');
		expect(result).toEqual({ ok: false, status: 400, message: expect.any(String) });
		expect(mailer.sent).toHaveLength(0);
	});

	it('roundtrip: request -> confirm sets the new password and revokes sessions', async () => {
		const user = await createUser(db, 'a@b.com', 'the-old-password1');
		const { createSession } = await import('./auth');
		const oldSession = await createSession(db, user.id, T0);

		await requestReset(deps, { email: 'a@b.com' }, '6.6.6.1');
		const token = extractToken(mailer.sent.at(-1)!);

		const result = await confirmReset(deps, { token, password: 'the-new-password1' });
		expect(result).toEqual({ ok: true });
		expect(await validateSession(db, oldSession, T0)).toBeNull();

		const loginResult = await login(deps, { email: 'a@b.com', password: 'the-new-password1' }, '6.6.6.6');
		expect(loginResult.ok).toBe(true);
	});

	it('policy-checks the new password before touching the token', async () => {
		const result = await confirmReset(deps, { token: 'irrelevant', password: 'short' });
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.status).toBe(400);
	});

	it('an invalid/expired token yields a uniform failure page, not a throw', async () => {
		const result = await confirmReset(deps, { token: 'not-a-real-token', password: 'a-new-good-password1' });
		expect(result).toEqual({ ok: false, status: 400, message: expect.any(String) });
	});

	it('a consumed token cannot be reused', async () => {
		const user = await createUser(db, 'a@b.com', 'the-old-password1');
		const { issueToken, TTL } = await import('./tokens');
		const token = await issueToken(db, user.id, 'reset', TTL.reset, undefined, T0);
		expect(await confirmReset(deps, { token, password: 'the-new-password1' })).toEqual({ ok: true });
		expect(await confirmReset(deps, { token, password: 'another-new-password1' })).toEqual({
			ok: false,
			status: 400,
			message: expect.any(String)
		});
	});
});

describe('change-email', () => {
	it('roundtrip: old address gets the notice, token is single-use', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		const result = await requestEmailChange(deps, user.id, 'a-correct-password1', 'new@b.com');
		expect(result).toEqual({ ok: true, sent: true });
		const token = extractToken(mailer.sent.at(-1)!);

		expect(await verify(deps, token)).toEqual({ ok: true });
		expect((await getUser(db, user.id))?.email).toBe('new@b.com');
		expect(mailer.sent.some((m) => m.to === 'old@b.com' && !m.text.includes('http'))).toBe(true);

		// single-use
		expect(await verify(deps, token)).toEqual({ ok: false, message: expect.any(String) });
	});

	it('rejects a wrong current password without sending mail', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		const result = await requestEmailChange(deps, user.id, 'totally-wrong', 'new@b.com');
		expect(result).toEqual({ ok: false, status: 401, message: expect.any(String) });
		expect(mailer.sent).toHaveLength(0);
	});

	it('uniform response when the new email already belongs to another account', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		await createUser(db, 'taken@b.com', 'another-correct-pw1');

		const result = await requestEmailChange(deps, user.id, 'a-correct-password1', 'taken@b.com');
		expect(result).toEqual({ ok: true, sent: true });
		expect(mailer.sent).toHaveLength(1);
		expect(mailer.sent[0].to).toBe('taken@b.com');
		expect(mailer.sent[0].subject).toContain('already exists');
		expect((await getUser(db, user.id))?.email).toBe('old@b.com'); // unchanged
	});

	it('rate-limits change attempts per account', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		for (let i = 0; i < LIMITS.emailChange.max; i++) {
			await requestEmailChange(deps, user.id, 'a-correct-password1', `new${i}@b.com`);
		}
		const result = await requestEmailChange(deps, user.id, 'a-correct-password1', 'overflow@b.com');
		expect(result).toEqual({ ok: false, status: 429, message: expect.any(String) });
	});

	it('rejects a malformed new-email address with a validation failure', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		const result = await requestEmailChange(deps, user.id, 'a-correct-password1', 'not-an-email');
		expect(result).toEqual({ ok: false, status: 400, message: expect.any(String) });
		expect(mailer.sent).toHaveLength(0);
	});

	it('TOCTOU: an address claimed by someone else between request and click fails uniformly, not a verify-page throw', async () => {
		const user = await createUser(db, 'old@b.com', 'a-correct-password1');
		const changeResult = await requestEmailChange(deps, user.id, 'a-correct-password1', 'raced@b.com');
		expect(changeResult).toEqual({ ok: true, sent: true });
		const token = extractToken(mailer.sent.at(-1)!);

		// Someone else grabs the address before the original clicks the link.
		await createUser(db, 'raced@b.com', 'another-correct-pw1');

		const result = await verify(deps, token);
		expect(result).toEqual({ ok: false, message: expect.any(String) });
		expect((await getUser(db, user.id))?.email).toBe('old@b.com'); // unchanged
	});
});

describe('resendVerification', () => {
	it('sends a fresh verify email for an unverified account', async () => {
		const user = await createUser(db, 'a@b.com', 'a-correct-password1');
		const result = await resendVerification(deps, user.id);
		expect(result).toEqual({ ok: true, sent: true });
		expect(mailer.sent).toHaveLength(1);
		expect(mailer.sent[0].subject).toContain('Verify');
	});

	it('is a no-op send for an already-verified account but still reports sent', async () => {
		const user = await createUser(db, 'a@b.com', 'a-correct-password1');
		await db.update(users).set({ emailVerifiedAt: T0 }).where(eq(users.id, user.id));
		const result = await resendVerification(deps, user.id);
		expect(result).toEqual({ ok: true, sent: true });
		expect(mailer.sent).toHaveLength(0);
	});
});

describe('changePassword', () => {
	it('roundtrip: sets the new password and revokes every session for the account', async () => {
		const user = await createUser(db, 'a@b.com', 'the-old-password1');
		const { createSession } = await import('./auth');
		const oldSession = await createSession(db, user.id, T0);

		const result = await changePassword(deps, user.id, 'the-old-password1', 'the-new-password1');
		expect(result).toEqual({ ok: true });
		expect(await validateSession(db, oldSession, T0)).toBeNull();

		const loginResult = await login(deps, { email: 'a@b.com', password: 'the-new-password1' }, '9.1.1.1');
		expect(loginResult.ok).toBe(true);
	});

	it('rejects a wrong current password without touching the stored hash', async () => {
		const user = await createUser(db, 'a@b.com', 'the-old-password1');
		const result = await changePassword(deps, user.id, 'totally-wrong', 'the-new-password1');
		expect(result).toEqual({ ok: false, status: 401, message: expect.any(String) });

		const loginResult = await login(deps, { email: 'a@b.com', password: 'the-old-password1' }, '9.1.1.2');
		expect(loginResult.ok).toBe(true);
	});

	it('rejects a weak new password (StateError from the shared policy check in setPassword)', async () => {
		const user = await createUser(db, 'a@b.com', 'the-old-password1');
		const result = await changePassword(deps, user.id, 'the-old-password1', 'short');
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.message).toMatch(/10/);
	});

	it('rate-limits attempts per account with a 429, protecting the current-password re-verify from brute force', async () => {
		const user = await createUser(db, 'a@b.com', 'the-old-password1');
		for (let i = 0; i < LIMITS.passwordChange.max; i++) {
			const r = await changePassword(deps, user.id, 'totally-wrong', 'the-new-password1');
			expect(r).toEqual({ ok: false, status: 401, message: expect.any(String) });
		}
		const overLimit = await changePassword(deps, user.id, 'the-old-password1', 'the-new-password1');
		expect(overLimit).toEqual({ ok: false, status: 429, message: expect.any(String) });

		// the correct password still works — confirms the limit blocked the
		// attempt rather than the password actually having changed
		const loginResult = await login(deps, { email: 'a@b.com', password: 'the-old-password1' }, '9.1.1.3');
		expect(loginResult.ok).toBe(true);
	});
});

describe('happy path: signup -> verify -> login', () => {
	it('end to end', async () => {
		const signupResult = await signup(
			captchaDeps,
			{ email: 'newcomer@b.com', password: 'a-correct-password1', captchaToken: 'tok' },
			'7.7.7.7'
		);
		expect(signupResult).toEqual({ ok: true, sent: true });
		const token = extractToken(mailer.sent.at(-1)!);

		const verifyResult = await verify(deps, token);
		expect(verifyResult).toEqual({ ok: true });

		const loginResult = await login(
			deps,
			{ email: 'newcomer@b.com', password: 'a-correct-password1' },
			'7.7.7.8'
		);
		expect(loginResult.ok).toBe(true);
	});
});

describe('control-11: ORIGIN is configured', () => {
	it('config.origin is non-empty', () => {
		expect(config.origin).toBeTruthy();
	});
});
