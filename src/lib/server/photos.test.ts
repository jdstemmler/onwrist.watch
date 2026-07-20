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
import { savePhoto, deletePhoto, setPrimaryPhoto, getPhotoForUser } from './photos';
import { createFsStorage } from './storage/fs';
import type { PhotoStorage } from './storage';
import { StateError } from './sessions';

async function makeWatch(db: DB, userId: number) {
	return createWatch(db, userId, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
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
	let storage: PhotoStorage;
	let alice: number;
	let mallory: number;

	beforeEach(async () => {
		db = await createTestDb();
		alice = (await db.insert(users).values({ email: 'alice@b.com', passwordHash: 'x' }).returning())[0].id;
		mallory = (await db.insert(users).values({ email: 'mallory@b.com', passwordHash: 'x' }).returning())[0].id;
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'onwrist-photos-'));
		storage = createFsStorage(root);
	});

	it('downscales, converts to webp, and marks the first photo primary', async () => {
		const watch = await makeWatch(db, alice);
		const file = await pngFile(3000, 1000);
		const photo = await savePhoto(db, alice, watch.id, file, storage);

		expect(photo.filePath).toMatch(new RegExp(`^${alice}/${watch.id}/[0-9a-f-]+\\.webp$`));
		expect(photo.isPrimary).toBe(true);

		const stored = await storage.get(photo.filePath);
		expect(stored).not.toBeNull();
		const meta = await sharp(stored!).metadata();
		expect(meta.format).toBe('webp');
		expect(meta.width).toBeLessThanOrEqual(2000);
		expect(meta.height).toBeLessThanOrEqual(2000);
	});

	it('marks only the first photo primary; later photos are not', async () => {
		const watch = await makeWatch(db, alice);
		await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);
		const second = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);
		expect(second.isPrimary).toBe(false);
	});

	it('rejects non-image content types with StateError', async () => {
		const watch = await makeWatch(db, alice);
		const file = new File([Buffer.from('not an image')], 'notes.txt', { type: 'text/plain' });
		await expect(savePhoto(db, alice, watch.id, file, storage)).rejects.toThrow(StateError);
	});

	it('rejects undecodable image data with a friendly StateError', async () => {
		const watch = await makeWatch(db, alice);
		const file = new File([Buffer.from('GARBAGE')], 'photo.png', { type: 'image/png' });
		await expect(savePhoto(db, alice, watch.id, file, storage)).rejects.toThrow(
			'Could not read that image — try a different photo'
		);
	});

	it('deletePhoto removes the row and the storage object', async () => {
		const watch = await makeWatch(db, alice);
		const photo = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);
		await deletePhoto(db, alice, photo.id, storage);

		const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.id, photo.id));
		expect(rows).toHaveLength(0);
		expect(await storage.get(photo.filePath)).toBeNull();
	});

	it('setPrimaryPhoto flips flags across a watch', async () => {
		const watch = await makeWatch(db, alice);
		const first = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);
		const second = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);

		await setPrimaryPhoto(db, alice, second.id);

		const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watch.id));
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(first.id)?.isPrimary).toBe(false);
		expect(byId.get(second.id)?.isPrimary).toBe(true);
	});

	describe('tenancy', () => {
		it("mallory can't savePhoto to alice's watch", async () => {
			const watch = await makeWatch(db, alice);
			await expect(
				savePhoto(db, mallory, watch.id, await pngFile(400, 400), storage)
			).rejects.toThrow(StateError);
			const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watch.id));
			expect(rows).toHaveLength(0);
		});

		it("mallory's deletePhoto against alice's photo is a no-op", async () => {
			const watch = await makeWatch(db, alice);
			const photo = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);

			await deletePhoto(db, mallory, photo.id, storage);

			const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.id, photo.id));
			expect(rows).toHaveLength(1);
			expect(await storage.get(photo.filePath)).not.toBeNull();
		});

		it("mallory's setPrimaryPhoto against alice's photos is a no-op", async () => {
			const watch = await makeWatch(db, alice);
			const first = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);
			const second = await savePhoto(db, alice, watch.id, await pngFile(400, 400), storage);

			await setPrimaryPhoto(db, mallory, second.id);

			const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watch.id));
			const byId = new Map(rows.map((r) => [r.id, r]));
			expect(byId.get(first.id)?.isPrimary).toBe(true);
			expect(byId.get(second.id)?.isPrimary).toBe(false);
		});
	});

	describe('getPhotoForUser', () => {
		it('control-10: finds a photo by path only when it belongs to userId, else null', async () => {
			const watch = await makeWatch(db, alice);
			const photo = await savePhoto(db, alice, watch.id, await pngFile(64, 64), storage);

			const found = await getPhotoForUser(db, alice, photo.filePath);
			expect(found?.id).toBe(photo.id);

			expect(await getPhotoForUser(db, mallory, photo.filePath)).toBeNull();
			expect(await getPhotoForUser(db, alice, 'nonexistent/path.webp')).toBeNull();
		});
	});

	describe('quotas', () => {
		it('rejects the 13th photo on a single watch', async () => {
			const watch = await makeWatch(db, alice);
			for (let i = 0; i < 12; i++) {
				await savePhoto(db, alice, watch.id, await pngFile(64, 64), storage);
			}
			await expect(savePhoto(db, alice, watch.id, await pngFile(64, 64), storage)).rejects.toThrow(
				'Photo limit reached (12 per watch) — delete some photos first'
			);
			const rows = await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watch.id));
			expect(rows).toHaveLength(12);
		});

		it('quotaMultiplier raises the per-watch photo quota, and the reject message reflects it', async () => {
			await db.update(users).set({ quotaMultiplier: 2 }).where(eq(users.id, alice));
			const watch = await makeWatch(db, alice);
			for (let i = 0; i < 24; i++) {
				await savePhoto(db, alice, watch.id, await pngFile(64, 64), storage);
			}
			await expect(savePhoto(db, alice, watch.id, await pngFile(64, 64), storage)).rejects.toThrow(
				'Photo limit reached (24 per watch) — delete some photos first'
			);
		});

		it('storage quota respects quotaMultiplier (allows at multiplier 2 what would fail at 1)', async () => {
			await db.update(users).set({ quotaMultiplier: 2 }).where(eq(users.id, alice));
			const watch = await makeWatch(db, alice);
			const bigStorage: PhotoStorage = {
				...storage,
				// exactly at the base (x1) quota -- would reject without the multiplier
				sizeOfPrefix: async () => 1_073_741_824
			};
			const photo = await savePhoto(db, alice, watch.id, await pngFile(64, 64), bigStorage);
			expect(photo.id).toBeDefined();
		});

		it('storage quota rejects once even the multiplied quota is exceeded', async () => {
			await db.update(users).set({ quotaMultiplier: 2 }).where(eq(users.id, alice));
			const watch = await makeWatch(db, alice);
			const bigStorage: PhotoStorage = {
				...storage,
				sizeOfPrefix: async () => 1_073_741_824 * 2 + 1
			};
			await expect(
				savePhoto(db, alice, watch.id, await pngFile(64, 64), bigStorage)
			).rejects.toThrow('Storage limit reached — delete some photos first');
		});
	});
});
