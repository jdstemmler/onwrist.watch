import { and, eq, getTableColumns } from 'drizzle-orm';
import sharp from 'sharp';
import type { DB } from './db';
import { watches, watchPhotos, type WatchPhoto } from './db/schema';
import { getStorage, type PhotoStorage } from './storage';
import { StateError } from './errors';
import { assertWatchOwned, lockUser } from './sessions';
import { getUser } from './users';
import { photoUrl } from '../watch-label';

// Re-exported from its original home; new code imports from $lib/watch-label.
export { photoUrl };

const PHOTOS_PER_WATCH = 12;
const STORAGE_BYTES = 1_073_741_824;

// Explicit decode ceiling (sharp defaults to ~268MP): keeps a decompression
// bomb — tiny file, huge declared dimensions — from ballooning memory before
// the resize clamp gets a say. 64MP comfortably covers real phone photos.
const MAX_INPUT_PIXELS = 64_000_000;

export async function savePhoto(
	db: DB,
	userId: number,
	watchId: number,
	file: File,
	storage: PhotoStorage = getStorage()
): Promise<WatchPhoto> {
	// Check order matters: ownership beats quota, quota only checked once we
	// know we have real (decodable) image bytes to size.
	await assertWatchOwned(db, userId, watchId);

	if (!file.type.startsWith('image/')) {
		throw new StateError(`Unsupported file type: ${file.type || 'unknown'}`);
	}

	let webp: Buffer;
	try {
		webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: MAX_INPUT_PIXELS })
			.rotate()
			.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
	} catch {
		throw new StateError('Could not read that image — try a different photo');
	}

	// Quota checks and the insert serialize behind the user lock (same
	// discipline as wear-session mutations) so concurrent uploads can't all
	// pass the count/byte checks before any of them lands.
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		const user = await getUser(tx, userId);
		const multiplier = user?.quotaMultiplier ?? 1;

		const existingPhotos = await tx
			.select({ id: watchPhotos.id })
			.from(watchPhotos)
			.where(eq(watchPhotos.watchId, watchId));
		const photoQuota = PHOTOS_PER_WATCH * multiplier;
		if (existingPhotos.length >= photoQuota) {
			throw new StateError(`Photo limit reached (${photoQuota} per watch) — delete some photos first`);
		}

		const currentBytes = await storage.sizeOfPrefix(`${userId}/`);
		if (webp.length + currentBytes > STORAGE_BYTES * multiplier) {
			throw new StateError('Storage limit reached — delete some photos first');
		}

		const key = `${userId}/${watchId}/${crypto.randomUUID()}.webp`;
		await storage.put(key, webp);
		const isFirst = existingPhotos.length === 0;
		return (
			await tx.insert(watchPhotos).values({ watchId, filePath: key, isPrimary: isFirst }).returning()
		)[0];
	});
}

export async function deletePhoto(
	db: DB,
	userId: number,
	photoId: number,
	storage: PhotoStorage = getStorage()
): Promise<void> {
	const p = (
		await db
			.select({ id: watchPhotos.id, filePath: watchPhotos.filePath, watchId: watchPhotos.watchId })
			.from(watchPhotos)
			.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
			.where(and(eq(watchPhotos.id, photoId), eq(watches.userId, userId)))
			.limit(1)
	)[0];
	if (!p) return;
	// Row first, file second: a crash in between orphans a file (benign,
	// quota-inflating) instead of leaving a live row pointing at nothing.
	await db.delete(watchPhotos).where(eq(watchPhotos.id, photoId));
	await storage.delete(p.filePath);
}

/** Looks up a photo by its storage path, scoped to `userId` via the
 * owning watch. Used by the `/photos/[...path]` route so a signed-in user
 * can never fetch another tenant's photo bytes by guessing/observing a
 * storage key. */
export async function getPhotoForUser(db: DB, userId: number, filePath: string): Promise<WatchPhoto | null> {
	const row = (
		await db
			.select({ ...getTableColumns(watchPhotos) })
			.from(watchPhotos)
			.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
			.where(and(eq(watchPhotos.filePath, filePath), eq(watches.userId, userId)))
			.limit(1)
	)[0];
	return row ?? null;
}

export async function setPrimaryPhoto(db: DB, userId: number, photoId: number): Promise<void> {
	const p = (
		await db
			.select({ id: watchPhotos.id, watchId: watchPhotos.watchId })
			.from(watchPhotos)
			.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
			.where(and(eq(watchPhotos.id, photoId), eq(watches.userId, userId)))
			.limit(1)
	)[0];
	if (!p) return;
	// One transaction so a crash between the two updates can't leave the
	// watch with zero primary photos.
	await db.transaction(async (tx) => {
		await tx.update(watchPhotos).set({ isPrimary: false }).where(eq(watchPhotos.watchId, p.watchId));
		await tx.update(watchPhotos).set({ isPrimary: true }).where(eq(watchPhotos.id, photoId));
	});
}
