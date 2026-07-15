import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getDb } from '$lib/server/db';
import { watchFormSchema, createWatch } from '$lib/server/watches';
import { savePhoto } from '$lib/server/photos';

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const parsed = watchFormSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { message: 'Check the highlighted fields' });
		const db = getDb();
		const w = createWatch(db, parsed.data);
		const photo = form.get('photo');
		if (photo instanceof File && photo.size > 0) await savePhoto(db, w.id, photo);
		redirect(303, `/watches/${w.id}`);
	}
};
