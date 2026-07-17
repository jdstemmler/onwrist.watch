import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { watches, watchPhotos, wearSessions } from '$lib/server/db/schema';
import { statsByWatch, statsByDow } from '$lib/server/stats';
import { photoUrl } from '$lib/server/photos';

export const load: PageServerLoad = async ({ params, locals }) => {
	const uid = locals.user!.id;
	const homeTz = locals.user!.homeTz;
	const db = await getDb();
	const id = Number(params.id);
	const watch = (
		await db.select().from(watches).where(and(eq(watches.id, id), eq(watches.userId, uid))).limit(1)
	)[0];
	if (!watch) error(404, 'No such watch');
	const now = new Date();
	const [photos, statsRows, dowRows, sessions] = await Promise.all([
		db.select().from(watchPhotos).where(eq(watchPhotos.watchId, id)),
		statsByWatch(db, uid, homeTz, now),
		statsByDow(db, uid, homeTz, now),
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
