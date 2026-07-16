import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { statsByDow, statsByTod, statsTodByWatch, statsByWatch, statsCalendar, statsSummary } from '$lib/server/stats';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const tz = config.homeTz;
	const now = new Date();
	const year = Number(url.searchParams.get('year') ?? now.getFullYear());
	return {
		year,
		summary: statsSummary(db, tz, now),
		byWatch: statsByWatch(db, tz, now),
		byDow: statsByDow(db, tz, now),
		byTod: statsByTod(db, tz, now),
		todByWatch: statsTodByWatch(db, tz, now),
		calendar: statsCalendar(db, tz, year, now),
		nowIso: now.toISOString()
	};
};
