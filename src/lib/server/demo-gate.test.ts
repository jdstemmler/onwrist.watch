import { describe, it, expect } from 'vitest';
import { parse } from 'devalue';
import type { SessionUser } from './auth';
import { demoWriteGate, DEMO_READONLY_MESSAGE } from './demo-gate';

const demoUser: SessionUser = {
	id: 1, email: 'demo@x.test', role: 'member', homeTz: 'UTC',
	staleSessionHours: 18, verified: true, isDemo: true
};
const member: SessionUser = { ...demoUser, isDemo: false };

const post = (path: string, enhanced = true) =>
	new Request(`http://localhost${path}`, {
		method: 'POST',
		headers: enhanced ? { 'x-sveltekit-action': 'true' } : {}
	});
const urlOf = (r: Request) => new URL(r.url);

describe('demoWriteGate', () => {
	it('blocks an enhanced action POST with a failure-shaped 409 carrying the action name', async () => {
		const req = post('/log?/putOn');
		const res = demoWriteGate(demoUser, req, urlOf(req));
		expect(res?.status).toBe(409);
		const body = await res!.json();
		expect(body.type).toBe('failure');
		expect(body.status).toBe(409);
		expect(parse(body.data)).toEqual({ action: 'putOn', message: DEMO_READONLY_MESSAGE });
	});

	it('303s a non-enhanced POST back to the page', () => {
		const req = post('/watches/3/edit?/update', false);
		const res = demoWriteGate(demoUser, req, urlOf(req));
		expect(res?.status).toBe(303);
		expect(res?.headers.get('location')).toBe('/watches/3/edit');
	});

	it('allows logout, GETs, non-demo users, and anonymous requests', () => {
		const logout = post('/login?/logout');
		expect(demoWriteGate(demoUser, logout, urlOf(logout))).toBeNull();
		const get = new Request('http://localhost/stats');
		expect(demoWriteGate(demoUser, get, urlOf(get))).toBeNull();
		const write = post('/log?/putOn');
		expect(demoWriteGate(member, write, urlOf(write))).toBeNull();
		expect(demoWriteGate(null, write, urlOf(write))).toBeNull();
	});
});
