import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { confirmReset } from '$lib/server/flows';

export const load: PageServerLoad = async ({ url }) => {
	return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const token = (form.get('token') as string) ?? '';
		const password = (form.get('password') as string) ?? '';

		const result = await confirmReset({ db: await getDb(), mailer: getMailer() }, { token, password });
		if (!result.ok) return fail(result.status, { message: result.message });
		redirect(303, '/login?flash=password-updated');
	}
};
