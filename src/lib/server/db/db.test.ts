import { describe, it, expect } from 'vitest';
import { createDb } from './index';
import { watches, wearSessions } from './schema';

describe('db', () => {
	it('creates schema and roundtrips a watch and a session', () => {
		const db = createDb(':memory:');
		const w = db
			.insert(watches)
			.values({ brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' })
			.returning()
			.get();
		expect(w.id).toBe(1);
		expect(w.status).toBe('owned');

		const s = db
			.insert(wearSessions)
			.values({ watchId: w.id, startedAt: new Date('2026-07-14T14:42:00Z'), source: 'shortcut' })
			.returning()
			.get();
		expect(s.endedAt).toBeNull();
		expect(s.startedAt.toISOString()).toBe('2026-07-14T14:42:00.000Z');
	});

	it('cascades session delete when a watch is deleted', () => {
		const db = createDb(':memory:');
		const w = db.insert(watches).values({ brand: 'A', model: 'B' }).returning().get();
		db.insert(wearSessions)
			.values({ watchId: w.id, startedAt: new Date(), source: 'web' })
			.run();
		db.delete(watches).run();
		expect(db.select().from(wearSessions).all()).toHaveLength(0);
	});
});
