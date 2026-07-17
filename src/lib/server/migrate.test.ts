import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users, watches, wearSessions, watchPhotos } from './db/schema';
import { createFsStorage } from './storage/fs';
import { migrateLegacy, sessionChecksum, MigrationError } from './migrate';

let db: DB;
let dir: string; // sandbox root
let legacyPhotos: string;
let storageRoot: string;
let sqlitePath: string;

/** Build a minimal legacy SQLite file matching the pre-Plan-A schema. */
function buildLegacy(p: string) {
	const s = new Database(p);
	s.exec(`
    CREATE TABLE watches (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, model TEXT NOT NULL,
      reference_no TEXT, serial_no TEXT, nickname TEXT, dial_color TEXT, movement TEXT, case_mm REAL, lug_mm REAL,
      water_resistance_m INTEGER, strap_notes TEXT, purchase_date TEXT, price_paid_cents INTEGER,
      is_gift INTEGER NOT NULL DEFAULT 0, purchased_from TEXT, box_papers TEXT, condition TEXT, last_serviced TEXT,
      status TEXT NOT NULL DEFAULT 'owned', sold_date TEXT, sold_price_cents INTEGER, notes TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE wear_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, watch_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL, ended_at INTEGER, note TEXT, source TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE watch_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, watch_id INTEGER NOT NULL,
      file_path TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
  `);
	const now = 1_700_000_000_000;
	s.prepare(`INSERT INTO watches (id,brand,model,is_gift,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
		.run(7, 'Omega', 'Speedmaster', 0, 'owned', now, now);
	s.prepare(`INSERT INTO watches (id,brand,model,is_gift,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
		.run(9, 'Rolex', 'Datejust', 1, 'owned', now, now);
	// two closed sessions on watch 7, one OPEN session on watch 9
	s.prepare(`INSERT INTO wear_sessions (watch_id,started_at,ended_at,source,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
		.run(7, now, now + 3_600_000, 'web', now, now);
	s.prepare(`INSERT INTO wear_sessions (watch_id,started_at,ended_at,source,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
		.run(7, now + 7_200_000, now + 9_000_000, 'backfill', now, now);
	s.prepare(`INSERT INTO wear_sessions (watch_id,started_at,ended_at,source,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
		.run(9, now + 20_000_000, null, 'web', now, now);
	// one photo on watch 7
	fs.mkdirSync(path.join(legacyPhotos, '7'), { recursive: true });
	fs.writeFileSync(path.join(legacyPhotos, '7', 'a.jpg'), Buffer.from('JPEGBYTES'));
	s.prepare(`INSERT INTO watch_photos (watch_id,file_path,is_primary,sort_order) VALUES (?,?,?,?)`)
		.run(7, '7/a.jpg', 1, 0);
	s.close();
}

beforeEach(async () => {
	db = await createTestDb();
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
	legacyPhotos = path.join(dir, 'legacy-photos');
	fs.mkdirSync(legacyPhotos, { recursive: true });
	storageRoot = path.join(dir, 'store');
	fs.mkdirSync(storageRoot, { recursive: true });
	sqlitePath = path.join(dir, 'legacy.db');
	buildLegacy(sqlitePath);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('migrateLegacy', () => {
	it('migrates watches/sessions/photos under a seeded owner with correct id remap and photo copy', async () => {
		const storage = createFsStorage(storageRoot);
		const r = await migrateLegacy(sqlitePath, db, storage, { ownerEmail: 'Owner@X.com', legacyPhotosDir: legacyPhotos });
		expect(r).toMatchObject({ watches: 2, sessions: 3, photos: 1, checksumOk: true });

		const [owner] = await db.select().from(users).where(eq(users.id, r.ownerId));
		expect(owner.email).toBe('owner@x.com');
		expect(owner.passwordHash.startsWith('$argon2id$')).toBe(true);

		const ws = await db.select().from(watches);
		expect(ws).toHaveLength(2);
		expect(ws.every((w) => w.userId === r.ownerId)).toBe(true);
		const speedy = ws.find((w) => w.brand === 'Omega')!;
		const datejust = ws.find((w) => w.brand === 'Rolex')!;
		expect(datejust.isGift).toBe(true);

		const sess = await db.select().from(wearSessions);
		expect(sess.filter((s) => s.watchId === speedy.id)).toHaveLength(2);
		const open = sess.find((s) => s.endedAt === null)!;
		expect(open.watchId).toBe(datejust.id); // remap: legacy 9 → datejust.id

		const photos = await db.select().from(watchPhotos);
		expect(photos).toHaveLength(1);
		expect(photos[0].watchId).toBe(speedy.id);
		expect(photos[0].filePath).toBe(`${r.ownerId}/${speedy.id}/a.jpg`);
		expect((await storage.get(photos[0].filePath))!.toString()).toBe('JPEGBYTES');
	});

	it('refuses to run against a non-empty target', async () => {
		const storage = createFsStorage(storageRoot);
		await migrateLegacy(sqlitePath, db, storage, { ownerEmail: 'o@x.com', legacyPhotosDir: legacyPhotos });
		await expect(migrateLegacy(sqlitePath, db, storage, { ownerEmail: 'o@x.com', legacyPhotosDir: legacyPhotos }))
			.rejects.toThrow(MigrationError);
	});

	it('rolls back to an empty target when verification fails', async () => {
		// A storage whose get() returns null makes the photo-readable check fail → mismatch → rollback.
		const storage = createFsStorage(storageRoot);
		const brokenStorage = { ...storage, get: async () => null } as typeof storage;
		await expect(migrateLegacy(sqlitePath, db, brokenStorage, { ownerEmail: 'o@x.com', legacyPhotosDir: legacyPhotos }))
			.rejects.toThrow(MigrationError);
		expect(await db.select().from(users)).toHaveLength(0);
		expect(await db.select().from(watches)).toHaveLength(0);
	});

	it('rolls back to an empty target when a copied photo comes back with mismatched bytes', async () => {
		// A storage whose get() returns a different/truncated buffer than what was put()
		// makes the byte-integrity check fail → mismatch → rollback.
		const storage = createFsStorage(storageRoot);
		const corruptingStorage = { ...storage, get: async () => Buffer.from('TRUNC') } as typeof storage;
		await expect(
			migrateLegacy(sqlitePath, db, corruptingStorage, { ownerEmail: 'o@x.com', legacyPhotosDir: legacyPhotos })
		).rejects.toThrow(MigrationError);
		expect(await db.select().from(users)).toHaveLength(0);
		expect(await db.select().from(watches)).toHaveLength(0);
	});

	it('sessionChecksum is order-independent and interval-sensitive', () => {
		const a = sessionChecksum([{ startedAt: new Date(1), endedAt: new Date(2) }, { startedAt: new Date(3), endedAt: null }]);
		const b = sessionChecksum([{ startedAt: new Date(3), endedAt: null }, { startedAt: new Date(1), endedAt: new Date(2) }]);
		const c = sessionChecksum([{ startedAt: new Date(1), endedAt: new Date(9) }, { startedAt: new Date(3), endedAt: null }]);
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});
});
