import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { verify } from '$lib/server/flows';

// The email link is a plain GET, but a GET must not consume the single-use
// token: mail-security scanners and link-preview bots prefetch links and
// would burn it before the human ever clicks. The page renders a confirm
// button instead, and the token is consumed by the POST action. Both paths
// render 200 regardless of token validity — no enumeration channel.
export const load: PageServerLoad = async ({ url }) => {
	return { hasToken: !!url.searchParams.get('token') };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const token = ((await request.formData()).get('token') as string) ?? '';
		return await verify({ db: await getDb(), mailer: getMailer() }, token);
	}
};
