import { asc } from 'drizzle-orm';
import type { DB } from './db';
import { watches, wearSessions, type Watch, type WearSession } from './db/schema';
import { watchLabel } from './sessions';
import { zonedParts } from './time';

export type HourSlice = { hour: number; dow: number; dayKey: string; minutes: number };

const HOUR = 3_600_000;

export function sliceSession(startedAt: Date, endedAt: Date, tz: string): HourSlice[] {
	const out: HourSlice[] = [];
	let cursor = startedAt.getTime();
	const end = endedAt.getTime();
	while (cursor < end) {
		const bucketEnd = Math.min(end, (Math.floor(cursor / HOUR) + 1) * HOUR);
		const p = zonedParts(new Date(cursor), tz);
		out.push({ hour: p.hour, dow: p.dow, dayKey: p.dayKey, minutes: (bucketEnd - cursor) / 60_000 });
		cursor = bucketEnd;
	}
	return out;
}

function loadAll(db: DB, now: Date) {
	const ws = db.select().from(watches).all();
	const sessions = db.select().from(wearSessions).orderBy(asc(wearSessions.startedAt)).all();
	const clamped = sessions.map((s) => ({ ...s, endedAt: s.endedAt ?? now }));
	return { ws, sessions, clamped };
}

export type WatchStats = {
	watchId: number; label: string; status: 'owned' | 'sold';
	wears: number; distinctDays: number; hours: number;
	lastWornAt: string | null; costPerWearCents: number | null;
};

export function statsByWatch(db: DB, tz: string, now: Date): WatchStats[] {
	const { ws, clamped } = loadAll(db, now);
	return ws.map((w) => {
		const mine = clamped.filter((s) => s.watchId === w.id);
		const days = new Set<string>();
		let minutes = 0;
		for (const s of mine)
			for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
				days.add(slice.dayKey);
				minutes += slice.minutes;
			}
		const lastWornAt = mine.length ? mine[mine.length - 1].startedAt.toISOString() : null;
		return {
			watchId: w.id,
			label: watchLabel(w),
			status: w.status,
			wears: mine.length,
			distinctDays: days.size,
			hours: minutes / 60,
			lastWornAt,
			costPerWearCents:
				w.pricePaidCents != null && days.size > 0 && !w.isGift
					? Math.round(w.pricePaidCents / days.size)
					: null
		};
	});
}

export function statsSummary(db: DB, tz: string, now: Date) {
	const { ws, sessions, clamped } = loadAll(db, now);
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

export function statsByDow(db: DB, tz: string, now: Date) {
	const { ws, clamped } = loadAll(db, now);
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

export function statsTodByWatch(db: DB, tz: string, now: Date) {
	const { ws, clamped } = loadAll(db, now);
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

export function statsByTod(db: DB, tz: string, now: Date) {
	const { sessions, clamped } = loadAll(db, now);
	const putOnByHour = Array(24).fill(0);
	for (const s of sessions) putOnByHour[zonedParts(s.startedAt, tz).hour]++;

	const minutesByHour = Array(24).fill(0);
	const daysSeen = new Set<string>();
	for (const s of clamped)
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
			minutesByHour[slice.hour] += slice.minutes;
			daysSeen.add(slice.dayKey);
		}
	const first = sessions[0];
	const daysObserved = first
		? Math.max(1, Math.ceil((now.getTime() - first.startedAt.getTime()) / 86_400_000))
		: 1;
	const wearingShareByHour = minutesByHour.map((m) => m / (daysObserved * 60));
	return { putOnByHour, wearingShareByHour };
}

export function statsCalendar(db: DB, tz: string, year: number, now: Date) {
	const { ws, clamped } = loadAll(db, now);
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
