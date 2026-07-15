import type { LayoutServerLoad } from './$types';
import { config } from '$lib/server/config';

// Exposes the server-only config's home timezone to every route as page
// data, so page loads (e.g. /log, /stats) can format dates in homeTz
// without each re-importing $lib/server/config themselves.
export const load: LayoutServerLoad = async () => {
	return { homeTz: config.homeTz, appName: config.appName };
};
