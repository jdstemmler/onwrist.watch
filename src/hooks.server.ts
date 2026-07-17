import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, routeClass, validateSession } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const token = event.cookies.get(SESSION_COOKIE) ?? '';
	event.locals.user = token ? await validateSession(await getDb(), token) : null;
	if (routeClass(pathname) === 'public') return resolve(event);
	if (!event.locals.user) {
		const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
		redirect(303, `/login${next}`);
	}
	return resolve(event);
};
