import { error, redirect, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb, type DB } from '$lib/server/db';
import { watches, watchPhotos } from '$lib/server/db/schema';
import { watchFormSchema, updateWatch, deleteWatch } from '$lib/server/watches';
import { savePhoto, deletePhoto, setPrimaryPhoto } from '$lib/server/photos';

function findWatch(db: DB, id: number) {
	return db.select().from(watches).where(eq(watches.id, id)).get();
}

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const id = Number(params.id);
	const watch = findWatch(db, id);
	if (!watch) throw error(404, 'Watch not found');
	const photos = db.select().from(watchPhotos).where(eq(watchPhotos.watchId, id)).all();
	return { watch, photos };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = Number(params.id);
		const db = getDb();
		if (!findWatch(db, id)) return fail(404, { message: 'Watch not found' });
		const form = await request.formData();
		const parsed = watchFormSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { message: 'Check the highlighted fields' });
		updateWatch(db, id, parsed.data);
		const photo = form.get('photo');
		if (photo instanceof File && photo.size > 0) await savePhoto(db, id, photo);
		redirect(303, `/watches/${id}`);
	},

	deletePhoto: async ({ request, params }) => {
		const id = Number(params.id);
		const db = getDb();
		if (!findWatch(db, id)) return fail(404, { message: 'Watch not found' });
		const form = await request.formData();
		const photoId = Number(form.get('photoId'));
		deletePhoto(db, photoId);
		return { success: true };
	},

	setPrimary: async ({ request, params }) => {
		const id = Number(params.id);
		const db = getDb();
		if (!findWatch(db, id)) return fail(404, { message: 'Watch not found' });
		const form = await request.formData();
		const photoId = Number(form.get('photoId'));
		setPrimaryPhoto(db, photoId);
		return { success: true };
	},

	delete: async ({ params }) => {
		const id = Number(params.id);
		const db = getDb();
		if (!findWatch(db, id)) return fail(404, { message: 'Watch not found' });
		deleteWatch(db, id);
		redirect(303, `/`);
	}
};
