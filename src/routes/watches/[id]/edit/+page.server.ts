import { redirect, fail, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, type DB } from '$lib/server/db';
import { watches, watchPhotos } from '$lib/server/db/schema';
import { watchFormSchema, updateWatch, deleteWatch } from '$lib/server/watches';
import { savePhoto, deletePhoto, setPrimaryPhoto } from '$lib/server/photos';
import { requireVerified } from '$lib/server/auth';
import { StateError } from '$lib/server/sessions';

function findWatch(db: DB, userId: number, id: number) {
	return db
		.select()
		.from(watches)
		.where(and(eq(watches.id, id), eq(watches.userId, userId)))
		.limit(1)
		.then((rows) => rows[0]);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = await getDb();
	const id = Number(params.id);
	const watch = await findWatch(db, locals.user!.id, id);
	if (!watch) error(404, 'Watch not found');
	const photos = await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, id));
	return { watch, photos };
};

const err = (e: unknown) =>
	e instanceof StateError ? fail(e.status, { message: e.message }) : (() => { throw e; })();

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const id = Number(params.id);
		const db = await getDb();
		if (!(await findWatch(db, locals.user!.id, id))) return fail(404, { message: 'Watch not found' });
		const form = await request.formData();
		const parsed = watchFormSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { message: 'Check the highlighted fields' });
		try {
			requireVerified(locals.user!);
			await updateWatch(db, locals.user!.id, id, parsed.data);
			const photo = form.get('photo');
			if (photo instanceof File && photo.size > 0) await savePhoto(db, locals.user!.id, id, photo);
		} catch (e) { return err(e); }
		redirect(303, `/watches/${id}`);
	},

	deletePhoto: async ({ request, params, locals }) => {
		const id = Number(params.id);
		const db = await getDb();
		if (!(await findWatch(db, locals.user!.id, id))) return fail(404, { message: 'Watch not found' });
		const form = await request.formData();
		const photoId = Number(form.get('photoId'));
		try {
			requireVerified(locals.user!);
			await deletePhoto(db, locals.user!.id, photoId);
		} catch (e) { return err(e); }
		return { success: true };
	},

	setPrimary: async ({ request, params, locals }) => {
		const id = Number(params.id);
		const db = await getDb();
		if (!(await findWatch(db, locals.user!.id, id))) return fail(404, { message: 'Watch not found' });
		const form = await request.formData();
		const photoId = Number(form.get('photoId'));
		try {
			requireVerified(locals.user!);
			await setPrimaryPhoto(db, locals.user!.id, photoId);
		} catch (e) { return err(e); }
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		const id = Number(params.id);
		const db = await getDb();
		if (!(await findWatch(db, locals.user!.id, id))) return fail(404, { message: 'Watch not found' });
		try {
			requireVerified(locals.user!);
			await deleteWatch(db, locals.user!.id, id);
		} catch (e) { return err(e); }
		redirect(303, `/`);
	}
};
