import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { getMailer } from '$lib/server/mail';
import { getUser, setPassword, updatePrefs } from '$lib/server/users';
import { verifyPasswordHash } from '$lib/server/passwords';
import { requestEmailChange, resendVerification } from '$lib/server/flows';
import { StateError } from '$lib/server/sessions';

const IANA_TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'));

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	return {
		email: user.email,
		homeTz: user.homeTz,
		staleSessionHours: user.staleSessionHours,
		verified: user.verified,
		timeZones: Intl.supportedValuesOf('timeZone')
	};
};

export const actions: Actions = {
	password: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const currentPassword = (form.get('currentPassword') as string) ?? '';
		const newPassword = (form.get('newPassword') as string) ?? '';

		const db = await getDb();
		const user = await getUser(db, locals.user!.id);
		if (!user || !(await verifyPasswordHash(user.passwordHash, currentPassword))) {
			return fail(401, { action: 'password', message: 'Current password is wrong' });
		}

		try {
			// Revokes every session for this account — the current one included —
			// so the user must log back in. Clear the cookie and bounce them,
			// same pattern as the reset-confirm flow.
			await setPassword(db, user.id, newPassword);
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { action: 'password', message: e.message });
			throw e;
		}

		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login?flash=password-updated');
	},

	email: async ({ request, locals }) => {
		const form = await request.formData();
		const currentPassword = (form.get('currentPassword') as string) ?? '';
		const newEmail = (form.get('newEmail') as string) ?? '';

		const result = await requestEmailChange(
			{ db: await getDb(), mailer: getMailer() },
			locals.user!.id,
			currentPassword,
			newEmail
		);
		if (!result.ok) return fail(result.status, { action: 'email', message: result.message });
		return { action: 'email', sent: true };
	},

	prefs: async ({ request, locals }) => {
		const form = await request.formData();
		const homeTz = (form.get('homeTz') as string) || undefined;
		const rawHours = form.get('staleSessionHours') as string | null;
		const staleSessionHours = rawHours ? Number(rawHours) : undefined;

		if (
			staleSessionHours !== undefined &&
			(!Number.isFinite(staleSessionHours) || staleSessionHours < 1 || staleSessionHours > 168)
		) {
			return fail(400, {
				action: 'prefs',
				message: 'Stale-session hours must be between 1 and 168'
			});
		}

		try {
			await updatePrefs(await getDb(), locals.user!.id, { homeTz, staleSessionHours });
		} catch (e) {
			if (e instanceof StateError) return fail(e.status, { action: 'prefs', message: e.message });
			throw e;
		}
		return { action: 'prefs', saved: true };
	},

	resendVerify: async ({ locals }) => {
		const result = await resendVerification({ db: await getDb(), mailer: getMailer() }, locals.user!.id);
		if (!result.ok) return fail(result.status, { action: 'resendVerify', message: result.message });
		return { action: 'resendVerify', sent: true };
	}
};
