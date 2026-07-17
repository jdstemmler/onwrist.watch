import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getDb } from '$lib/server/db';
import { watchFormSchema, createWatch } from '$lib/server/watches';
import { savePhoto } from '$lib/server/photos';

// Task 8 replaces with locals.user.id
const uid = 1;

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const parsed = watchFormSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { message: 'Check the highlighted fields' });
		const db = await getDb();
		const w = await createWatch(db, uid, parsed.data);
		const photo = form.get('photo');
		if (photo instanceof File && photo.size > 0) await savePhoto(db, uid, w.id, photo);
		redirect(303, `/watches/${w.id}`);
	}
};
