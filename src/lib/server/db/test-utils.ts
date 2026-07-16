import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';
import type { DB } from './index';

/** Fresh, isolated in-process Postgres per call. Drop-in replacement for
 * the old `createDb(':memory:')`. The PGlite drizzle instance is
 * structurally compatible with DB for everything the domain layer uses. */
export async function createTestDb(): Promise<DB> {
	const client = new PGlite();
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: 'drizzle' });
	return db as unknown as DB;
}
