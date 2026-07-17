import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { requestReset } from '$lib/server/flows';

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string) ?? '';

		const result = await requestReset(
			{ db: await getDb(), mailer: getMailer() },
			{ email },
			getClientAddress()
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { sent: true };
	}
};
