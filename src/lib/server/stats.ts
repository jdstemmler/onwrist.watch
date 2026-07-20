import { asc, eq, getTableColumns } from 'drizzle-orm';
import type { DB } from './db';
import { watches, wearSessions, type Watch, type WearSession } from './db/schema';
import { watchLabel } from './sessions';
import { zonedParts } from './time';

export type HourSlice = { hour: number; dow: number; dayKey: string; minutes: number };

export function sliceSession(startedAt: Date, endedAt: Date, tz: string): HourSlice[] {
	const out: HourSlice[] = [];
	let cursor = startedAt.getTime();
	const end = endedAt.getTime();
	while (cursor < end) {
		const p = zonedParts(new Date(cursor), tz);
		// Advance to the next *local* hour boundary, not the next UTC one:
		// for zones at :30/:45 offsets (India, Nepal, ...) UTC-hour slices
		// would straddle two local hours — and local midnight — mislabeling
		// hour/dow/dayKey for the tail of every slice. IANA offsets are all
		// whole minutes, so UTC and local minute boundaries coincide and the
		// remainder-into-the-minute can be taken from the UTC clock.
		const msIntoMinute = cursor % 60_000;
		const bucketEnd = Math.min(end, cursor + (60 - p.minute) * 60_000 - msIntoMinute);
		out.push({ hour: p.hour, dow: p.dow, dayKey: p.dayKey, minutes: (bucketEnd - cursor) / 60_000 });
		cursor = bucketEnd;
	}
	return out;
}

async function loadAll(db: DB, userId: number, now: Date) {
	const ws = await db.select().from(watches).where(eq(watches.userId, userId));
	const sessions = await db
		.select({ ...getTableColumns(wearSessions) })
		.from(wearSessions)
		.innerJoin(watches, eq(watches.id, wearSessions.watchId))
		.where(eq(watches.userId, userId))
		.orderBy(asc(wearSessions.startedAt));
	const clamped = sessions.map((s) => ({ ...s, endedAt: s.endedAt ?? now }));
	return { ws, sessions, clamped };
}

export type WatchStats = {
	watchId: number; label: string; status: 'owned' | 'sold';
	wears: number; distinctDays: number; hours: number;
	lastWornAt: string | null; costPerWearCents: number | null;
};

export async function statsByWatch(db: DB, userId: number, tz: string, now: Date): Promise<WatchStats[]> {
	const { ws, clamped } = await loadAll(db, userId, now);
	return ws.map((w) => {
		const mine = clamped.filter((s) => s.watchId === w.id);
		const days = new Set<string>();
		let minutes = 0;
		for (const s of mine)
			for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
				days.add(slice.dayKey);
				minutes += slice.minutes;
			}
		// "Last worn" is when the watch last came off the wrist (clamped `now`
		// for a still-open session), not when it last went on — a week-long
		// session shouldn't read as "worn 7 days ago" the day it ends.
		const lastWornAt = mine.length ? mine[mine.length - 1].endedAt.toISOString() : null;
		return {
			watchId: w.id,
			label: watchLabel(w),
			status: w.status,
			wears: mine.length,
			distinctDays: days.size,
			hours: minutes / 60,
			lastWornAt,
			costPerWearCents:
				w.pricePaidCents != null && mine.length > 0 && !w.isGift
					? Math.round(w.pricePaidCents / mine.length)
					: null
		};
	});
}

export async function statsSummary(db: DB, userId: number, tz: string, now: Date) {
	const { ws, sessions, clamped } = await loadAll(db, userId, now);
	let minutes = 0;
	for (const s of clamped)
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) minutes += slice.minutes;
	return {
		watches: ws.length,
		sessions: sessions.length,
		totalHours: minutes / 60,
		firstLoggedAt: sessions.length ? sessions[0].startedAt.toISOString() : null
	};
}

export async function statsByDow(db: DB, userId: number, tz: string, now: Date) {
	const { ws, clamped } = await loadAll(db, userId, now);
	const labels = new Map(ws.map((w) => [w.id, watchLabel(w)]));
	const acc = new Map<string, number>(); // `${dow}:${watchId}` -> minutes
	for (const s of clamped)
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
			const k = `${slice.dow}:${s.watchId}`;
			acc.set(k, (acc.get(k) ?? 0) + slice.minutes);
		}
	return [...acc.entries()].map(([k, minutes]) => {
		const [dow, watchId] = k.split(':').map(Number);
		return { dow, watchId, label: labels.get(watchId)!, hours: minutes / 60 };
	});
}

export async function statsTodByWatch(db: DB, userId: number, tz: string, now: Date) {
	const { ws, clamped } = await loadAll(db, userId, now);
	const labels = new Map(ws.map((w) => [w.id, watchLabel(w)]));
	const acc = new Map<string, number>(); // `${hour}:${watchId}` -> minutes
	for (const s of clamped)
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
			const k = `${slice.hour}:${s.watchId}`;
			acc.set(k, (acc.get(k) ?? 0) + slice.minutes);
		}
	return [...acc.entries()].map(([k, minutes]) => {
		const [hour, watchId] = k.split(':').map(Number);
		return { hour, watchId, label: labels.get(watchId)!, hours: minutes / 60 };
	});
}

export async function statsByTod(db: DB, userId: number, tz: string, now: Date) {
	const { sessions, clamped } = await loadAll(db, userId, now);
	const putOnByHour = Array(24).fill(0);
	for (const s of sessions) putOnByHour[zonedParts(s.startedAt, tz).hour]++;

	const minutesByHour = Array(24).fill(0);
	for (const s of clamped)
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
			minutesByHour[slice.hour] += slice.minutes;
		}
	const first = sessions[0];
	const daysObserved = first
		? Math.max(1, Math.ceil((now.getTime() - first.startedAt.getTime()) / 86_400_000))
		: 1;
	const wearingShareByHour = minutesByHour.map((m) => m / (daysObserved * 60));
	return { putOnByHour, wearingShareByHour };
}

export async function statsCalendar(db: DB, userId: number, tz: string, year: number, now: Date) {
	const { ws, clamped } = await loadAll(db, userId, now);
	const labels = new Map(ws.map((w) => [w.id, watchLabel(w)]));
	const byDay = new Map<string, Map<number, number>>(); // dayKey -> watchId -> minutes
	for (const s of clamped)
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
			if (!slice.dayKey.startsWith(`${year}-`)) continue;
			const m = byDay.get(slice.dayKey) ?? new Map<number, number>();
			m.set(s.watchId, (m.get(s.watchId) ?? 0) + slice.minutes);
			byDay.set(slice.dayKey, m);
		}
	return [...byDay.entries()].map(([dayKey, m]) => {
		const [watchId, minutes] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
		return { dayKey, watchId, label: labels.get(watchId)!, hours: minutes / 60 };
	});
}
