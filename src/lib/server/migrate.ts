import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { users, watches, wearSessions, watchPhotos } from './db/schema';
import { emailKey, hashPassword } from './passwords';
import type { PhotoStorage } from './storage';

export type MigrationResult = {
	ownerId: number;
	watches: number;
	sessions: number;
	photos: number;
	checksumOk: true;
};

export class MigrationError extends Error {}

type LegacyWatch = {
	id: number;
	brand: string;
	model: string;
	reference_no: string | null;
	serial_no: string | null;
	nickname: string | null;
	dial_color: string | null;
	movement: string | null;
	case_mm: number | null;
	lug_mm: number | null;
	water_resistance_m: number | null;
	strap_notes: string | null;
	purchase_date: string | null;
	price_paid_cents: number | null;
	is_gift: number;
	purchased_from: string | null;
	box_papers: string | null;
	condition: string | null;
	last_serviced: string | null;
	status: string;
	sold_date: string | null;
	sold_price_cents: number | null;
	notes: string | null;
	created_at: number;
	updated_at: number;
};

type LegacySession = {
	id: number;
	watch_id: number;
	started_at: number;
	ended_at: number | null;
	note: string | null;
	source: string;
	created_at: number;
	updated_at: number;
};

type LegacyPhoto = {
	id: number;
	watch_id: number;
	file_path: string;
	is_primary: number;
	sort_order: number;
};

/** Deterministic digest of a watch's sessions, used by verification and
 * tests. Order-independent (sorted before hashing); sensitive to the
 * start/end interval of every session. */
export function sessionChecksum(rows: { startedAt: Date; endedAt: Date | null }[]): string {
	const sorted = [...rows].sort((a, b) => {
		const byStart = a.startedAt.getTime() - b.startedAt.getTime();
		if (byStart !== 0) return byStart;
		const aEnd = a.endedAt?.getTime() ?? Infinity;
		const bEnd = b.endedAt?.getTime() ?? Infinity;
		return aEnd - bEnd;
	});
	const digest = sorted.map((r) => `${r.startedAt.getTime()}:${r.endedAt?.getTime() ?? 'open'}`).join('|');
	return crypto.createHash('sha256').update(digest).digest('hex');
}

/** Reads the legacy SQLite at `sqlitePath` read-only; migrates everything
 * under an owner seeded from `opts.ownerEmail`; copies photo files from
 * `opts.legacyPhotosDir` via `storage`. Refuses to run if the target
 * Postgres already has watches. Verifies row counts, per-watch session
 * checksums, and photo readability after the copy; on any mismatch rolls
 * back (deletes the owner — cascading watches/sessions/photos rows — and
 * deletes any photo objects already copied) and throws MigrationError. */
