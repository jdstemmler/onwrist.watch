import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { watches, watchPhotos, wearSessions } from '$lib/server/db/schema';
import { statsByWatch, statsByDow } from '$lib/server/stats';
import { photoUrl } from '$lib/server/photos';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const id = Number(params.id);
	const watch = db.select().from(watches).where(eq(watches.id, id)).get();
	if (!watch) error(404, 'No such watch');
	const now = new Date();
	return {
		watch,
		// photoUrl() is server-only (path under $lib/server), so the URL is
		// resolved here — the page component only ever sees plain strings.
		photos: db
			.select()
			.from(watchPhotos)
			.where(eq(watchPhotos.watchId, id))
			.all()
			.map((p) => ({ ...p, url: photoUrl(p.filePath) })),
		stats: statsByWatch(db, config.homeTz, now).find((s) => s.watchId === id)!,
		dow: statsByDow(db, config.homeTz, now).filter((r) => r.watchId === id),
		sessions: db
			.select()
			.from(wearSessions)
			.where(eq(wearSessions.watchId, id))
			.orderBy(desc(wearSessions.startedAt))
			.limit(20)
			.all()
	};
};
