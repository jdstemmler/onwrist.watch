import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

const timestamps = {
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
};

export const watches = sqliteTable('watches', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	brand: text('brand').notNull(),
	model: text('model').notNull(),
	referenceNo: text('reference_no'),
	serialNo: text('serial_no'),
	nickname: text('nickname'),
	dialColor: text('dial_color'),
	movement: text('movement', { enum: ['automatic', 'manual', 'quartz', 'solar', 'other'] }),
	caseMm: real('case_mm'),
	lugMm: real('lug_mm'),
	waterResistanceM: integer('water_resistance_m'),
	strapNotes: text('strap_notes'),
	purchaseDate: text('purchase_date'), // ISO date, e.g. 2024-11-02 (received date for gifts)
	pricePaidCents: integer('price_paid_cents'),
	isGift: integer('is_gift', { mode: 'boolean' }).notNull().default(false),
	purchasedFrom: text('purchased_from'),
	boxPapers: text('box_papers', { enum: ['none', 'box', 'papers', 'both'] }),
	condition: text('condition'),
	lastServiced: text('last_serviced'), // ISO date
	status: text('status', { enum: ['owned', 'sold'] }).notNull().default('owned'),
	soldDate: text('sold_date'),
	soldPriceCents: integer('sold_price_cents'),
	notes: text('notes'),
	...timestamps
});

export const watchPhotos = sqliteTable('watch_photos', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	watchId: integer('watch_id')
		.notNull()
		.references(() => watches.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(), // relative to ${DATA_DIR}/photos
	isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const wearSessions = sqliteTable('wear_sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	watchId: integer('watch_id')
		.notNull()
		.references(() => watches.id, { onDelete: 'cascade' }),
	startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
	endedAt: integer('ended_at', { mode: 'timestamp_ms' }), // NULL = on wrist now
	note: text('note'),
	source: text('source', { enum: ['shortcut', 'web', 'backfill'] }).notNull(),
	...timestamps
});

export const authSessions = sqliteTable('auth_sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	tokenHash: text('token_hash').notNull().unique(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export type Watch = typeof watches.$inferSelect;
export type WatchPhoto = typeof watchPhotos.$inferSelect;
export type WearSession = typeof wearSessions.$inferSelect;
