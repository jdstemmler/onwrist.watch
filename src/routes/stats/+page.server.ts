import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { statsByDow, statsByTod, statsTodByWatch, statsByWatch, statsCalendar, statsSummary } from '$lib/server/stats';

export const load: PageServerLoad = async ({ url }) => {
	const db = await getDb();
	// Task 8 replaces with locals.user.homeTz
	const tz = 'America/Los_Angeles';
	const now = new Date();
	const year = Number(url.searchParams.get('year') ?? now.getFullYear());
	const [summary, byWatch, byDow, byTod, todByWatch, calendar] = await Promise.all([
		statsSummary(db, tz, now),
		statsByWatch(db, tz, now),
		statsByDow(db, tz, now),
		statsByTod(db, tz, now),
		statsTodByWatch(db, tz, now),
		statsCalendar(db, tz, year, now)
	]);
	return { year, summary, byWatch, byDow, byTod, todByWatch, calendar, nowIso: now.toISOString() };
};
