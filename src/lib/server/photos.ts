import { and, eq, getTableColumns } from 'drizzle-orm';
import sharp from 'sharp';
import type { DB } from './db';
import { watches, watchPhotos, type WatchPhoto } from './db/schema';
import { getStorage, type PhotoStorage } from './storage';
import { StateError } from './sessions';
import { getUser } from './users';

const PHOTOS_PER_WATCH = 12;
const STORAGE_BYTES = 1_073_741_824;

export function photoUrl(filePath: string): string {
	return `/photos/${filePath}`;
}

/** Throws (also covers not-found) unless `watchId` belongs to `userId`. */
async function assertWatchOwned(db: DB, userId: number, watchId: number) {
	const row = (
		await db
			.select({ id: watches.id })
			.from(watches)
			.where(and(eq(watches.id, watchId), eq(watches.userId, userId)))
			.limit(1)
	)[0];
	if (!row) throw new StateError("That watch isn't yours");
}

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
		webp = await sharp(Buffer.from(await file.arrayBuffer()))
			.rotate()
			.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
	} catch {
		throw new StateError('Could not read that image — try a different photo');
	}

	const user = await getUser(db, userId);
	const multiplier = user?.quotaMultiplier ?? 1;

	const existingPhotos = await db
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
		await db.insert(watchPhotos).values({ watchId, filePath: key, isPrimary: isFirst }).returning()
	)[0];
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
	await storage.delete(p.filePath);
	await db.delete(watchPhotos).where(eq(watchPhotos.id, photoId));
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
	await db.update(watchPhotos).set({ isPrimary: false }).where(eq(watchPhotos.watchId, p.watchId));
	await db.update(watchPhotos).set({ isPrimary: true }).where(eq(watchPhotos.id, photoId));
}
