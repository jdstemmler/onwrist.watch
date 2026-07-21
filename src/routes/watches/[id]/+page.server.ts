import { error, fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { watches, watchPhotos, wearSessions } from '$lib/server/db/schema';
import { statsByWatch, statsByDow, statsWatchDetail } from '$lib/server/stats';
import { photoUrl, savePhoto, setPrimaryPhoto } from '$lib/server/photos';
import { requireVerified } from '$lib/server/auth';
import { StateError } from '$lib/server/sessions';
import { zonedParts } from '$lib/server/time';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const uid = locals.user!.id;
	const homeTz = locals.user!.homeTz;
	const db = await getDb();
	const id = Number(params.id);
	const watch = (
		await db.select().from(watches).where(and(eq(watches.id, id), eq(watches.userId, uid))).limit(1)
	)[0];
	if (!watch) error(404, 'No such watch');
	const now = new Date();
	const [photos, statsRows, dowRows, detail, sessions] = await Promise.all([
		db.select().from(watchPhotos).where(eq(watchPhotos.watchId, id)),
		statsByWatch(db, uid, homeTz, now),
		statsByDow(db, uid, homeTz, now),
		statsWatchDetail(db, uid, id, homeTz, now),
		db
			.select()
			.from(wearSessions)
			.where(eq(wearSessions.watchId, id))
			.orderBy(desc(wearSessions.startedAt))
			.limit(20)
	]);
	// Same year clamping as /stats, but spanning this watch's own history:
	// first-worn-year..current-year (homeTz), so empty years are unreachable.
	const todayParts = zonedParts(now, homeTz);
	const firstYear = detail.firstWornDayKey
		? Number(detail.firstWornDayKey.slice(0, 4))
		: todayParts.year;
	const requested = Number(url.searchParams.get('year') ?? todayParts.year);
	const year = Number.isFinite(requested)
		? Math.min(Math.max(Math.trunc(requested), firstYear), todayParts.year)
		: todayParts.year;
	const stats = statsRows.find((s) => s.watchId === id)!;
	return {
		watch,
		// photoUrl() is server-only (path under $lib/server), so the URL is
		// resolved here — the page component only ever sees plain strings.
		photos: photos.map((p) => ({ ...p, url: photoUrl(p.filePath) })),
		stats,
		dow: dowRows.filter((r) => r.watchId === id),
		detail,
		year,
		todayKey: todayParts.dayKey,
		calendar: detail.days
			.filter((d) => d.dayKey.startsWith(`${year}-`))
			.map((d) => ({ ...d, watchId: id, label: stats.label })),
		sessions
	};
};

const err = (e: unknown) =>
	e instanceof StateError ? fail(e.status, { message: e.message }) : (() => { throw e; })();

export const actions: Actions = {
	addPhoto: async ({ request, params, locals }) => {
		const db = await getDb();
		const f = await request.formData();
		try {
			requireVerified(locals.user!);
			const photo = f.get('photo');
			if (!(photo instanceof File) || photo.size === 0) {
				return fail(400, { message: 'Choose a photo first' });
			}
			// savePhoto asserts ownership of the watch (assertWatchOwned) —
			// no separate findWatch guard needed.
			const saved = await savePhoto(db, locals.user!.id, Number(params.id), photo);
			if (f.get('make_primary')) await setPrimaryPhoto(db, locals.user!.id, saved.id);
		} catch (e) { return err(e); }
		return { success: true };
	}
};
