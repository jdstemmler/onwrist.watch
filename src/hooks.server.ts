import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, routeClass, validateSession, shouldSlideCookie } from '$lib/server/auth';
import { sessionCookieOptions } from '$lib/server/flows';
import { getDb } from '$lib/server/db';
import { assertConfig } from '$lib/server/config';

assertConfig();

// Warm the DB at boot: getDb() runs pending migrations and the admin seed on
// first touch, so without this a broken migration surfaces as user-facing
// 500s on the first request instead of in the deploy logs. Deliberately not
// awaited/fatal — getDb() resets its memoized promise on failure, so a DB
// that's merely slow to come up self-heals on the next request rather than
// crash-looping the container.
if (!building) {
	getDb().catch((e) => console.error('[boot] DB init/migration failed (will retry on request):', e));
}

function withSecurityHeaders(response: Response): Response {
	// The app is never legitimately framed or content-sniffed; HSTS/TLS live
	// at the Cloudflare edge. frame-ancestors doubles X-Frame-Options for
	// CSP-aware browsers without constraining scripts (a full CSP would need
	// nonce plumbing for the inline theme script and the Turnstile widget).
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
}

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

	if (routeClass(pathname) === 'public') return withSecurityHeaders(await resolve(event));
	if (!event.locals.user) {
		const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
		redirect(303, `/login${next}`);
	}
	return withSecurityHeaders(await resolve(event));
};
