import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { statsByDow, statsByTod, statsByWatch, statsCalendar, statsSummary } from '$lib/server/stats';

export const GET: RequestHandler = async ({ params, url }) => {
	const db = getDb();
	const tz = config.homeTz;
	const now = new Date();
	switch (params.view) {
		case 'summary': return json(statsSummary(db, tz, now));
		case 'by-watch': return json(statsByWatch(db, tz, now));
		case 'by-dow': return json(statsByDow(db, tz, now));
		case 'by-tod': return json(statsByTod(db, tz, now));
		case 'calendar':
			return json(statsCalendar(db, tz, Number(url.searchParams.get('year') ?? now.getFullYear()), now));
		default: throw error(404);
	}
};
