import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import {
	isAdmin,
	listUsersWithMeta,
	setUserDisabled,
	deleteUser,
	setQuotaMultiplier
} from '$lib/server/admin';
import { resendVerification } from '$lib/server/flows';
import { StateError } from '$lib/server/sessions';

// 404, not 403 — the admin surface must not disclose its existence to a
// signed-in non-admin poking at the URL.
function gate(locals: App.Locals) {
	if (!isAdmin(locals.user)) error(404, 'Not found');
}

export const load: PageServerLoad = async ({ locals }) => {
	gate(locals);
	return { users: await listUsersWithMeta(await getDb()) };
};

const uid = (form: FormData) => Number(form.get('userId'));

export const actions: Actions = {
	disable: async ({ locals, request }) => {
		gate(locals);
		await setUserDisabled(await getDb(), uid(await request.formData()), true);
	},
	enable: async ({ locals, request }) => {
		gate(locals);
		await setUserDisabled(await getDb(), uid(await request.formData()), false);
	},
	delete: async ({ locals, request }) => {
		gate(locals);
		try {
			await deleteUser(await getDb(), uid(await request.formData()));
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { message: e.message });
			throw e;
		}
	},
	resend: async ({ locals, request }) => {
		gate(locals);
		const result = await resendVerification(
			{ db: await getDb(), mailer: getMailer() },
			uid(await request.formData())
		);
		if (!result.ok) return fail(result.status, { message: result.message });
	},
	quota: async ({ locals, request }) => {
		gate(locals);
		const form = await request.formData();
		await setQuotaMultiplier(await getDb(), uid(form), Number(form.get('quotaMultiplier')));
	}
};
