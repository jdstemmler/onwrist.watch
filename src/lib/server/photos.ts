import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { DB } from './db';
import { watchPhotos, type WatchPhoto } from './db/schema';
import { getStorage, type PhotoStorage } from './storage';
import { StateError } from './sessions';

export function photoUrl(filePath: string): string {
	return `/photos/${filePath}`;
}

export async function savePhoto(
	db: DB,
	watchId: number,
	file: File,
	storage: PhotoStorage = getStorage()
): Promise<WatchPhoto> {
	if (!file.type.startsWith('image/')) {
		throw new StateError(`Unsupported file type: ${file.type || 'unknown'}`);
	}
	const webp = await sharp(Buffer.from(await file.arrayBuffer()))
		.rotate()
		.resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer();
	const key = `${watchId}/${crypto.randomUUID()}.webp`;
	await storage.put(key, webp);
	const isFirst = !(
		await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watchId)).limit(1)
	)[0];
	return (
		await db.insert(watchPhotos).values({ watchId, filePath: key, isPrimary: isFirst }).returning()
	)[0];
}

export async function deletePhoto(
	db: DB,
	photoId: number,
	storage: PhotoStorage = getStorage()
): Promise<void> {
	const p = (await db.select().from(watchPhotos).where(eq(watchPhotos.id, photoId)).limit(1))[0];
	if (!p) return;
	await storage.delete(p.filePath);
	await db.delete(watchPhotos).where(eq(watchPhotos.id, photoId));
}

export async function setPrimaryPhoto(db: DB, photoId: number): Promise<void> {
	const p = (await db.select().from(watchPhotos).where(eq(watchPhotos.id, photoId)).limit(1))[0];
	if (!p) return;
	await db.update(watchPhotos).set({ isPrimary: false }).where(eq(watchPhotos.watchId, p.watchId));
	await db.update(watchPhotos).set({ isPrimary: true }).where(eq(watchPhotos.id, photoId));
}
