export const config = {
	appName: process.env.APP_NAME ?? 'horolog',
	authToken: process.env.AUTH_TOKEN ?? '',
	homeTz: process.env.HOME_TZ ?? 'America/Los_Angeles',
	dataDir: process.env.DATA_DIR ?? './data',
	staleSessionHours: Number(process.env.STALE_SESSION_HOURS ?? 24)
};
