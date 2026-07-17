import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE, revokeSession, pruneSessions } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { login } from '$lib/server/flows';

/** Only same-app relative paths may be redirect targets (no open redirects). */
function safeNext(raw: string | null): string {
	// reject backslashes: browsers normalize \ to / (open-redirect bypass)
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login') || raw.includes('\\')) return '/';
	return raw;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		redirect(303, safeNext(url.searchParams.get('next')));
	}
	return { next: url.searchParams.get('next') ?? '/' };
};

export const actions: Actions = {
	login: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string) ?? '';
		const password = (form.get('password') as string) ?? '';
		const next = safeNext(form.get('next') as string | null);
		const oldToken = cookies.get(SESSION_COOKIE);

		const db = await getDb();
		await pruneSessions(db); // housekeeping: clear expired rows on successful login attempts

		const result = await login(
			{ db, mailer: getMailer() },
			{ email, password, oldToken },
			getClientAddress()
		);
		if (!result.ok) return fail(result.status, { message: result.message });

		cookies.set(SESSION_COOKIE, result.token, result.cookie);
		redirect(303, next);
	},

	logout: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) await revokeSession(await getDb(), token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
