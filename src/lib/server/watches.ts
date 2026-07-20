import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { watches, watchPhotos, type Watch } from './db/schema';
import { statsByWatch, type WatchStats } from './stats';
import { StateError } from './errors';
import { lockUser } from './sessions';
import { getUser } from './users';
import { getStorage, type PhotoStorage } from './storage';

const WATCH_QUOTA = 20;

const optStr = z.preprocess((v) => (v === '' || v == null ? null : v), z.string().nullable());
const optNum = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().nullable());
const dollarsToCents = z.preprocess(
	(v) => (v === '' || v == null ? null : Math.round(Number(v) * 100)),
	z.number().int().nullable()
);

export const watchFormSchema = z
	.object({
		brand: z.string().min(1),
		model: z.string().min(1),
		referenceNo: optStr.default(null),
		serialNo: optStr.default(null),
		nickname: optStr.default(null),
		dialColor: optStr.default(null),
		movement: z.enum(['automatic', 'manual', 'quartz', 'solar', 'other']).nullable().catch(null).default(null),
		caseMm: optNum.default(null),
		lugMm: optNum.default(null),
		waterResistanceM: optNum.default(null),
		strapNotes: optStr.default(null),
		purchaseDate: optStr.default(null),
		pricePaid: dollarsToCents.default(null),
		isGift: z.preprocess((v) => v === 'on' || v === true, z.boolean()),
		purchasedFrom: optStr.default(null),
		boxPapers: z.enum(['none', 'box', 'papers', 'both']).nullable().catch(null).default(null),
		condition: optStr.default(null),
		lastServiced: optStr.default(null),
		status: z.enum(['owned', 'sold']).default('owned'),
		soldDate: optStr.default(null),
		soldPrice: dollarsToCents.default(null),
		notes: optStr.default(null)
	})
	.transform(({ pricePaid, soldPrice, ...rest }) => ({
		...rest,
		pricePaidCents: pricePaid,
		soldPriceCents: soldPrice
	}));

export type WatchFormData = z.infer<typeof watchFormSchema>;

export async function createWatch(db: DB, userId: number, data: WatchFormData): Promise<Watch> {
	// Quota check and insert serialize behind the user lock so concurrent
	// creates can't both pass the check at 19/20 and land on 21.
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		const user = await getUser(tx, userId);
		const quota = WATCH_QUOTA * (user?.quotaMultiplier ?? 1);
		const existing = (
			await tx.select({ id: watches.id }).from(watches).where(eq(watches.userId, userId))
		).length;
		if (existing >= quota) {
			throw new StateError(`Watch limit reached (${quota}) — contact the admin if you need more`);
		}
		return (await tx.insert(watches).values({ ...data, userId }).returning())[0];
	});
}

export async function updateWatch(
	db: DB,
	userId: number,
	id: number,
	data: WatchFormData
): Promise<Watch> {
	const row = (
		await db
			.update(watches)
			.set({ ...data, updatedAt: new Date() })
			.where(and(eq(watches.id, id), eq(watches.userId, userId)))
			.returning()
	)[0];
	if (!row) throw new StateError('Watch not found');
	return row;
}

/** Cross-tenant calls are a silent no-op (the row just isn't in `userId`'s ownership scope). */
export async function deleteWatch(
	db: DB,
	userId: number,
	id: number,
	storage: PhotoStorage = getStorage()
): Promise<void> {
	// The FK cascade removes photo *rows*; the *files* must go explicitly or
	// they'd count against the user's storage quota forever (sizeOfPrefix
	// walks the disk). Row delete first, files after: a crash in between
	// leaves orphaned files (quota-inflating but harmless), whereas the
	// reverse order could strand live rows pointing at missing files.
	const photoPaths = (
		await db
			.select({ filePath: watchPhotos.filePath })
			.from(watchPhotos)
			.innerJoin(watches, eq(watches.id, watchPhotos.watchId))
			.where(and(eq(watchPhotos.watchId, id), eq(watches.userId, userId)))
	).map((p) => p.filePath);
	const deleted = await db
		.delete(watches)
		.where(and(eq(watches.id, id), eq(watches.userId, userId)))
		.returning({ id: watches.id });
	if (deleted.length === 0) return;
	for (const filePath of photoPaths) await storage.delete(filePath);
}

export async function listWatchesWithMeta(db: DB, userId: number, tz: string, now: Date) {
	const ws = await db.select().from(watches).where(eq(watches.userId, userId));
	const watchIds = ws.map((w) => w.id);
	const photos = watchIds.length
		? await db.select().from(watchPhotos).where(inArray(watchPhotos.watchId, watchIds))
		: [];
	const stats = new Map((await statsByWatch(db, userId, tz, now)).map((s) => [s.watchId, s]));
	return ws.map((watch) => ({
		watch,
		primaryPhoto:
			photos.find((p) => p.watchId === watch.id && p.isPrimary)?.filePath ??
			photos.find((p) => p.watchId === watch.id)?.filePath ?? null,
		stats: stats.get(watch.id) as WatchStats
	}));
}
