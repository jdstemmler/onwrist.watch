import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { listWatchesWithMeta } from '$lib/server/watches';

export const load: PageServerLoad = async () => {
	const rows = listWatchesWithMeta(getDb(), config.homeTz, new Date());
	return {
		owned: rows.filter((r) => r.watch.status === 'owned'),
		sold: rows.filter((r) => r.watch.status === 'sold')
	};
};
