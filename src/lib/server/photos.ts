import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db';
import { watchPhotos, type WatchPhoto } from './db/schema';
import { config } from './config';

export function photoUrl(filePath: string): string {
	return `/photos/${filePath}`;
}

export async function savePhoto(db: DB, watchId: number, file: File): Promise<WatchPhoto> {
	const ext = path.extname(file.name).toLowerCase() || '.jpg';
	const rel = path.join(String(watchId), `${crypto.randomUUID()}${ext}`);
	const abs = path.join(config.dataDir, 'photos', rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, Buffer.from(await file.arrayBuffer()));
	const isFirst = !(
		await db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watchId)).limit(1)
	)[0];
	return (
		await db.insert(watchPhotos).values({ watchId, filePath: rel, isPrimary: isFirst }).returning()
	)[0];
}

export async function deletePhoto(db: DB, photoId: number): Promise<void> {
	const p = (await db.select().from(watchPhotos).where(eq(watchPhotos.id, photoId)).limit(1))[0];
	if (!p) return;
	fs.rmSync(path.join(config.dataDir, 'photos', p.filePath), { force: true });
	await db.delete(watchPhotos).where(eq(watchPhotos.id, photoId));
}

export async function setPrimaryPhoto(db: DB, photoId: number): Promise<void> {
	const p = (await db.select().from(watchPhotos).where(eq(watchPhotos.id, photoId)).limit(1))[0];
	if (!p) return;
	await db.update(watchPhotos).set({ isPrimary: false }).where(eq(watchPhotos.watchId, p.watchId));
	await db.update(watchPhotos).set({ isPrimary: true }).where(eq(watchPhotos.id, photoId));
}
