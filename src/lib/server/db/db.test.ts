import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, resolveDbFile } from './index';
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

describe('resolveDbFile', () => {
	const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'horolog-db-'));

	it('returns the app-name-agnostic watches.db path', () => {
		const dir = tmp();
		expect(resolveDbFile(dir)).toBe(path.join(dir, 'watches.db'));
	});

	it('migrates a legacy horolog.db (and WAL sidecars) to watches.db once', () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, 'horolog.db'), 'main');
		fs.writeFileSync(path.join(dir, 'horolog.db-wal'), 'wal');
		fs.writeFileSync(path.join(dir, 'horolog.db-shm'), 'shm');
		const file = resolveDbFile(dir);
		expect(file).toBe(path.join(dir, 'watches.db'));
		expect(fs.readFileSync(file, 'utf8')).toBe('main');
		expect(fs.readFileSync(`${file}-wal`, 'utf8')).toBe('wal');
		expect(fs.readFileSync(`${file}-shm`, 'utf8')).toBe('shm');
		expect(fs.existsSync(path.join(dir, 'horolog.db'))).toBe(false);
	});

	it('never overwrites an existing watches.db with the legacy file', () => {
		const dir = tmp();
		fs.writeFileSync(path.join(dir, 'watches.db'), 'current');
		fs.writeFileSync(path.join(dir, 'horolog.db'), 'stale-legacy');
		const file = resolveDbFile(dir);
		expect(fs.readFileSync(file, 'utf8')).toBe('current');
		expect(fs.existsSync(path.join(dir, 'horolog.db'))).toBe(true); // left alone
	});
});
