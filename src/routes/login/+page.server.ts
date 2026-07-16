import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	SESSION_COOKIE,
	createSession,
	loginLockedMs,
	recordLoginFailure,
	recordLoginSuccess,
	revokeSession,
	pruneSessions,
	validateSession,
	verifyPassword
} from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';

/** Only same-app relative paths may be redirect targets (no open redirects). */
function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return '/';
	return raw;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const token = cookies.get(SESSION_COOKIE) ?? '';
	if (token && (await validateSession(await getDb(), token, config.sessionDays))) {
		redirect(303, safeNext(url.searchParams.get('next')));
	}
	return { next: url.searchParams.get('next') ?? '/' };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const lockedMs = loginLockedMs();
		if (lockedMs > 0) {
			return fail(429, { message: `Too many tries — wait ${Math.ceil(lockedMs / 1000)}s` });
		}
		const form = await request.formData();
		const password = (form.get('password') as string) ?? '';
		const next = safeNext(form.get('next') as string | null);
		if (!verifyPassword(password, config.dashPassword)) {
			recordLoginFailure();
			return fail(401, { message: 'Not it. Check again.' });
		}
		recordLoginSuccess();
		const db = await getDb();
		await pruneSessions(db); // housekeeping: clear expired rows on successful login
		const token = await createSession(db, config.sessionDays);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: config.sessionDays * 86_400
		});
		redirect(303, next);
	},

	logout: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) await revokeSession(await getDb(), token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};
