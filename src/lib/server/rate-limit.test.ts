import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { rateLimits } from './db/schema';
import { rateLimit, rateLimitCheck, pruneRateLimits, LIMITS } from './rate-limit';

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

describe('rateLimitCheck', () => {
	it('does not consume a slot: reports under-limit repeatedly with no row created yet', async () => {
		expect(await rateLimitCheck(db, 'loginAccount', 'login:acct:a@b.com', T0)).toBe(true);
		expect(await rateLimitCheck(db, 'loginAccount', 'login:acct:a@b.com', T0)).toBe(true);
		const rows = await db.select().from(rateLimits);
		expect(rows).toHaveLength(0);
	});

	it('reflects rows written by rateLimit without incrementing them itself', async () => {
		for (let i = 0; i < LIMITS.loginAccount.max; i++)
			await rateLimit(db, 'loginAccount', 'login:acct:a@b.com', T0);
		expect(await rateLimitCheck(db, 'loginAccount', 'login:acct:a@b.com', T0)).toBe(false);
		// checking again doesn't push it further over, or reset it
		expect(await rateLimitCheck(db, 'loginAccount', 'login:acct:a@b.com', T0)).toBe(false);
		const [row] = await db.select().from(rateLimits);
		expect(row.count).toBe(LIMITS.loginAccount.max);
	});

	it('treats an expired window as under-limit even if the stored count is maxed', async () => {
		for (let i = 0; i < LIMITS.loginAccount.max; i++)
			await rateLimit(db, 'loginAccount', 'login:acct:a@b.com', T0);
		expect(
			await rateLimitCheck(db, 'loginAccount', 'login:acct:a@b.com', plus(LIMITS.loginAccount.windowMs + 1))
		).toBe(true);
	});
});

describe('pruneRateLimits', () => {
	it('deletes rows older than the largest configured window, keeps fresh ones', async () => {
		await rateLimit(db, 'resetAccount', 'old-key', T0);
		await rateLimit(db, 'loginIp', 'fresh-key', plus(50_000_000));

		await pruneRateLimits(db, plus(100_000_000));

		const rows = await db.select().from(rateLimits);
		expect(rows.map((r) => r.key)).toEqual(['fresh-key']);
	});
});
