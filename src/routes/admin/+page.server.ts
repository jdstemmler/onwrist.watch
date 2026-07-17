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
const invalidUser = () => fail(400, { message: 'Invalid user' });

export const actions: Actions = {
	disable: async ({ locals, request }) => {
		gate(locals);
		const id = uid(await request.formData());
		if (!Number.isInteger(id)) return invalidUser();
		try {
			await setUserDisabled(await getDb(), id, true);
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { message: e.message });
			throw e;
		}
	},
	enable: async ({ locals, request }) => {
		gate(locals);
		const id = uid(await request.formData());
		if (!Number.isInteger(id)) return invalidUser();
		try {
			await setUserDisabled(await getDb(), id, false);
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { message: e.message });
			throw e;
		}
	},
	delete: async ({ locals, request }) => {
		gate(locals);
		const id = uid(await request.formData());
		if (!Number.isInteger(id)) return invalidUser();
		try {
			await deleteUser(await getDb(), id);
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { message: e.message });
			throw e;
		}
	},
	resend: async ({ locals, request }) => {
		gate(locals);
		const id = uid(await request.formData());
		if (!Number.isInteger(id)) return invalidUser();
		const result = await resendVerification({ db: await getDb(), mailer: getMailer() }, id);
		if (!result.ok) return fail(result.status, { message: result.message });
	},
	quota: async ({ locals, request }) => {
		gate(locals);
		const form = await request.formData();
		const id = uid(form);
		if (!Number.isInteger(id)) return invalidUser();
		const n = Number(form.get('quotaMultiplier'));
		if (!Number.isFinite(n)) return fail(400, { message: 'Invalid quota' });
		try {
			await setQuotaMultiplier(await getDb(), id, n);
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { message: e.message });
			throw e;
		}
	}
};
