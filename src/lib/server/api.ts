import { json } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { StateError } from './sessions';

export function isAuthorized(request: Request, token: string): boolean {
	if (!token) return false;
	return request.headers.get('authorization') === `Bearer ${token}`;
}

export async function apiTry(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof StateError) return json({ message: e.message }, { status: 409 });
		if (e instanceof ZodError) {
			// message is surfaced verbatim in shortcut notifications — name the
			// offending fields so a phone is enough to diagnose a bad request.
			const detail = e.issues
				.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
				.join('; ');
			return json({ message: `Invalid request — ${detail}`, issues: e.issues }, { status: 400 });
		}
		throw e;
	}
}
