import { describe, it, expect, beforeEach } from 'vitest';
import type { DB } from './db';
import { createTestDb } from './db/test-utils';
import { users, watches } from './db/schema';
import { createSession, putOn } from './sessions';
import { sliceSession, statsByWatch, statsByDow, statsByTod, statsTodByWatch, statsCalendar, statsSummary } from './stats';

const TZ = 'America/Los_Angeles';
const NOW = new Date('2026-07-15T00:00:00Z'); // 5 PM PDT July 14
let db: DB;
let alice: number;
let mallory: number;
let speedy: number, datejust: number;
let malloryWatch: number;

beforeEach(async () => {
	db = await createTestDb();
	alice = (await db.insert(users).values({ email: 'alice@b.com', passwordHash: 'x' }).returning())[0].id;
	mallory = (await db.insert(users).values({ email: 'mallory@b.com', passwordHash: 'x' }).returning())[0].id;
	speedy = (
		await db.insert(watches)
			.values({ userId: alice, brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy', pricePaidCents: 500000 })
			.returning()
	)[0].id;
	datejust = (await db.insert(watches).values({ userId: alice, brand: 'Rolex', model: 'Datejust' }).returning())[0].id;
	malloryWatch = (await db.insert(watches).values({ userId: mallory, brand: 'Seiko', model: 'SKX007' }).returning())[0].id;
});

describe('sliceSession', () => {
	it('splits a session into local hour buckets with minutes', () => {
		// 7:30-9:15 AM PDT = 14:30-16:15Z
		const slices = sliceSession(new Date('2026-07-14T14:30:00Z'), new Date('2026-07-14T16:15:00Z'), TZ);
		expect(slices).toEqual([
			{ hour: 7, dow: 2, dayKey: '2026-07-14', minutes: 30 },
			{ hour: 8, dow: 2, dayKey: '2026-07-14', minutes: 60 },
			{ hour: 9, dow: 2, dayKey: '2026-07-14', minutes: 15 }
		]);
	});

	it('splits sessions crossing local midnight into two days', () => {
		// 11 PM July 13 - 1 AM July 14 PDT = 06:00-08:00Z July 14
		const slices = sliceSession(new Date('2026-07-14T06:00:00Z'), new Date('2026-07-14T08:00:00Z'), TZ);
		expect(slices.map((s) => s.dayKey)).toEqual(['2026-07-13', '2026-07-14']);
		expect(slices.map((s) => s.hour)).toEqual([23, 0]);
	});
});

describe('statsByWatch', () => {
	it('computes wears, distinct local days, hours, cost-per-wear; clamps open sessions to now', async () => {
		// Speedy: two sessions on two local days, 8h + (open since 14:00Z clamped to NOW = 10h)
		await createSession(db, alice, { watchId: speedy, startedAt: new Date('2026-07-13T14:00:00Z'), endedAt: new Date('2026-07-13T22:00:00Z') });
		await putOn(db, alice, { watchId: speedy, at: new Date('2026-07-14T14:00:00Z') });
		const s = (await statsByWatch(db, alice, TZ, NOW)).find((x) => x.watchId === speedy)!;
		expect(s.wears).toBe(2);
		expect(s.distinctDays).toBe(2);
		expect(s.hours).toBeCloseTo(18, 5);
		expect(s.costPerWearCents).toBe(250000); // 500000 / 2 days
		const d = (await statsByWatch(db, alice, TZ, NOW)).find((x) => x.watchId === datejust)!;
		expect(d.wears).toBe(0);
		expect(d.costPerWearCents).toBeNull(); // no price on Datejust, no wears anyway
	});
});

describe('statsByWatch gifts', () => {
	it('a gift never gets a cost-per-wear, even with a recorded value', async () => {
		const gifted = (
			await db.insert(watches)
				.values({ userId: alice, brand: 'Timex', model: 'Snoopy Chrono', pricePaidCents: 12000, isGift: true })
				.returning()
		)[0].id;
		await createSession(db, alice, { watchId: gifted, startedAt: new Date('2026-07-13T14:00:00Z'), endedAt: new Date('2026-07-13T22:00:00Z') });
		const s = (await statsByWatch(db, alice, TZ, NOW)).find((x) => x.watchId === gifted)!;
		expect(s.wears).toBe(1);
		expect(s.costPerWearCents).toBeNull();
	});
});

describe('statsByDow / statsByTod / statsCalendar / statsSummary', () => {
	beforeEach(async () => {
		// Monday July 13: Speedy 7 AM - 3 PM PDT (14:00-22:00Z)
		await createSession(db, alice, { watchId: speedy, startedAt: new Date('2026-07-13T14:00:00Z'), endedAt: new Date('2026-07-13T22:00:00Z') });
		// Tuesday July 14: Datejust 8 AM - 4 PM PDT (15:00-23:00Z)
		await createSession(db, alice, { watchId: datejust, startedAt: new Date('2026-07-14T15:00:00Z'), endedAt: new Date('2026-07-14T23:00:00Z') });
	});

	it('by-dow attributes hours to local weekday per watch', async () => {
		const rows = await statsByDow(db, alice, TZ, NOW);
		expect(rows).toContainEqual({ dow: 1, watchId: speedy, label: 'Speedy', hours: 8 });
		expect(rows).toContainEqual({ dow: 2, watchId: datejust, label: 'Rolex Datejust', hours: 8 });
	});

	it('tod-by-watch attributes hours to local hour per watch', async () => {
		const rows = await statsTodByWatch(db, alice, TZ, NOW);
		// Speedy on 7AM-3PM Monday: full hour at 7
		expect(rows).toContainEqual({ hour: 7, watchId: speedy, label: 'Speedy', hours: 1 });
		// Datejust on 8AM-4PM Tuesday: full hour at 15, nothing at 7
		expect(rows).toContainEqual({ hour: 15, watchId: datejust, label: 'Rolex Datejust', hours: 1 });
		expect(rows.find((r) => r.hour === 7 && r.watchId === datejust)).toBeUndefined();
		// both worn across 9 AM on their respective days
		expect(rows).toContainEqual({ hour: 9, watchId: speedy, label: 'Speedy', hours: 1 });
		expect(rows).toContainEqual({ hour: 9, watchId: datejust, label: 'Rolex Datejust', hours: 1 });
	});

	it('by-tod counts put-on hour and wearing share', async () => {
		const t = await statsByTod(db, alice, TZ, NOW);
		expect(t.putOnByHour[7]).toBe(1); // Speedy on at 7 AM
		expect(t.putOnByHour[8]).toBe(1); // Datejust on at 8 AM
		expect(t.wearingShareByHour[9]).toBeGreaterThan(0); // both worn across 9 AM
		expect(t.wearingShareByHour[3]).toBe(0); // never worn at 3 AM
	});

	it('calendar picks the dominant watch per day', async () => {
		const cal = await statsCalendar(db, alice, TZ, 2026, NOW);
		expect(cal).toContainEqual({ dayKey: '2026-07-13', watchId: speedy, label: 'Speedy', hours: 8 });
		expect(cal).toContainEqual({ dayKey: '2026-07-14', watchId: datejust, label: 'Rolex Datejust', hours: 8 });
	});

	it('summary totals', async () => {
		const s = await statsSummary(db, alice, TZ, NOW);
		expect(s.watches).toBe(2);
		expect(s.sessions).toBe(2);
		expect(s.totalHours).toBeCloseTo(16, 5);
		expect(s.firstLoggedAt).toBe('2026-07-13T14:00:00.000Z');
	});
});

describe('tenancy', () => {
	it("mallory's stats never include alice's watches or sessions", async () => {
		await createSession(db, alice, { watchId: speedy, startedAt: new Date('2026-07-13T14:00:00Z'), endedAt: new Date('2026-07-13T22:00:00Z') });

		const byWatch = await statsByWatch(db, mallory, TZ, NOW);
		expect(byWatch.find((s) => s.watchId === speedy)).toBeUndefined();
		expect(byWatch.find((s) => s.watchId === malloryWatch)).toBeDefined();

		const byDow = await statsByDow(db, mallory, TZ, NOW);
		expect(byDow.find((r) => r.watchId === speedy)).toBeUndefined();

		const summary = await statsSummary(db, mallory, TZ, NOW);
		expect(summary.watches).toBe(1);
		expect(summary.sessions).toBe(0);
		expect(summary.totalHours).toBe(0);

		const cal = await statsCalendar(db, mallory, TZ, 2026, NOW);
		expect(cal).toEqual([]);
	});
});
