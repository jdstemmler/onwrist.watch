import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import { watches } from './db/schema';
import { StateError } from './sessions';
import { handlePutOn, handleSwap, handleTakeOff, handleBackfill } from './actions';

const TZ = 'America/Los_Angeles';
let db: DB;
let speedy: number, datejust: number;

beforeEach(() => {
	db = createDb(':memory:');
	speedy = db.insert(watches).values({ brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' }).returning().get().id;
	datejust = db.insert(watches).values({ brand: 'Rolex', model: 'Datejust' }).returning().get().id;
});

describe('action handlers', () => {
	it('put-on returns a confirmation message with the label', () => {
		const r = handlePutOn(db, TZ, { watch_id: speedy });
		expect(r.message).toBe('Put on Speedy ✓');
		expect(r.session.watchId).toBe(speedy);
	});

	it('rejects unknown watch with StateError', () => {
		expect(() => handlePutOn(db, TZ, { watch_id: 999 })).toThrow(StateError);
	});

	it('rejects malformed body with ZodError', () => {
		expect(() => handlePutOn(db, TZ, { watch_id: 'speedy' })).toThrow();
	});

	it('swap and take-off compose messages', () => {
		handlePutOn(db, TZ, { watch_id: speedy });
		const s = handleSwap(db, TZ, { watch_id: datejust });
		expect(s.message).toBe('Swapped Speedy → Rolex Datejust ✓');
		const t = handleTakeOff(db, TZ, {});
		expect(t.message).toBe('Took off Rolex Datejust ✓');
	});

	it('backfill parses ISO strings and honors overlap rules', () => {
		const r = handleBackfill(db, {
			watch_id: speedy,
			started_at: '2026-07-13T15:00:00Z',
			ended_at: '2026-07-13T23:00:00Z',
			note: 'camping'
		});
		expect(r.message).toBe('Backfilled Speedy ✓');
		expect(() =>
			handleBackfill(db, {
				watch_id: datejust,
				started_at: '2026-07-13T16:00:00Z',
				ended_at: '2026-07-13T17:00:00Z'
			})
		).toThrow(StateError);
	});
});
