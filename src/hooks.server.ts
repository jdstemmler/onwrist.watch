import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, routeClass, validateSession } from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	if (routeClass(pathname) === 'public') return resolve(event);

	const token = event.cookies.get(SESSION_COOKIE) ?? '';
	if (!token || !validateSession(getDb(), token, config.sessionDays)) {
		const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
		redirect(303, `/login${next}`);
	}
	return resolve(event);
};