export async function migrateLegacy(
	sqlitePath: string,
	db: DB,
	storage: PhotoStorage,
	opts: { ownerEmail: string; legacyPhotosDir: string }
): Promise<MigrationResult> {
	const s = new Database(sqlitePath, { readonly: true });
	let lWatches: LegacyWatch[];
	let lSessions: LegacySession[];
	let lPhotos: LegacyPhoto[];
	try {
		lWatches = s.prepare('SELECT * FROM watches').all() as LegacyWatch[];
		lSessions = s.prepare('SELECT * FROM wear_sessions').all() as LegacySession[];
		lPhotos = s.prepare('SELECT * FROM watch_photos').all() as LegacyPhoto[];
	} finally {
		s.close();
	}

	if ((await db.select().from(watches).limit(1)).length > 0) {
		throw new MigrationError('target Postgres already has watches');
	}

	let ownerId: number | undefined;
	const copiedKeys: string[] = [];
	const copiedPhotos: { key: string; sha256: string; size: number }[] = [];

	try {
		const watchIdMap = new Map<number, number>();

		await db.transaction(async (tx) => {
			const unusable = crypto.randomBytes(32).toString('base64url');
			const [owner] = await tx
				.insert(users)
				.values({
					email: emailKey(opts.ownerEmail),
					passwordHash: await hashPassword(unusable),
					role: 'member',
					emailVerifiedAt: new Date()
				})
				.returning({ id: users.id });
			ownerId = owner.id;

			for (const w of lWatches) {
				const [inserted] = await tx
					.insert(watches)
					.values({
						userId: ownerId,
						brand: w.brand,
						model: w.model,
						referenceNo: w.reference_no,
						serialNo: w.serial_no,
						nickname: w.nickname,
						dialColor: w.dial_color,
						movement: w.movement as typeof watches.$inferInsert.movement,
						caseMm: w.case_mm,
						lugMm: w.lug_mm,
						waterResistanceM: w.water_resistance_m,
						strapNotes: w.strap_notes,
						purchaseDate: w.purchase_date,
						pricePaidCents: w.price_paid_cents,
						isGift: Boolean(w.is_gift),
						purchasedFrom: w.purchased_from,
						boxPapers: w.box_papers as typeof watches.$inferInsert.boxPapers,
						condition: w.condition,
						lastServiced: w.last_serviced,
						status: w.status as typeof watches.$inferInsert.status,
						soldDate: w.sold_date,
						soldPriceCents: w.sold_price_cents,
						notes: w.notes,
						createdAt: new Date(w.created_at),
						updatedAt: new Date(w.updated_at)
					})
					.returning({ id: watches.id });
				watchIdMap.set(w.id, inserted.id);
			}

			for (const sess of lSessions) {
				const newWatchId = watchIdMap.get(sess.watch_id);
				if (newWatchId === undefined) {
					throw new MigrationError(`wear_sessions row ${sess.id} references unknown watch_id ${sess.watch_id}`);
				}
				await tx.insert(wearSessions).values({
					watchId: newWatchId,
					startedAt: new Date(sess.started_at),
					endedAt: sess.ended_at == null ? null : new Date(sess.ended_at),
					note: sess.note,
					source: sess.source as typeof wearSessions.$inferInsert.source,
					createdAt: new Date(sess.created_at),
					updatedAt: new Date(sess.updated_at)
				});
			}

			for (const p of lPhotos) {
				const newWatchId = watchIdMap.get(p.watch_id);
				if (newWatchId === undefined) {
					throw new MigrationError(`watch_photos row ${p.id} references unknown watch_id ${p.watch_id}`);
				}
				const key = `${ownerId}/${newWatchId}/${path.basename(p.file_path)}`;
				const bytes = fs.readFileSync(path.join(opts.legacyPhotosDir, p.file_path));
				await storage.put(key, bytes);
				copiedKeys.push(key);
				copiedPhotos.push({
					key,
					sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
					size: bytes.length
				});
				await tx.insert(watchPhotos).values({
					watchId: newWatchId,
					filePath: key,
					isPrimary: Boolean(p.is_primary),
					sortOrder: p.sort_order
				});
			}

			// Verify: row counts.
			const migratedWatches = await tx.select().from(watches).where(eq(watches.userId, ownerId));
			if (migratedWatches.length !== lWatches.length) {
				throw new MigrationError(
					`watch count mismatch: expected ${lWatches.length}, migrated ${migratedWatches.length}`
				);
			}
			const migratedPhotos = await tx.select().from(watchPhotos);
			if (migratedPhotos.length !== lPhotos.length) {
				throw new MigrationError(
					`photo count mismatch: expected ${lPhotos.length}, migrated ${migratedPhotos.length}`
				);
			}
			let migratedSessionCount = 0;

			// Verify: per-watch session checksum.
			for (const w of lWatches) {
				const newWatchId = watchIdMap.get(w.id)!;
				const legacyRows = lSessions
					.filter((sess) => sess.watch_id === w.id)
					.map((sess) => ({
						startedAt: new Date(sess.started_at),
						endedAt: sess.ended_at == null ? null : new Date(sess.ended_at)
					}));
				const migratedRows = await tx.select().from(wearSessions).where(eq(wearSessions.watchId, newWatchId));
				migratedSessionCount += migratedRows.length;
				if (sessionChecksum(legacyRows) !== sessionChecksum(migratedRows)) {
					throw new MigrationError(`session checksum mismatch for legacy watch ${w.id}`);
				}
			}
			if (migratedSessionCount !== lSessions.length) {
				throw new MigrationError(
					`session count mismatch: expected ${lSessions.length}, migrated ${migratedSessionCount}`
				);
			}

			// Verify: every migrated photo is readable back from storage and its
			// bytes match what was copied (size + sha256).
			for (const photo of copiedPhotos) {
				const retrieved = await storage.get(photo.key);
				if (retrieved === null) {
					throw new MigrationError(`photo not readable back from storage: ${photo.key}`);
				}
				if (retrieved.length !== photo.size) {
					throw new MigrationError(
						`photo size mismatch for ${photo.key}: expected ${photo.size}, got ${retrieved.length}`
					);
				}
				const retrievedSha256 = crypto.createHash('sha256').update(retrieved).digest('hex');
				if (retrievedSha256 !== photo.sha256) {
					throw new MigrationError(`photo sha256 mismatch for ${photo.key}`);
				}
			}
		});

		return {
			ownerId: ownerId!,
			watches: lWatches.length,
			sessions: lSessions.length,
			photos: lPhotos.length,
			checksumOk: true
		};
	} catch (err) {
		if (ownerId !== undefined) {
			await db.delete(users).where(eq(users.id, ownerId)); // FK cascade: watches/sessions/photos rows
		}
		for (const key of copiedKeys) {
			await storage.delete(key);
		}
		if (err instanceof MigrationError) throw err;
		throw new MigrationError(err instanceof Error ? err.message : String(err));
	}
}
