import { and, desc, eq, getTableColumns, isNotNull } from 'drizzle-orm';
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

export async function getState(db: DB, userId: number, tz: string): Promise<StateResponse> {
	const open = await getOpenSession(db, userId);

	const owned = await db
		.select()
		.from(watches)
		.where(and(eq(watches.userId, userId), eq(watches.status, 'owned')));

	// Alphabetical, not wear-recency: a static order keeps the picker scannable
	// (recency reshuffled the list on every swap).
	const list = owned
		.filter((w) => w.id !== open?.watchId)
		.map((w) => ({ id: w.id, label: watchLabel(w) }))
		.sort((a, b) => a.label.localeCompare(b.label));

	if (open) {
		const w =
			owned.find((o) => o.id === open.watchId) ??
			(await db.select().from(watches).where(eq(watches.id, open.watchId)).limit(1))[0]!;
		const label = watchLabel(w);
		return {
			status_line: `Wearing: ${label} — since ${formatTime(open.startedAt, tz)}`,
			wearing: { id: w.id, label, since: open.startedAt.toISOString() },
			valid_actions: ['swap', 'take_off'],
			watches: list
		};
	}

	const last = (
		await db
			.select({ ...getTableColumns(wearSessions) })
			.from(wearSessions)
			.innerJoin(watches, eq(watches.id, wearSessions.watchId))
			.where(and(eq(watches.userId, userId), isNotNull(wearSessions.endedAt)))
			.orderBy(desc(wearSessions.endedAt))
			.limit(1)
	)[0];
	let status_line = 'No watch on';
	if (last) {
		const w = (await db.select().from(watches).where(eq(watches.id, last.watchId)).limit(1))[0]!;
		status_line = `No watch on — took off ${watchLabel(w)} at ${formatTime(last.endedAt!, tz)}`;
	}
	return { status_line, wearing: null, valid_actions: ['put_on'], watches: list };
}
