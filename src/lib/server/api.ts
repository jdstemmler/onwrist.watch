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
		if (e instanceof ZodError)
			return json({ message: 'Invalid request', issues: e.issues }, { status: 400 });
		throw e;
	}
}
