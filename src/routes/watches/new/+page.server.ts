import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getDb } from '$lib/server/db';
import { watchFormSchema, createWatch } from '$lib/server/watches';
import { savePhoto } from '$lib/server/photos';
import { requireVerified } from '$lib/server/auth';
import { StateError } from '$lib/server/sessions';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const parsed = watchFormSchema.safeParse(Object.fromEntries(form));
		if (!parsed.success) return fail(400, { message: 'Check the highlighted fields' });
		try {
			requireVerified(locals.user!);
			const db = await getDb();
			const w = await createWatch(db, locals.user!.id, parsed.data);
			const photo = form.get('photo');
			if (photo instanceof File && photo.size > 0) await savePhoto(db, locals.user!.id, w.id, photo);
			redirect(303, `/watches/${w.id}`);
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { message: e.message });
			throw e;
		}
	}
};
