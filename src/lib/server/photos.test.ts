import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { watchFormSchema, createWatch } from './watches';
import { users, watchPhotos } from './db/schema';
import { savePhoto, deletePhoto, setPrimaryPhoto } from './photos';
import { createFsStorage } from './storage/fs';
import { StateError } from './sessions';

async function makeWatch(db: DB) {
	return createWatch(db, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
}

async function pngFile(width: number, height: number, name = 'photo.png'): Promise<File> {
	const buf = await sharp({
		create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } }
	})
		.png()
		.toBuffer();
	return new File([buf], name, { type: 'image/png' });
}

describe('photos', () => {
	let db: DB;
	let root: string;
	let storage: ReturnType<typeof createFsStorage>;

	beforeEach(async () => {
		db = await createTestDb();
		// createWatch hardcodes userId: 1 for now (see watches.ts); fixture user
		// must exist as the sole/first insert so its id lines up.
		await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' });
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'horolog-photos-'));
		storage = createFsStorage(root);
	});

	it('downscales, converts to webp, and marks the first photo primary', async () => {
		const watch = await makeWatch(db);
		const file = await pngFile(3000, 1000);
		const photo = await savePhoto(db, watch.id, file, storage);

		expect(photo.filePath).toMatch(new RegExp(`^${watch.id}/[0-9a-f-]+\\.webp$`));
		expect(photo.isPrimary).toBe(true);

		const stored = await storage.get(photo.filePath);
		expect(stored).not.toBeNull();
		const meta = await sharp(stored!).metadata();
		expect(meta.format).toBe('webp');
		expect(meta.width).toBeLessThanOrEqual(2000);
		expect(meta.height).toBeLessThanOrEqual(2000);
	});

	it('marks only the first photo primary; later photos are not', async () => {
		const watch = await makeWatch(db);
		await savePhoto(db, watch.id, await pngFile(400, 400), storage);
		const second = await savePhoto(db, watch.id, await pngFile(400, 400), storage);
		expect(second.isPrimary).toBe(false);
	});

	it('rejects non-image content types with StateError', async () => {
		const watch = await makeWatch(db);
		const file = new File([Buffer.from('not an image')], 'notes.txt', { type: 'text/plain' });
		await expect(savePhoto(db, watch.id, file, storage)).rejects.toThrow(StateError);
	});

	it('deletePhoto removes the row and the storage object', async () => {
		const watch = await makeWatch(db);
		const photo = await savePhoto(db, watch.id, await pngFile(400, 400), storage);
		await deletePhoto(db, photo.id, storage);

		const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.id, photo.id));
		expect(rows).toHaveLength(0);
		expect(await storage.get(photo.filePath)).toBeNull();
	});

	it('setPrimaryPhoto flips flags across a watch', async () => {
		const watch = await makeWatch(db);
		const first = await savePhoto(db, watch.id, await pngFile(400, 400), storage);
		const second = await savePhoto(db, watch.id, await pngFile(400, 400), storage);

		await setPrimaryPhoto(db, second.id);

		const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watch.id));
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(first.id)?.isPrimary).toBe(false);
		expect(byId.get(second.id)?.isPrimary).toBe(true);
	});
});
