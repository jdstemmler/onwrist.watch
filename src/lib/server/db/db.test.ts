import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './test-utils';
import { users, watches, wearSessions } from './schema';

describe('db', () => {
	it('creates schema and roundtrips a watch and a session', async () => {
		const db = await createTestDb();
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		const [w] = await db
			.insert(watches)
			.values({ userId: u.id, brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' })
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
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: u.id, brand: 'A', model: 'B' }).returning();
		await db.insert(wearSessions).values({ watchId: w.id, startedAt: new Date(), source: 'web' });
		await db.delete(watches);
		expect(await db.select().from(wearSessions)).toHaveLength(0);
	});

	it('DB backstop: rejects a second open session for the same watch', async () => {
		const db = await createTestDb();
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: u.id, brand: 'C', model: 'D' }).returning();
		await db.insert(wearSessions).values({ watchId: w.id, startedAt: new Date(), source: 'web' });

		await expect(
			db.insert(wearSessions).values({ watchId: w.id, startedAt: new Date(), source: 'web' })
		).rejects.toThrow();
	});

	it('DB backstop: allows a new open session after the prior one is closed', async () => {
		const db = await createTestDb();
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: u.id, brand: 'E', model: 'F' }).returning();
		const [first] = await db
			.insert(wearSessions)
			.values({ watchId: w.id, startedAt: new Date('2026-07-14T14:00:00Z'), source: 'web' })
			.returning();

		await db
			.update(wearSessions)
			.set({ endedAt: new Date('2026-07-14T15:00:00Z') })
			.where(eq(wearSessions.id, first.id));

		const [second] = await db
			.insert(wearSessions)
			.values({ watchId: w.id, startedAt: new Date('2026-07-14T15:00:00Z'), source: 'web' })
			.returning();
		expect(second.endedAt).toBeNull();
	});

	it('cascades watches and sessions when a user is deleted', async () => {
		const db = await createTestDb();
		const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
		const [w] = await db.insert(watches).values({ userId: u.id, brand: 'A', model: 'B' }).returning();
		await db.insert(wearSessions).values({ watchId: w.id, startedAt: new Date(), source: 'web' });
		await db.delete(users).where(eq(users.id, u.id));
		expect(await db.select().from(watches)).toHaveLength(0);
		expect(await db.select().from(wearSessions)).toHaveLength(0);
	});

	it('rejects duplicate emails', async () => {
		const db = await createTestDb();
		await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' });
		await expect(db.insert(users).values({ email: 'a@b.com', passwordHash: 'y' })).rejects.toThrow();
	});
});
