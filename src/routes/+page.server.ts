import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listWatchesWithMeta } from '$lib/server/watches';
import { SESSION_COOKIE } from '$lib/server/auth';
import { demoLogin, findDemoUser } from '$lib/server/demo';

export const load: PageServerLoad = async ({ locals }) => {
	const db = await getDb();
	if (!locals.user) {
		return { landing: true as const, demoAvailable: (await findDemoUser(db)) !== null };
	}
	const rows = await listWatchesWithMeta(db, locals.user.id, locals.user.homeTz, new Date());
	return {
		landing: false as const,
		owned: rows.filter((r) => r.watch.status === 'owned'),
		sold: rows.filter((r) => r.watch.status === 'sold')
	};
};

export const actions: Actions = {
	demo: async ({ cookies, getClientAddress }) => {
		const result = await demoLogin(await getDb(), getClientAddress());
		if (!result.ok) return fail(result.status, { message: result.message });
		cookies.set(SESSION_COOKIE, result.token, result.cookie);
		redirect(303, '/');
	}
};
