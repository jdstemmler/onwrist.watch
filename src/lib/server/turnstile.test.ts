import { describe, it, expect, afterEach, vi } from 'vitest';
import { verifyTurnstile } from './turnstile';

describe('verifyTurnstile', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('passes when the siteverify response says success:true', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
		vi.stubGlobal('fetch', fetchMock);

		expect(await verifyTurnstile('secret', 'tok', '1.2.3.4')).toBe(true);
		const [url, opts] = fetchMock.mock.calls[0];
		expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(opts.method).toBe('POST');
		const body = new URLSearchParams(opts.body);
		expect(body.get('secret')).toBe('secret');
		expect(body.get('response')).toBe('tok');
		expect(body.get('remoteip')).toBe('1.2.3.4');
	});

	it('fails when the siteverify response says success:false', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) })
		);
		expect(await verifyTurnstile('secret', 'bad-tok')).toBe(false);
	});

	it('fails closed on a network error', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
		expect(await verifyTurnstile('secret', 'tok')).toBe(false);
	});

	it('fails closed on a non-2xx response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
		expect(await verifyTurnstile('secret', 'tok')).toBe(false);
	});
});
