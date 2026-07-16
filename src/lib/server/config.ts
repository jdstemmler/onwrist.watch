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
