import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listWatchesWithMeta } from '$lib/server/watches';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { landing: true as const };
	const rows = await listWatchesWithMeta(await getDb(), locals.user.id, locals.user.homeTz, new Date());
	return {
		landing: false as const,
		owned: rows.filter((r) => r.watch.status === 'owned'),
		sold: rows.filter((r) => r.watch.status === 'sold')
	};
};
