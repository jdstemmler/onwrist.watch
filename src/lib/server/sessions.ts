import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import type { DB } from './db';
import { wearSessions, type WearSession } from './db/schema';

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

export async function getOpenSession(db: DB): Promise<WearSession | null> {
	const rows = await db.select().from(wearSessions).where(isNull(wearSessions.endedAt)).limit(1);
	return rows[0] ?? null;
}

function assertRange(startedAt: Date, endedAt: Date | null) {
	if (endedAt && endedAt.getTime() <= startedAt.getTime())
		throw new StateError('End time must be after start time');
}

async function assertNoOverlap(db: DB, startedAt: Date, endedAt: Date | null, excludeId?: number) {
	const end = endedAt ?? FOREVER;
	const clash = (
		await db
			.select({ id: wearSessions.id })
			.from(wearSessions)
			.where(
				and(
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

export async function putOn(
	db: DB,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): Promise<WearSession> {
	const at = opts.at ?? new Date();
	if (await getOpenSession(db)) throw new StateError('Already wearing a watch — swap or take it off first');
	await assertNoOverlap(db, at, null);
	return (
		await db
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

export async function takeOff(
	db: DB,
	opts: { note?: string; at?: Date; source?: Source } = {}
): Promise<WearSession> {
	const open = await getOpenSession(db);
	if (!open) throw new StateError('No watch on right now');
	const at = opts.at ?? new Date();
	assertRange(open.startedAt, at);
	const note = opts.note ? (open.note ? `${open.note}\n${opts.note}` : opts.note) : open.note;
	return (
		await db
			.update(wearSessions)
			.set({ endedAt: at, note, updatedAt: new Date() })
			.where(eq(wearSessions.id, open.id))
			.returning()
	)[0];
}

export async function swap(
	db: DB,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): Promise<{ closed: WearSession; opened: WearSession }> {
	const open = await getOpenSession(db);
	if (!open) throw new StateError('No watch on — use put-on instead');
	if (open.watchId === opts.watchId) throw new StateError('Already wearing that watch');
	const at = opts.at ?? new Date();
	return await db.transaction(async (tx) => {
		const closed = await takeOff(tx, { at, source: opts.source });
		const opened = await putOn(tx, { ...opts, at });
		return { closed, opened };
	});
}

export async function createSession(
	db: DB,
	opts: { watchId: number; startedAt: Date; endedAt?: Date | null; note?: string; source?: Source }
): Promise<WearSession> {
	const endedAt = opts.endedAt ?? null;
	assertRange(opts.startedAt, endedAt);
	await assertNoOverlap(db, opts.startedAt, endedAt);
	return (
		await db
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
}

export async function updateSession(
	db: DB,
	id: number,
	patch: { startedAt?: Date; endedAt?: Date | null; note?: string | null; watchId?: number }
): Promise<WearSession> {
	const existing = (await db.select().from(wearSessions).where(eq(wearSessions.id, id)).limit(1))[0];
	if (!existing) throw new StateError('Session not found');
	const startedAt = patch.startedAt ?? existing.startedAt;
	const endedAt = patch.endedAt === undefined ? existing.endedAt : patch.endedAt;
	assertRange(startedAt, endedAt);
	await assertNoOverlap(db, startedAt, endedAt, id);
	return (
		await db
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
}

export async function deleteSession(db: DB, id: number): Promise<void> {
	await db.delete(wearSessions).where(eq(wearSessions.id, id));
}
