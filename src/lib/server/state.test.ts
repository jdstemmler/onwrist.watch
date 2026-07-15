import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import { watches } from './db/schema';
import { putOn, takeOff, createSession } from './sessions';
import { getState } from './state';

const TZ = 'America/Los_Angeles';
let db: DB;
let speedy: number, datejust: number, seiko: number;

beforeEach(() => {
	db = createDb(':memory:');
	speedy = db.insert(watches).values({ brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' }).returning().get().id;
	datejust = db.insert(watches).values({ brand: 'Rolex', model: 'Datejust' }).returning().get().id;
	seiko = db.insert(watches).values({ brand: 'Seiko', model: 'SKX007', status: 'sold' }).returning().get().id;
});

describe('getState', () => {
	it('fresh install: nothing worn, all owned watches listed', () => {
		const s = getState(db, TZ);
		expect(s.wearing).toBeNull();
		expect(s.valid_actions).toEqual(['put_on']);
		expect(s.status_line).toBe('No watch on');
		expect(s.watches.map((w) => w.id)).toEqual([speedy, datejust]); // sold Seiko excluded
		expect(s.watch_menu).toEqual({ Speedy: speedy, 'Rolex Datejust': datejust });
	});

	it('wearing: swap/take_off valid, worn watch excluded from list', () => {
		putOn(db, { watchId: speedy, at: new Date('2026-07-14T14:42:00Z') });
		const s = getState(db, TZ);
		expect(s.wearing).toEqual({ id: speedy, label: 'Speedy', since: '2026-07-14T14:42:00.000Z' });
		expect(s.valid_actions).toEqual(['swap', 'take_off']);
		expect(s.status_line).toBe('Wearing: Speedy — since 7:42 AM');
		expect(s.watches.map((w) => w.id)).toEqual([datejust]);
		// menu keeps the worn watch so backfill can target it
		expect(s.watch_menu).toEqual({ Speedy: speedy, 'Rolex Datejust': datejust });
	});

	it('watch_menu disambiguates duplicate labels', () => {
		const dup = db.insert(watches).values({ brand: 'Rolex', model: 'Datejust' }).returning().get().id;
		const s = getState(db, TZ);
		expect(s.watch_menu['Rolex Datejust']).toBe(datejust);
		expect(s.watch_menu[`Rolex Datejust (#${dup})`]).toBe(dup);
	});

	it('after take-off: status line names last watch and time', () => {
		putOn(db, { watchId: speedy, at: new Date('2026-07-14T14:42:00Z') });
		takeOff(db, { at: new Date('2026-07-15T05:13:00Z') }); // 10:13 PM PDT July 14
		const s = getState(db, TZ);
		expect(s.status_line).toBe('No watch on — took off Speedy at 10:13 PM');
	});

	it('orders watches by most recent wear', () => {
		createSession(db, { watchId: datejust, startedAt: new Date('2026-07-10T15:00:00Z'), endedAt: new Date('2026-07-10T22:00:00Z') });
		createSession(db, { watchId: speedy, startedAt: new Date('2026-07-12T15:00:00Z'), endedAt: new Date('2026-07-12T22:00:00Z') });
		const s = getState(db, TZ);
		expect(s.watches.map((w) => w.id)).toEqual([speedy, datejust]);
	});
});
