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
	const isFirst = !db.select().from(watchPhotos).where(eq(watchPhotos.watchId, watchId)).get();
	return db.insert(watchPhotos)
		.values({ watchId, filePath: rel, isPrimary: isFirst })
		.returning().get();
}

export function deletePhoto(db: DB, photoId: number): void {
	const p = db.select().from(watchPhotos).where(eq(watchPhotos.id, photoId)).get();
	if (!p) return;
	fs.rmSync(path.join(config.dataDir, 'photos', p.filePath), { force: true });
	db.delete(watchPhotos).where(eq(watchPhotos.id, photoId)).run();
}

export function setPrimaryPhoto(db: DB, photoId: number): void {
	const p = db.select().from(watchPhotos).where(eq(watchPhotos.id, photoId)).get();
	if (!p) return;
	db.update(watchPhotos).set({ isPrimary: false }).where(eq(watchPhotos.watchId, p.watchId)).run();
	db.update(watchPhotos).set({ isPrimary: true }).where(eq(watchPhotos.id, photoId)).run();
}
