import crypto from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE, createSession, revokeSession, pruneSessions, validateSession } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';

/** Only same-app relative paths may be redirect targets (no open redirects). */
function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return '/';
	return raw;
}

// Task 8 replaces with email+password login
function checkWristPassword(supplied: string): boolean {
	const configured = process.env.DASH_PASSWORD ?? '';
	if (!configured) return false;
	// hash both sides so timingSafeEqual gets equal-length buffers
	const a = crypto.createHash('sha256').update(supplied).digest();
	const b = crypto.createHash('sha256').update(configured).digest();
	return crypto.timingSafeEqual(a, b);
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const token = cookies.get(SESSION_COOKIE) ?? '';
	if (token && (await validateSession(await getDb(), token))) {
		redirect(303, safeNext(url.searchParams.get('next')));
	}
	return { next: url.searchParams.get('next') ?? '/' };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const form = await request.formData();
		const password = (form.get('password') as string) ?? '';
		const next = safeNext(form.get('next') as string | null);
		// Task 8 replaces with email+password login; throttle calls dropped with it
		if (!checkWristPassword(password)) {
			return fail(401, { message: 'Not it. Check again.' });
		}
		const db = await getDb();
		await pruneSessions(db); // housekeeping: clear expired rows on successful login
		const token = await createSession(db, 1); // Task 8 deletes wrist-check login
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
