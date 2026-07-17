import { pgTable, text, integer, real, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date())
};

export const users = pgTable('users', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	email: text('email').notNull().unique(), // stored normalized (emailKey)
	passwordHash: text('password_hash').notNull(),
	emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'date' }),
	role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
	homeTz: text('home_tz').notNull().default('America/Los_Angeles'),
	staleSessionHours: integer('stale_session_hours').notNull().default(24),
	disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
	isDemo: boolean('is_demo').notNull().default(false),
	quotaMultiplier: integer('quota_multiplier').notNull().default(1),
	...timestamps
});

export const emailTokens = pgTable('email_tokens', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	purpose: text('purpose', { enum: ['verify', 'reset', 'email_change'] }).notNull(),
	tokenHash: text('token_hash').notNull().unique(),
	newEmail: text('new_email'), // email_change only
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
	usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const rateLimits = pgTable('rate_limits', {
	key: text('key').primaryKey(),
	windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
	count: integer('count').notNull().default(0)
});

export const watches = pgTable('watches', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
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
	purchaseDate: text('purchase_date'), // ISO date; received date for gifts
	pricePaidCents: integer('price_paid_cents'),
	isGift: boolean('is_gift').notNull().default(false),
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

export const watchPhotos = pgTable('watch_photos', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	watchId: integer('watch_id')
		.notNull()
		.references(() => watches.id, { onDelete: 'cascade' }),
	filePath: text('file_path').notNull(), // storage key, relative
	isPrimary: boolean('is_primary').notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const wearSessions = pgTable(
	'wear_sessions',
	{
		id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
		watchId: integer('watch_id')
			.notNull()
			.references(() => watches.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
		endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }), // NULL = on wrist
		note: text('note'),
		source: text('source', { enum: ['shortcut', 'web', 'backfill'] }).notNull(),
		...timestamps
	},
	(t) => [uniqueIndex('one_open_session_per_watch').on(t.watchId).where(sql`${t.endedAt} IS NULL`)]
);

export const authSessions = pgTable('auth_sessions', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	tokenHash: text('token_hash').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.$defaultFn(() => new Date()),
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull()
});

export type Watch = typeof watches.$inferSelect;
export type WatchPhoto = typeof watchPhotos.$inferSelect;
export type WearSession = typeof wearSessions.$inferSelect;
export type User = typeof users.$inferSelect;
export type EmailToken = typeof emailTokens.$inferSelect;
