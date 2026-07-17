import type { LayoutServerLoad } from './$types';
import { config } from '$lib/server/config';

// Exposes the signed-in user's timezone (and verification/email state for
// the nav + unverified banner) to every route as page data, so page loads
// (e.g. /log, /stats) can format dates in homeTz without each re-importing
// $lib/server/auth themselves.
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		homeTz: locals.user?.homeTz ?? 'America/Los_Angeles',
		appName: config.appName,
		email: locals.user?.email ?? null,
		verified: locals.user?.verified ?? true
	};
};
