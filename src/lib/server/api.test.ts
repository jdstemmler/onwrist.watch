import { describe, it, expect, vi } from 'vitest';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { apiTry, isAuthorized } from './api';
import { StateError } from './sessions';

describe('isAuthorized', () => {
	const req = (auth?: string) =>
		new Request('http://x/api/state', { headers: auth ? { authorization: auth } : {} });

	it('accepts the right bearer token', () => {
		expect(isAuthorized(req('Bearer sekrit'), 'sekrit')).toBe(true);
	});
	it('rejects wrong/missing token and empty configured token', () => {
		expect(isAuthorized(req('Bearer nope'), 'sekrit')).toBe(false);
		expect(isAuthorized(req(), 'sekrit')).toBe(false);
		expect(isAuthorized(req('Bearer '), '')).toBe(false);
	});
});

describe('apiTry', () => {
	it('passes through success', async () => {
		const res = await apiTry(async () => json({ ok: true }));
		expect(res.status).toBe(200);
	});
	it('maps StateError to 409 with message', async () => {
		const res = await apiTry(async () => { throw new StateError('Already wearing a watch'); });
		expect(res.status).toBe(409);
		expect((await res.json()).message).toBe('Already wearing a watch');
	});
	it('maps ZodError to 400', async () => {
		const res = await apiTry(async () => {
			z.object({ watch_id: z.number() }).parse({});
			return json({});
		});
		expect(res.status).toBe(400);
	});
});
