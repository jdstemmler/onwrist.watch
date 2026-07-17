import path from 'node:path';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../src/lib/server/db';
import { createFsStorage } from '../src/lib/server/storage/fs';
import { migrateLegacy, MigrationError } from '../src/lib/server/migrate';

const LEGACY_DB = process.env.LEGACY_DB ?? './data/watches.db';
const LEGACY_PHOTOS = process.env.LEGACY_PHOTOS ?? './data/photos';
const DATABASE_URL = process.env.DATABASE_URL;
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? '';
const DATA_DIR = process.env.DATA_DIR ?? './data';

if (!OWNER_EMAIL) {
	console.error('OWNER_EMAIL is required (the account that will own the migrated collection).');
	process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const db = createDb(pool);

try {
	// Ensure the target schema exists before migrateLegacy writes to it.
	await migrate(db, { migrationsFolder: 'drizzle' });

	const storage = createFsStorage(path.resolve(DATA_DIR, 'photos'));

	const result = await migrateLegacy(LEGACY_DB, db, storage, {
		ownerEmail: OWNER_EMAIL,
		legacyPhotosDir: LEGACY_PHOTOS
	});

	console.log('Migration complete:');
	console.log(`  owner id:      ${result.ownerId}`);
	console.log(`  watches:       ${result.watches}`);
	console.log(`  wear sessions: ${result.sessions}`);
	console.log(`  photos:        ${result.photos}`);
	console.log(`  checksum:      ${result.checksumOk ? 'OK' : 'FAILED'}`);
	console.log('Owner sets password via the reset flow (/reset).');
} catch (err) {
	if (err instanceof MigrationError) {
		console.error(`Migration failed: ${err.message}`);
		process.exitCode = 1;
	} else {
		throw err;
	}
} finally {
	await pool.end();
}
