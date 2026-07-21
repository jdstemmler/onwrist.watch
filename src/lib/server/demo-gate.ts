import { stringify } from 'devalue';
import type { SessionUser } from './auth';

export const DEMO_READONLY_MESSAGE =
	'This is a read-only demo — sign up to track your own collection.';

/** Form-action name from its URL (`/log?/putOn` → 'putOn'), null if none. */
function actionName(url: URL): string | null {
	for (const key of url.searchParams.keys()) {
		if (key.startsWith('/')) return key.slice(1);
	}
	return null;
}

/** The read-only demo enforcement: one choke point for every mutation.
 * Returns a blocking Response for POSTs from demo sessions (logout exempt),
 * null otherwise. Enhanced requests get a body shaped exactly like a
 * SvelteKit action failure ({type,status,data} with devalue-encoded data,
 * including the action name) so use:enhance routes the message through each
 * page's existing form.message/resultFor toast rendering; no-JS posts get a
 * 303 back to the page. */
export function demoWriteGate(user: SessionUser | null, request: Request, url: URL): Response | null {
	if (!user?.isDemo || request.method !== 'POST') return null;
	const action = actionName(url);
	if (url.pathname === '/login' && action === 'logout') return null;

	if (request.headers.get('x-sveltekit-action') === 'true') {
		return new Response(
			JSON.stringify({
				type: 'failure',
				status: 409,
				data: stringify({ action, message: DEMO_READONLY_MESSAGE })
			}),
			{ status: 409, headers: { 'content-type': 'application/json' } }
		);
	}
	return new Response(null, { status: 303, headers: { location: url.pathname } });
}
