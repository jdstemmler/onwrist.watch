import { describe, it, expect } from 'vitest';

// Opt-in integration test against a real Postgres — PGlite can't interleave
// two transactions, so this is the only place the FOR UPDATE row-lock
// serialization in sessions.ts actually gets exercised under real
// concurrency. Skipped in the normal suite; run explicitly against the
// scratch stack:
//   docker compose -f docker-compose.scratch.yml -p onwrist-scratch up -d
//   RACE_DATABASE_URL=postgres://onwrist:scratch@localhost:55432/onwrist \
//     npx vitest run src/lib/server/sessions.race.test.ts
const url = process.env.RACE_DATABASE_URL;

describe.skipIf(!url)('per-user open-session invariant under concurrency', () => {
	it('control-race: concurrent putOn — exactly one wins', async () => {
		const { Pool } = await import('pg');
		const { drizzle } = await import('drizzle-orm/node-postgres');
		const { migrate } = await import('drizzle-orm/node-postgres/migrator');
		const { eq } = await import('drizzle-orm');
		const schema = await import('./db/schema');
		const { putOn } = await import('./sessions');

		// Two pools = two real connections = genuine interleaving.
		const poolA = new Pool({ connectionString: url });
		const poolB = new Pool({ connectionString: url });
		const dbA = drizzle(poolA, { schema });
		const dbB = drizzle(poolB, { schema });

		await migrate(dbA, { migrationsFolder: 'drizzle' });

		const [user] = await dbA
			.insert(schema.users)
			.values({ email: `race-${Date.now()}@test.local`, passwordHash: 'x' })
			.returning();
		const [w1] = await dbA
			.insert(schema.watches)
			.values({ userId: user.id, brand: 'Race', model: 'One' })
			.returning();
		const [w2] = await dbA
			.insert(schema.watches)
			.values({ userId: user.id, brand: 'Race', model: 'Two' })
			.returning();

		try {
			const results = await Promise.allSettled([
				putOn(dbA, user.id, { watchId: w1.id }),
				putOn(dbB, user.id, { watchId: w2.id })
			]);
			expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
			expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
		} finally {
			await dbA.delete(schema.wearSessions).where(eq(schema.wearSessions.watchId, w1.id));
			await dbA.delete(schema.wearSessions).where(eq(schema.wearSessions.watchId, w2.id));
			await dbA.delete(schema.watches).where(eq(schema.watches.userId, user.id));
			await dbA.delete(schema.users).where(eq(schema.users.id, user.id));
			await poolA.end();
			await poolB.end();
		}
	});
});
