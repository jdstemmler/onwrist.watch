import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import type { DB } from './db';
import { wearSessions, type WearSession } from './db/schema';

export class StateError extends Error {
	status = 409;
}

// Sentinel "end of time" so open sessions participate in overlap math.
const FOREVER = new Date(8640000000000000);

export function watchLabel(w: { nickname: string | null; brand: string; model: string }): string {
	return w.nickname ?? `${w.brand} ${w.model}`;
}

export function getOpenSession(db: DB): WearSession | null {
	return db.select().from(wearSessions).where(isNull(wearSessions.endedAt)).get() ?? null;
}

function assertRange(startedAt: Date, endedAt: Date | null) {
	if (endedAt && endedAt.getTime() <= startedAt.getTime())
		throw new StateError('End time must be after start time');
}

function assertNoOverlap(db: DB, startedAt: Date, endedAt: Date | null, excludeId?: number) {
	const end = endedAt ?? FOREVER;
	const clash = db
		.select({ id: wearSessions.id })
		.from(wearSessions)
		.where(
			and(
				excludeId === undefined ? undefined : ne(wearSessions.id, excludeId),
				lt(wearSessions.startedAt, end),
				or(isNull(wearSessions.endedAt), gt(wearSessions.endedAt, startedAt))
			)
		)
		.get();
	if (clash) throw new StateError('Overlaps an existing wear session');
}

type Source = 'shortcut' | 'web' | 'backfill';

export function putOn(
	db: DB,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): WearSession {
	const at = opts.at ?? new Date();
	if (getOpenSession(db)) throw new StateError('Already wearing a watch — swap or take it off first');
	assertNoOverlap(db, at, null);
	return db
		.insert(wearSessions)
		.values({
			watchId: opts.watchId,
			startedAt: at,
			endedAt: null,
			note: opts.note ?? null,
			source: opts.source ?? 'shortcut'
		})
		.returning()
		.get();
}

export function takeOff(
	db: DB,
	opts: { note?: string; at?: Date; source?: Source } = {}
): WearSession {
	const open = getOpenSession(db);
	if (!open) throw new StateError('No watch on right now');
	const at = opts.at ?? new Date();
	assertRange(open.startedAt, at);
	const note = opts.note ? (open.note ? `${open.note}\n${opts.note}` : opts.note) : open.note;
	return db
		.update(wearSessions)
		.set({ endedAt: at, note, updatedAt: new Date() })
		.where(eq(wearSessions.id, open.id))
		.returning()
		.get();
}

export function swap(
	db: DB,
	opts: { watchId: number; note?: string; at?: Date; source?: Source }
): { closed: WearSession; opened: WearSession } {
	const open = getOpenSession(db);
	if (!open) throw new StateError('No watch on — use put-on instead');
	if (open.watchId === opts.watchId) throw new StateError('Already wearing that watch');
	const at = opts.at ?? new Date();
	return db.transaction((tx) => {
		const closed = takeOff(tx as unknown as DB, { at, source: opts.source });
		const opened = putOn(tx as unknown as DB, { ...opts, at });
		return { closed, opened };
	});
}

export function createSession(
	db: DB,
	opts: { watchId: number; startedAt: Date; endedAt?: Date | null; note?: string; source?: Source }
): WearSession {
	const endedAt = opts.endedAt ?? null;
	assertRange(opts.startedAt, endedAt);
	assertNoOverlap(db, opts.startedAt, endedAt);
	return db
		.insert(wearSessions)
		.values({
			watchId: opts.watchId,
			startedAt: opts.startedAt,
			endedAt,
			note: opts.note ?? null,
			source: opts.source ?? 'backfill'
		})
		.returning()
		.get();
}

export function updateSession(
	db: DB,
	id: number,
	patch: { startedAt?: Date; endedAt?: Date | null; note?: string | null; watchId?: number }
): WearSession {
	const existing = db.select().from(wearSessions).where(eq(wearSessions.id, id)).get();
	if (!existing) throw new StateError('Session not found');
	const startedAt = patch.startedAt ?? existing.startedAt;
	const endedAt = patch.endedAt === undefined ? existing.endedAt : patch.endedAt;
	assertRange(startedAt, endedAt);
	assertNoOverlap(db, startedAt, endedAt, id);
	return db
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
		.get();
}

export function deleteSession(db: DB, id: number): void {
	db.delete(wearSessions).where(eq(wearSessions.id, id)).run();
}
