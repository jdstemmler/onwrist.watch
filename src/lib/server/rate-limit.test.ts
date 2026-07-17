import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { rateLimit, LIMITS } from './rate-limit';

let db: DB;
beforeEach(async () => {
	db = await createTestDb();
});

const T0 = new Date('2026-07-16T12:00:00Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);

describe('rateLimit', () => {
	it('control-5: allows up to max within the window, then blocks', async () => {
		for (let i = 0; i < LIMITS.resetAccount.max; i++)
			expect(await rateLimit(db, 'resetAccount', 'reset:acct:a@b.com', T0)).toBe(true);
		expect(await rateLimit(db, 'resetAccount', 'reset:acct:a@b.com', T0)).toBe(false);
	});

	it('resets when the window rolls over', async () => {
		for (let i = 0; i < LIMITS.resetAccount.max; i++)
			await rateLimit(db, 'resetAccount', 'reset:acct:a@b.com', T0);
		expect(await rateLimit(db, 'resetAccount', 'reset:acct:a@b.com', plus(LIMITS.resetAccount.windowMs + 1))).toBe(true);
	});

	it('tracks keys independently', async () => {
		for (let i = 0; i < LIMITS.loginIp.max; i++)
			await rateLimit(db, 'loginIp', 'login:ip:1.2.3.4', T0);
		expect(await rateLimit(db, 'loginIp', 'login:ip:1.2.3.4', T0)).toBe(false);
		expect(await rateLimit(db, 'loginIp', 'login:ip:5.6.7.8', T0)).toBe(true);
	});
});
