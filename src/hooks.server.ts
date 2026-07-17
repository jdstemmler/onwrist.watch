import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, routeClass, validateSession, shouldSlideCookie } from '$lib/server/auth';
import { sessionCookieOptions } from '$lib/server/flows';
import { getDb } from '$lib/server/db';
import { assertConfig } from '$lib/server/config';

assertConfig();

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const token = event.cookies.get(SESSION_COOKIE) ?? '';
	event.locals.user = token ? await validateSession(await getDb(), token) : null;

	// validateSession slides the DB row's expiry past half-life for members,
	// but the cookie itself was set once at login with a fixed maxAge — left
	// alone, a member gets logged out client-side after config.sessionDays
	// regardless of activity, even though the server-side session is still
	// alive. Re-set the cookie (same token, fresh maxAge) so it slides too.
	// Admin sessions are a fixed 24h and never slide, here or in validateSession.
	if (token && shouldSlideCookie(event.locals.user)) {
		event.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(event.locals.user!.role));
	}

	if (routeClass(pathname) === 'public') return resolve(event);
	if (!event.locals.user) {
		const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
		redirect(303, `/login${next}`);
	}
	return resolve(event);
};
