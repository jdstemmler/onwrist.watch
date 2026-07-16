import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { watches, watchPhotos, type Watch } from './db/schema';
import { statsByWatch, type WatchStats } from './stats';

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

export function createWatch(db: DB, data: WatchFormData): Watch {
	return db.insert(watches).values(data).returning().get();
}

export function updateWatch(db: DB, id: number, data: WatchFormData): Watch {
	return db.update(watches).set({ ...data, updatedAt: new Date() }).where(eq(watches.id, id)).returning().get();
}

export function deleteWatch(db: DB, id: number): void {
	db.delete(watches).where(eq(watches.id, id)).run();
}

export function listWatchesWithMeta(db: DB, tz: string, now: Date) {
	const ws = db.select().from(watches).all();
	const photos = db.select().from(watchPhotos).all();
	const stats = new Map(statsByWatch(db, tz, now).map((s) => [s.watchId, s]));
	return ws.map((watch) => ({
		watch,
		primaryPhoto:
			photos.find((p) => p.watchId === watch.id && p.isPrimary)?.filePath ??
			photos.find((p) => p.watchId === watch.id)?.filePath ?? null,
		stats: stats.get(watch.id) as WatchStats
	}));
}
