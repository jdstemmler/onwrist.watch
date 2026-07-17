import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listWatchesWithMeta } from '$lib/server/watches';

// Task 8 replaces with locals.user.homeTz
const HOME_TZ = 'America/Los_Angeles';
// Task 8 replaces with locals.user.id
const uid = 1;

export const load: PageServerLoad = async () => {
	const rows = await listWatchesWithMeta(await getDb(), uid, HOME_TZ, new Date());
	return {
		owned: rows.filter((r) => r.watch.status === 'owned'),
		sold: rows.filter((r) => r.watch.status === 'sold')
	};
};
