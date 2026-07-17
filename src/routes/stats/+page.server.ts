import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { statsByDow, statsByTod, statsTodByWatch, statsByWatch, statsCalendar, statsSummary } from '$lib/server/stats';

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = await getDb();
	const tz = locals.user!.homeTz;
	const uid = locals.user!.id;
	const now = new Date();
	const year = Number(url.searchParams.get('year') ?? now.getFullYear());
	const [summary, byWatch, byDow, byTod, todByWatch, calendar] = await Promise.all([
		statsSummary(db, uid, tz, now),
		statsByWatch(db, uid, tz, now),
		statsByDow(db, uid, tz, now),
		statsByTod(db, uid, tz, now),
		statsTodByWatch(db, uid, tz, now),
		statsCalendar(db, uid, tz, year, now)
	]);
	return { year, summary, byWatch, byDow, byTod, todByWatch, calendar, nowIso: now.toISOString() };
};
