import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { verify } from '$lib/server/flows';

// Load-based (not an action): the link from a verify/change-email email is
// a plain GET. Always renders 200, invalid/expired token included — no
// enumeration channel.
export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	const result = await verify({ db: await getDb(), mailer: getMailer() }, token);
	return result;
};
