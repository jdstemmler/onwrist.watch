import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { config } from '../config';

export function createDb(file: string) {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
	const sqlite = new Database(file);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: 'drizzle' });
	return db;
}

export type DB = ReturnType<typeof createDb>;

/**
 * App-name-agnostic database path: ${dataDir}/watches.db. Deployments that
 * predate the rename have ${dataDir}/horolog.db — migrate it (with WAL
 * sidecars) exactly once. An existing watches.db always wins; a leftover
 * legacy file is never allowed to clobber it.
 */
export function resolveDbFile(dataDir: string): string {
	const file = path.join(dataDir, 'watches.db');
	const legacy = path.join(dataDir, 'horolog.db');
	if (!fs.existsSync(file) && fs.existsSync(legacy)) {
		fs.renameSync(legacy, file);
		for (const ext of ['-wal', '-shm']) {
			if (fs.existsSync(legacy + ext)) fs.renameSync(legacy + ext, file + ext);
		}
	}
	return file;
}

let _db: DB | undefined;
export function getDb(): DB {
	_db ??= createDb(resolveDbFile(config.dataDir));
	return _db;
}
