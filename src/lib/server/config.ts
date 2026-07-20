export const config = {
	appName: process.env.APP_NAME ?? 'onwrist',
	sessionDays: Number(process.env.SESSION_DAYS ?? 30),
	dataDir: process.env.DATA_DIR ?? './data',
	origin: process.env.ORIGIN ?? 'http://localhost:5199',
	mailFrom: process.env.MAIL_FROM ?? '',
	resendApiKey: process.env.RESEND_API_KEY ?? '',
	turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? '',
	turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
	// S3-compatible photo storage (e.g. Backblaze B2, Cloudflare R2). All
	// unset (the self-hosting default) ⇒ photos live on local disk under
	// DATA_DIR via the fs driver. Setting them switches getStorage() to the
	// S3 driver; partial configuration is rejected at boot (assertConfig).
	s3: {
		endpoint: process.env.S3_ENDPOINT ?? '',
		region: process.env.S3_REGION ?? '',
		bucket: process.env.S3_BUCKET ?? '',
		accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? ''
	}
};

/** Guards the localhost ORIGIN fallback from silently shipping to
 * production: unset ORIGIN there means every verify/reset/change-email link
 * mailed out points at localhost, which is a broken-links bug dressed up as
 * a fail-open security issue. Called at boot (hooks.server.ts) rather than
 * thrown at module load — that keeps it testable across NODE_ENV values
 * without juggling module-cache resets/dynamic re-imports per test case.
 *
 * Also surfaces production misconfigurations that would otherwise fail
 * silently at runtime: a garbage SESSION_DAYS (NaN cookie maxAge → sessions
 * that never validate), mail that logs recovery links to stdout or gets
 * rejected sender-less by Resend, and missing Turnstile keys (the captcha
 * fails closed, so signup is effectively disabled). */
export function assertConfig(): void {
	const sessionDays = process.env.SESSION_DAYS;
	if (sessionDays != null && sessionDays !== '' && !(Number(sessionDays) > 0)) {
		throw new Error(`SESSION_DAYS must be a positive number, got '${sessionDays}'`);
	}
	// All-or-nothing: a half-configured S3 block would otherwise select the
	// S3 driver and fail on the first photo operation instead of at boot.
	const s3Vars = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
	const s3Set = s3Vars.filter((v) => process.env[v]);
	if (s3Set.length > 0 && s3Set.length < s3Vars.length) {
		const missing = s3Vars.filter((v) => !process.env[v]);
		throw new Error(`S3 storage is partially configured — missing ${missing.join(', ')}`);
	}
	if (process.env.NODE_ENV !== 'production') return;
	if (!process.env.ORIGIN) {
		throw new Error('ORIGIN must be set in production');
	}
	if (!process.env.RESEND_API_KEY) {
		console.warn(
			'[config] RESEND_API_KEY unset: account emails (verify/reset/change) will be logged to stdout — including account-recovery links. Set a real key before exposing signups.'
		);
	} else if (!process.env.MAIL_FROM) {
		console.warn(
			'[config] RESEND_API_KEY is set but MAIL_FROM is empty: Resend will reject every send, and sends are fire-and-forget so the failures are silent. Set MAIL_FROM.'
		);
	}
	if (!process.env.TURNSTILE_SITE_KEY || !process.env.TURNSTILE_SECRET_KEY) {
		console.warn(
			'[config] Turnstile keys unset: the signup captcha cannot render or verify (it fails closed), so signup is effectively disabled.'
		);
	}
}
