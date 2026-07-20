import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { statsByDow, statsByTod, statsTodByWatch, statsByWatch, statsCalendar, statsSummary } from '$lib/server/stats';
import { zonedParts } from '$lib/server/time';

export const load: PageServerLoad = async ({ url, locals }) => {
	const db = await getDb();
	const tz = locals.user!.homeTz;
	const uid = locals.user!.id;
	const now = new Date();
	// Summary first: the calendar's year param is clamped to the span
	// first-session-year..current-year (homeTz), so empty years are
	// unreachable rather than just unrendered.
	const summary = await statsSummary(db, uid, tz, now);
	const todayParts = zonedParts(now, tz);
	const todayKey = todayParts.dayKey;
	const firstDayKey = summary.firstLoggedAt
		? zonedParts(new Date(summary.firstLoggedAt), tz).dayKey
		: null;
	const firstYear = firstDayKey ? Number(firstDayKey.slice(0, 4)) : todayParts.year;
	const requested = Number(url.searchParams.get('year') ?? todayParts.year);
	const year = Number.isFinite(requested)
		? Math.min(Math.max(requested, firstYear), todayParts.year)
		: todayParts.year;
	const [byWatch, byDow, byTod, todByWatch, calendar] = await Promise.all([
		statsByWatch(db, uid, tz, now),
		statsByDow(db, uid, tz, now),
		statsByTod(db, uid, tz, now),
		statsTodByWatch(db, uid, tz, now),
		statsCalendar(db, uid, tz, year, now)
	]);
	return { year, summary, byWatch, byDow, byTod, todByWatch, calendar, firstDayKey, todayKey, nowIso: now.toISOString() };
};
