export const config = {
	appName: process.env.APP_NAME ?? 'onwrist',
	sessionDays: Number(process.env.SESSION_DAYS ?? 30),
	dataDir: process.env.DATA_DIR ?? './data',
	origin: process.env.ORIGIN ?? 'http://localhost:5199',
	mailFrom: process.env.MAIL_FROM ?? '',
	resendApiKey: process.env.RESEND_API_KEY ?? '',
	turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? '',
	turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? ''
};

/** Guards the localhost ORIGIN fallback from silently shipping to
 * production: unset ORIGIN there means every verify/reset/change-email link
 * mailed out points at localhost, which is a broken-links bug dressed up as
 * a fail-open security issue. Called at boot (hooks.server.ts) rather than
 * thrown at module load — that keeps it testable across NODE_ENV values
 * without juggling module-cache resets/dynamic re-imports per test case. */
export function assertConfig(): void {
	if (process.env.NODE_ENV === 'production' && !process.env.ORIGIN) {
		throw new Error('ORIGIN must be set in production');
	}
}
