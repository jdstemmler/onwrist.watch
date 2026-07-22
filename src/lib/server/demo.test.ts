import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inArray, eq, sql } from 'drizzle-orm';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users, watches, wearSessions } from './db/schema';
import { getOpenSession } from './sessions';
import { findDemoUser, isDemoHistoryStale, refreshDemoHistory, DEMO_STALE_MS, demoLogin } from './demo';
import { validateSession } from './auth';

const HOUR = 3_600_000;
// Deliberately an early-UTC-hour anchor: regression guard for the seed-timing
// class of bug (day-1 sessions colliding with the final open session).
const T0 = new Date('2026-07-16T05:00:00Z');

let db: DB;
let demoId: number;
let watchIds: number[];

beforeEach(async () => {
	db = await createTestDb();
	const [u] = await db
		.insert(users)
		.values({ email: 'demo@x.test', passwordHash: 'x', emailVerifiedAt: T0, isDemo: true })
		.returning();
	demoId = u.id;
	watchIds = [];
	for (const model of ['One', 'Two', 'Three']) {
		const [w] = await db.insert(watches).values({ userId: demoId, brand: 'Brand', model }).returning();
		watchIds.push(w.id);
	}
});

async function sessionRows() {
	return db.select().from(wearSessions).where(inArray(wearSessions.watchId, watchIds));
}

describe('findDemoUser', () => {
	it('finds the demo user, null when none', async () => {
		expect((await findDemoUser(db))?.id).toBe(demoId);
		await db.update(users).set({ isDemo: false }).where(eq(users.id, demoId));
		expect(await findDemoUser(db)).toBeNull();
	});

	it('ignores a disabled demo user', async () => {
		await db.update(users).set({ disabledAt: T0 }).where(eq(users.id, demoId));
		expect(await findDemoUser(db)).toBeNull();
	});
});

describe('refreshDemoHistory', () => {
	it('generates ~120 days of history with exactly one open session at anchor-3h', async () => {
		await refreshDemoHistory(db, demoId, T0);
		const rows = await sessionRows();
		expect(rows.length).toBeGreaterThan(80);
		const open = rows.filter((r) => r.endedAt === null);
		expect(open).toHaveLength(1);
		expect(open[0].startedAt.getTime()).toBe(T0.getTime() - 3 * HOUR);
		// every closed session ends strictly before the open one starts
		for (const r of rows) {
			if (r.endedAt) expect(r.endedAt.getTime()).toBeLessThan(open[0].startedAt.getTime());
		}
	});

	it('is deterministic and replaces on re-run instead of accumulating', async () => {
		await refreshDemoHistory(db, demoId, T0);
		const first = (await sessionRows()).length;
		await refreshDemoHistory(db, demoId, new Date(T0.getTime() + 26 * HOUR));
		expect((await sessionRows()).length).toBe(first);
	});

	it('no-ops for a user with no watches', async () => {
		const [bare] = await db
			.insert(users)
			.values({ email: 'bare@x.test', passwordHash: 'x' })
			.returning();
		await refreshDemoHistory(db, bare.id, T0); // must not throw
		expect(await getOpenSession(db, bare.id)).toBeNull();
	});
});

describe('isDemoHistoryStale', () => {
	it('true with no history, false right after refresh, true past 24h', async () => {
		expect(await isDemoHistoryStale(db, demoId, T0)).toBe(true);
		await refreshDemoHistory(db, demoId, T0);
		expect(await isDemoHistoryStale(db, demoId, T0)).toBe(false);
		expect(await isDemoHistoryStale(db, demoId, new Date(T0.getTime() + DEMO_STALE_MS + 4 * HOUR))).toBe(true);
	});
});

describe('demoLogin', () => {
	it('mints a session for the demo user and refreshes stale history', async () => {
		const r = await demoLogin(db, '198.51.100.7', T0);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect((await validateSession(db, r.token, T0))?.isDemo).toBe(true);
		expect(r.cookie.httpOnly).toBe(true);
		// history was empty -> stale -> refreshed
		const open = await getOpenSession(db, demoId);
		expect(open?.startedAt.getTime()).toBe(T0.getTime() - 3 * HOUR);
	});

	it('does not refresh when history is fresh', async () => {
		await refreshDemoHistory(db, demoId, T0);
		const before = (await sessionRows()).map((r) => r.id).sort();
		const later = new Date(T0.getTime() + 2 * HOUR);
		expect((await demoLogin(db, '198.51.100.7', later)).ok).toBe(true);
		const after = (await sessionRows()).map((r) => r.id).sort();
		expect(after).toEqual(before); // same rows — no wipe happened
	});

	it('404s when no demo user exists', async () => {
		await db.update(users).set({ isDemo: false }).where(eq(users.id, demoId));
		const r = await demoLogin(db, '198.51.100.7', T0);
		expect(r).toMatchObject({ ok: false, status: 404 });
	});

	it('rate limits per IP', async () => {
		for (let i = 0; i < 10; i++) {
			expect((await demoLogin(db, '203.0.113.9', T0)).ok).toBe(true);
		}
		const r = await demoLogin(db, '203.0.113.9', T0);
		expect(r).toMatchObject({ ok: false, status: 429 });
		expect((await demoLogin(db, '198.51.100.7', T0)).ok).toBe(true); // other IPs unaffected
	});

	it('still logs the visitor in when the history refresh fails', async () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			// Real breakage, no mocks: without the wear_sessions table the
			// staleness check inside demoLogin throws; login must survive it.
			await db.execute(sql`drop table wear_sessions`);
			const r = await demoLogin(db, '198.51.100.7', T0);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			expect((await validateSession(db, r.token, T0))?.isDemo).toBe(true);
			expect(errSpy).toHaveBeenCalled();
		} finally {
			errSpy.mockRestore();
		}
	});
});
