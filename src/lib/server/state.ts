import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { DB } from './db';
import { watches, wearSessions } from './db/schema';
import { getOpenSession, watchLabel } from './sessions';
import { formatTime } from './time';

export type StateResponse = {
	status_line: string;
	wearing: { id: number; label: string; since: string } | null;
	valid_actions: ('put_on' | 'swap' | 'take_off')[];
	watches: { id: number; label: string }[];
};

export function getState(db: DB, tz: string): StateResponse {
	const open = getOpenSession(db);

	const owned = db
		.select({
			watch: watches,
			lastWorn: sql<number | null>`(
				select max(started_at) from wear_sessions s where s.watch_id = ${watches.id}
			)`
		})
		.from(watches)
		.where(eq(watches.status, 'owned'))
		.all()
		.sort((a, b) => (b.lastWorn ?? 0) - (a.lastWorn ?? 0));

	const list = owned
		.filter((r) => r.watch.id !== open?.watchId)
		.map((r) => ({ id: r.watch.id, label: watchLabel(r.watch) }));

	if (open) {
		const w = owned.find((r) => r.watch.id === open.watchId)?.watch
			?? db.select().from(watches).where(eq(watches.id, open.watchId)).get()!;
		const label = watchLabel(w);
		return {
			status_line: `Wearing: ${label} — since ${formatTime(open.startedAt, tz)}`,
			wearing: { id: w.id, label, since: open.startedAt.toISOString() },
			valid_actions: ['swap', 'take_off'],
			watches: list
		};
	}

	const last = db
		.select()
		.from(wearSessions)
		.where(isNotNull(wearSessions.endedAt))
		.orderBy(desc(wearSessions.endedAt))
		.limit(1)
		.get();
	let status_line = 'No watch on';
	if (last) {
		const w = db.select().from(watches).where(eq(watches.id, last.watchId)).get()!;
		status_line = `No watch on — took off ${watchLabel(w)} at ${formatTime(last.endedAt!, tz)}`;
	}
	return { status_line, wearing: null, valid_actions: ['put_on'], watches: list };
}
