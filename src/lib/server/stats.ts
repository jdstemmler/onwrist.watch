import { asc, eq, getTableColumns } from 'drizzle-orm';
import type { DB } from './db';
import { watches, wearSessions, type Watch, type WearSession } from './db/schema';
import { assertWatchOwned, watchLabel } from './sessions';
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
		for (const s of mine) {
			// "Days worn" buckets by the homeTz day the wear started: an
			// evening that runs past midnight is one day worn. The calendar
			// heatmap and DOW/TOD charts still slice across midnight — that
			// is time accounting, not wear counting.
			days.add(zonedParts(s.startedAt, tz).dayKey);
			for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) minutes += slice.minutes;
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

export type WatchDetailStats = {
	putOnByHour: number[];
	wearingShareByHour: number[];
	days: { dayKey: string; hours: number }[];
	byMonth: { month: string; hours: number }[];
	longestStreakDays: number;
	currentStreakDays: number;
	longestGapDays: number;
	medianSessionMinutes: number | null;
	longestSessionMinutes: number | null;
	shareOfAllTime: number | null;
	firstWornDayKey: string | null;
	trackingSinceDayKey: string | null;
};

const DAY_MS = 86_400_000;

function keyToUtc(k: string): number {
	const [y, m, d] = k.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

export async function statsWatchDetail(
	db: DB,
	userId: number,
	watchId: number,
	tz: string,
	now: Date
): Promise<WatchDetailStats> {
	await assertWatchOwned(db, userId, watchId);
	const { clamped } = await loadAll(db, userId, now);
	const mine = clamped.filter((s) => s.watchId === watchId);

	const putOnByHour = Array(24).fill(0);
	const minutesByHour = Array(24).fill(0);
	const dayMinutes = new Map<string, number>();
	let totalMinutes = 0;
	let mineMinutes = 0;
	for (const s of clamped) {
		const isMine = s.watchId === watchId;
		if (isMine) putOnByHour[zonedParts(s.startedAt, tz).hour]++;
		for (const slice of sliceSession(s.startedAt, s.endedAt, tz)) {
			totalMinutes += slice.minutes;
			if (!isMine) continue;
			mineMinutes += slice.minutes;
			minutesByHour[slice.hour] += slice.minutes;
			dayMinutes.set(slice.dayKey, (dayMinutes.get(slice.dayKey) ?? 0) + slice.minutes);
		}
	}

	// Share of the day this watch was on the wrist, per hour, over the days
	// since its own first wear — same semantic as statsByTod's wearing share,
	// scoped to one watch.
	const daysObserved = mine.length
		? Math.max(1, Math.ceil((now.getTime() - mine[0].startedAt.getTime()) / DAY_MS))
		: 1;
	const wearingShareByHour = minutesByHour.map((m) => m / (daysObserved * 60));

	// Streaks walk the distinct local days that saw any wrist time, so a
	// midnight-crossing session keeps a streak alive on both days.
	const dayKeys = [...dayMinutes.keys()].sort();
	let longestStreakDays = 0;
	let longestGapDays = 0;
	let run = 0;
	let prev: number | null = null;
	for (const k of dayKeys) {
		const t = keyToUtc(k);
		if (prev !== null && t - prev === DAY_MS) run++;
		else {
			if (prev !== null) longestGapDays = Math.max(longestGapDays, (t - prev) / DAY_MS - 1);
			run = 1;
		}
		longestStreakDays = Math.max(longestStreakDays, run);
		prev = t;
	}
	const todayKey = zonedParts(now, tz).dayKey;
	if (prev !== null) {
		// An ongoing drought counts too — a watch untouched since spring should
		// show that, not just its worst historical gap.
		longestGapDays = Math.max(longestGapDays, Math.max(0, (keyToUtc(todayKey) - prev) / DAY_MS - 1));
	}
	const worn = new Set(dayKeys);
	// Worn today keeps the streak alive; not-yet-today falls back to yesterday
	// so a live streak doesn't read as 0 all morning.
	let cursor = worn.has(todayKey) ? keyToUtc(todayKey) : keyToUtc(todayKey) - DAY_MS;
	let currentStreakDays = 0;
	while (true) {
		const d = new Date(cursor);
		const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
		if (!worn.has(k)) break;
		currentStreakDays++;
		cursor -= DAY_MS;
	}

	const durations = mine
		.map((s) => (s.endedAt.getTime() - s.startedAt.getTime()) / 60_000)
		.sort((a, b) => a - b);
	const mid = durations.length >> 1;
	const medianSessionMinutes = durations.length
		? durations.length % 2
			? durations[mid]
			: (durations[mid - 1] + durations[mid]) / 2
		: null;
	const longestSessionMinutes = durations.length ? durations[durations.length - 1] : null;

	const monthMinutes = new Map<string, number>();
	for (const [k, m] of dayMinutes) {
		const month = k.slice(0, 7);
		monthMinutes.set(month, (monthMinutes.get(month) ?? 0) + m);
	}
	const byMonth: { month: string; hours: number }[] = [];
	if (dayKeys.length) {
		let y = Number(dayKeys[0].slice(0, 4));
		let m = Number(dayKeys[0].slice(5, 7));
		const endY = Number(todayKey.slice(0, 4));
		const endM = Number(todayKey.slice(5, 7));
		while (y < endY || (y === endY && m <= endM)) {
			const month = `${y}-${String(m).padStart(2, '0')}`;
			byMonth.push({ month, hours: (monthMinutes.get(month) ?? 0) / 60 });
			if (++m === 13) { m = 1; y++; }
		}
	}

	return {
		putOnByHour,
		wearingShareByHour,
		days: dayKeys.map((k) => ({ dayKey: k, hours: dayMinutes.get(k)! / 60 })),
		byMonth,
		longestStreakDays,
		currentStreakDays,
		longestGapDays,
		medianSessionMinutes,
		longestSessionMinutes,
		shareOfAllTime: totalMinutes > 0 ? mineMinutes / totalMinutes : null,
		firstWornDayKey: dayKeys[0] ?? null,
		// First wear of *any* watch, not just this one: the heatmap grid pins
		// its start here so the no-wear days before this watch's first wear
		// render as data, not as a missing span.
		trackingSinceDayKey: clamped.length ? zonedParts(clamped[0].startedAt, tz).dayKey : null
	};
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
