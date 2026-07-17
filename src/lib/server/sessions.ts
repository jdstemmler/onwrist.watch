import { and, eq, gt, getTableColumns, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { DB } from './db';
import { users, watches, wearSessions, type WearSession } from './db/schema';

export class StateError extends Error {
	status = 409;
}

// Sentinel "end of time" so open sessions participate in overlap math.
// Bounded to a 4-digit year: Postgres timestamptz accepts far larger years,
// but the wire-protocol extended-year format (e.g. "+275760-09-13...", what
// JS's actual Date max serializes to) isn't parseable by the pg driver here.
const FOREVER = new Date('9999-12-31T23:59:59.999Z');

export function watchLabel(w: { nickname: string | null; brand: string; model: string }): string {
	return w.nickname ?? `${w.brand} ${w.model}`;
}

export async function getOpenSession(db: DB, userId: number): Promise<WearSession | null> {
	const rows = await db
		.select({ ...getTableColumns(wearSessions) })
		.from(wearSessions)
		.innerJoin(watches, eq(watches.id, wearSessions.watchId))
		.where(and(eq(watches.userId, userId), isNull(wearSessions.endedAt)))
		.limit(1);
	return rows[0] ?? null;
}

function assertRange(startedAt: Date, endedAt: Date | null) {
	if (endedAt && endedAt.getTime() <= startedAt.getTime())
		throw new StateError('End time must be after start time');
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

async function assertNoOverlap(
	db: DB,
	userId: number,
	startedAt: Date,
	endedAt: Date | null,
	excludeId?: number
) {
	const end = endedAt ?? FOREVER;
	const clash = (
		await db
			.select({ id: wearSessions.id })
			.from(wearSessions)
			.innerJoin(watches, eq(watches.id, wearSessions.watchId))
			.where(
				and(
					eq(watches.userId, userId),
					excludeId === undefined ? undefined : ne(wearSessions.id, excludeId),
					lt(wearSessions.startedAt, end),
					or(isNull(wearSessions.endedAt), gt(wearSessions.endedAt, startedAt))
				)
			)
			.limit(1)
	)[0];
	if (clash) throw new StateError('Overlaps an existing wear session');
}

type Source = 'shortcut' | 'web' | 'backfill';

/** Serializes all mutations for a given user behind a row lock on their `users` row. */
async function lockUser(tx: DB, userId: number) {
	await tx.execute(sql`select id from ${users} where ${users.id} = ${userId} for update`);
}

// --- lock-free inner bodies, shared by putOn/takeOff/swap; callers own the tx + lock ---

async function putOnInner(
	tx: DB,
	userId: number,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): Promise<WearSession> {
	const at = opts.at ?? new Date();
	await assertWatchOwned(tx, userId, opts.watchId);
	if (await getOpenSession(tx, userId))
		throw new StateError('Already wearing a watch — swap or take it off first');
	await assertNoOverlap(tx, userId, at, null);
	return (
		await tx
			.insert(wearSessions)
			.values({
				watchId: opts.watchId,
				startedAt: at,
				endedAt: null,
				note: opts.note ?? null,
				source: opts.source ?? 'shortcut'
			})
			.returning()
	)[0];
}

async function takeOffInner(
	tx: DB,
	userId: number,
	opts: { note?: string; at?: Date; source?: Source } = {}
): Promise<WearSession> {
	const open = await getOpenSession(tx, userId);
	if (!open) throw new StateError('No watch on right now');
	const at = opts.at ?? new Date();
	assertRange(open.startedAt, at);
	const note = opts.note ? (open.note ? `${open.note}\n${opts.note}` : opts.note) : open.note;
	return (
		await tx
			.update(wearSessions)
			.set({ endedAt: at, note, updatedAt: new Date() })
			.where(eq(wearSessions.id, open.id))
			.returning()
	)[0];
}

export async function putOn(
	db: DB,
	userId: number,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): Promise<WearSession> {
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		return await putOnInner(tx, userId, opts);
	});
}

export async function takeOff(
	db: DB,
	userId: number,
	opts: { note?: string; at?: Date; source?: Source } = {}
): Promise<WearSession> {
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		return await takeOffInner(tx, userId, opts);
	});
}

export async function swap(
	db: DB,
	userId: number,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): Promise<{ closed: WearSession; opened: WearSession }> {
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		const open = await getOpenSession(tx, userId);
		if (!open) throw new StateError('No watch on — use put-on instead');
		if (open.watchId === opts.watchId) throw new StateError('Already wearing that watch');
		const at = opts.at ?? new Date();
		const closed = await takeOffInner(tx, userId, { at, source: opts.source });
		const opened = await putOnInner(tx, userId, { ...opts, at });
		return { closed, opened };
	});
}

export async function createSession(
	db: DB,
	userId: number,
	opts: { watchId: number; startedAt: Date; endedAt?: Date | null; note?: string; source?: Source }
): Promise<WearSession> {
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		await assertWatchOwned(tx, userId, opts.watchId);
		const endedAt = opts.endedAt ?? null;
		assertRange(opts.startedAt, endedAt);
		await assertNoOverlap(tx, userId, opts.startedAt, endedAt);
		return (
			await tx
				.insert(wearSessions)
				.values({
					watchId: opts.watchId,
					startedAt: opts.startedAt,
					endedAt,
					note: opts.note ?? null,
					source: opts.source ?? 'backfill'
				})
				.returning()
		)[0];
	});
}

/** Throws StateError('Session not found') (also covers cross-tenant) unless `id` belongs to `userId`. */
async function assertSessionOwned(db: DB, userId: number, id: number): Promise<WearSession> {
	const existing = (
		await db
			.select({ ...getTableColumns(wearSessions) })
			.from(wearSessions)
			.innerJoin(watches, eq(watches.id, wearSessions.watchId))
			.where(and(eq(wearSessions.id, id), eq(watches.userId, userId)))
			.limit(1)
	)[0];
	if (!existing) throw new StateError('Session not found');
	return existing;
}

export async function updateSession(
	db: DB,
	userId: number,
	id: number,
	patch: { startedAt?: Date; endedAt?: Date | null; note?: string | null; watchId?: number }
): Promise<WearSession> {
	return await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		const existing = await assertSessionOwned(tx, userId, id);
		if (patch.watchId !== undefined) await assertWatchOwned(tx, userId, patch.watchId);
		const startedAt = patch.startedAt ?? existing.startedAt;
		const endedAt = patch.endedAt === undefined ? existing.endedAt : patch.endedAt;
		assertRange(startedAt, endedAt);
		await assertNoOverlap(tx, userId, startedAt, endedAt, id);
		return (
			await tx
				.update(wearSessions)
				.set({
					startedAt,
					endedAt,
					note: patch.note === undefined ? existing.note : patch.note,
					watchId: patch.watchId ?? existing.watchId,
					updatedAt: new Date()
				})
				.where(eq(wearSessions.id, id))
				.returning()
		)[0];
	});
}

/** Cross-tenant calls are a silent no-op (the row just isn't in `userId`'s ownership scope). */
export async function deleteSession(db: DB, userId: number, id: number): Promise<void> {
	await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		const ownedWatchIds = tx.select({ id: watches.id }).from(watches).where(eq(watches.userId, userId));
		await tx
			.delete(wearSessions)
			.where(and(eq(wearSessions.id, id), inArray(wearSessions.watchId, ownedWatchIds)));
	});
}
