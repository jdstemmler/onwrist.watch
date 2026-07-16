import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users, watches } from './db/schema';
import { putOn, takeOff, createSession } from './sessions';
import { getState } from './state';

const TZ = 'America/Los_Angeles';
let db: DB;
let speedy: number, datejust: number, seiko: number;

beforeEach(async () => {
	db = await createTestDb();
	const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
	speedy = (await db.insert(watches).values({ userId: u.id, brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' }).returning())[0].id;
	datejust = (await db.insert(watches).values({ userId: u.id, brand: 'Rolex', model: 'Datejust' }).returning())[0].id;
	seiko = (await db.insert(watches).values({ userId: u.id, brand: 'Seiko', model: 'SKX007', status: 'sold' }).returning())[0].id;
});

describe('getState', () => {
	it('fresh install: nothing worn, all owned watches listed', async () => {
		const s = await getState(db, TZ);
		expect(s.wearing).toBeNull();
		expect(s.valid_actions).toEqual(['put_on']);
		expect(s.status_line).toBe('No watch on');
		expect(s.watches.map((w) => w.id)).toEqual([speedy, datejust]); // sold Seiko excluded
	});

	it('wearing: swap/take_off valid, worn watch excluded from list', async () => {
		await putOn(db, { watchId: speedy, at: new Date('2026-07-14T14:42:00Z') });
		const s = await getState(db, TZ);
		expect(s.wearing).toEqual({ id: speedy, label: 'Speedy', since: '2026-07-14T14:42:00.000Z' });
		expect(s.valid_actions).toEqual(['swap', 'take_off']);
		expect(s.status_line).toBe('Wearing: Speedy — since 7:42 AM');
		expect(s.watches.map((w) => w.id)).toEqual([datejust]);
	});

	it('after take-off: status line names last watch and time', async () => {
		await putOn(db, { watchId: speedy, at: new Date('2026-07-14T14:42:00Z') });
		await takeOff(db, { at: new Date('2026-07-15T05:13:00Z') }); // 10:13 PM PDT July 14
		const s = await getState(db, TZ);
		expect(s.status_line).toBe('No watch on — took off Speedy at 10:13 PM');
	});

	it('orders watches by most recent wear', async () => {
		await createSession(db, { watchId: datejust, startedAt: new Date('2026-07-10T15:00:00Z'), endedAt: new Date('2026-07-10T22:00:00Z') });
		await createSession(db, { watchId: speedy, startedAt: new Date('2026-07-12T15:00:00Z'), endedAt: new Date('2026-07-12T22:00:00Z') });
		const s = await getState(db, TZ);
		expect(s.watches.map((w) => w.id)).toEqual([speedy, datejust]);
	});
});
