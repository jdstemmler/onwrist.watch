import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';
import { ensureAdmin } from '../admin';

export type DB = NodePgDatabase<typeof schema>;

export function createDb(client: Pool): DB {
	return drizzle(client, { schema });
}

let _db: DB | undefined;
let _migrated: Promise<void> | undefined;
let _seeded: Promise<void> | undefined;

export async function getDb(): Promise<DB> {
	if (!_db) {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });
		pool.on('error', (e) => console.error('pg pool error', e));
		_db = createDb(pool);
	}
	_migrated ??= migrate(_db, { migrationsFolder: 'drizzle' }).catch((e) => {
		_migrated = undefined;
		throw e;
	});
	await _migrated;
	_seeded ??= ensureAdmin(_db).catch((e) => {
		_seeded = undefined;
		throw e;
	});
	await _seeded;
	return _db;
}
