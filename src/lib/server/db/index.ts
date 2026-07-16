import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

export function createDb(client: Pool): DB {
	return drizzle(client, { schema });
}

let _db: DB | undefined;
let _migrated: Promise<void> | undefined;

export async function getDb(): Promise<DB> {
	if (!_db) {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });
		_db = createDb(pool);
	}
	_migrated ??= migrate(_db, { migrationsFolder: 'drizzle' });
	await _migrated;
	return _db;
}
