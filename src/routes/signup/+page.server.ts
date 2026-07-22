import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { config } from '$lib/server/config';
import { verifyTurnstile } from '$lib/server/turnstile';
import { signup } from '$lib/server/flows';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user && !locals.user.isDemo) redirect(303, '/log');
	return { turnstileSiteKey: config.turnstileSiteKey };
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const form = await request.formData();
		const email = (form.get('email') as string) ?? '';
		const password = (form.get('password') as string) ?? '';
		const captchaToken = (form.get('cf-turnstile-response') as string) ?? '';

		const result = await signup(
			{
				db: await getDb(),
				mailer: getMailer(),
				verifyCaptcha: (token, ip) => verifyTurnstile(config.turnstileSecretKey, token, ip)
			},
			{ email, password, captchaToken },
			getClientAddress()
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { sent: true };
	}
};
