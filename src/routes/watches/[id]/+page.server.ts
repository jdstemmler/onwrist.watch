import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { watches, watchPhotos, wearSessions } from '$lib/server/db/schema';
import { statsByWatch, statsByDow } from '$lib/server/stats';
import { photoUrl } from '$lib/server/photos';

export const load: PageServerLoad = async ({ params }) => {
	const db = await getDb();
	const id = Number(params.id);
	const watch = (await db.select().from(watches).where(eq(watches.id, id)).limit(1))[0];
	if (!watch) error(404, 'No such watch');
	const now = new Date();
	const [photos, statsRows, dowRows, sessions] = await Promise.all([
		db.select().from(watchPhotos).where(eq(watchPhotos.watchId, id)),
		statsByWatch(db, config.homeTz, now),
		statsByDow(db, config.homeTz, now),
		db
			.select()
			.from(wearSessions)
			.where(eq(wearSessions.watchId, id))
			.orderBy(desc(wearSessions.startedAt))
			.limit(20)
	]);
	return {
		watch,
		// photoUrl() is server-only (path under $lib/server), so the URL is
		// resolved here — the page component only ever sees plain strings.
		photos: photos.map((p) => ({ ...p, url: photoUrl(p.filePath) })),
		stats: statsRows.find((s) => s.watchId === id)!,
		dow: dowRows.filter((r) => r.watchId === id),
		sessions
	};
};
