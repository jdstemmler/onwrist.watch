import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from './db';
import { watches } from './db/schema';
import { StateError, createSession, getOpenSession, putOn, swap, takeOff, watchLabel } from './sessions';

const actionBody = z.object({ watch_id: z.number().int(), note: z.string().optional() });
const takeOffBody = z.object({ note: z.string().optional() });
const backfillBody = z.object({
	watch_id: z.number().int(),
	started_at: z.string().datetime({ offset: true }),
	ended_at: z.string().datetime({ offset: true }).optional(),
	note: z.string().optional()
});

function mustGetWatch(db: DB, id: number) {
	const w = db.select().from(watches).where(eq(watches.id, id)).get();
	if (!w) throw new StateError('Unknown watch');
	return w;
}

export function handlePutOn(db: DB, _tz: string, body: unknown) {
	const b = actionBody.parse(body);
	const w = mustGetWatch(db, b.watch_id);
	const session = putOn(db, { watchId: b.watch_id, note: b.note, source: 'shortcut' });
	return { message: `Put on ${watchLabel(w)} ✓`, session };
}

export function handleSwap(db: DB, _tz: string, body: unknown) {
	const b = actionBody.parse(body);
	const w = mustGetWatch(db, b.watch_id);
	const open = getOpenSession(db);
	const from = open ? watchLabel(mustGetWatch(db, open.watchId)) : '';
	const { closed, opened } = swap(db, { watchId: b.watch_id, note: b.note, source: 'shortcut' });
	return { message: `Swapped ${from} → ${watchLabel(w)} ✓`, closed, opened };
}

export function handleTakeOff(db: DB, _tz: string, body: unknown) {
	const b = takeOffBody.parse(body);
	const open = getOpenSession(db);
	const label = open ? watchLabel(mustGetWatch(db, open.watchId)) : '';
	const session = takeOff(db, { note: b.note, source: 'shortcut' });
	return { message: `Took off ${label} ✓`, session };
}

export function handleBackfill(db: DB, body: unknown) {
	const b = backfillBody.parse(body);
	const w = mustGetWatch(db, b.watch_id);
	const session = createSession(db, {
		watchId: b.watch_id,
		startedAt: new Date(b.started_at),
		endedAt: b.ended_at ? new Date(b.ended_at) : null,
		note: b.note,
		source: 'backfill'
	});
	return { message: `Backfilled ${watchLabel(w)} ✓`, session };
}
