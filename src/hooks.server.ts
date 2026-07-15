import { json, type Handle } from '@sveltejs/kit';
import { isAuthorized } from '$lib/server/api';
import { config } from '$lib/server/config';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/api')) {
		if (!isAuthorized(event.request, config.authToken)) {
			return json({ message: 'Unauthorized' }, { status: 401 });
		}
	}
	return resolve(event);
};
