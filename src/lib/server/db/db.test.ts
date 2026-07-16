import { describe, it, expect } from 'vitest';
import { createTestDb } from './test-utils';
import { watches, wearSessions } from './schema';

describe('db', () => {
	it('creates schema and roundtrips a watch and a session', async () => {
		const db = await createTestDb();
		const [w] = await db
			.insert(watches)
			.values({ brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' })
			.returning();
		expect(w.id).toBe(1);
		expect(w.status).toBe('owned');

		const [s] = await db
			.insert(wearSessions)
			.values({ watchId: w.id, startedAt: new Date('2026-07-14T14:42:00Z'), source: 'shortcut' })
			.returning();
		expect(s.endedAt).toBeNull();
		expect(s.startedAt.toISOString()).toBe('2026-07-14T14:42:00.000Z');
	});

	it('cascades session delete when a watch is deleted', async () => {
		const db = await createTestDb();
		const [w] = await db.insert(watches).values({ brand: 'A', model: 'B' }).returning();
		await db.insert(wearSessions).values({ watchId: w.id, startedAt: new Date(), source: 'web' });
		await db.delete(watches);
		expect(await db.select().from(wearSessions)).toHaveLength(0);
	});
});
