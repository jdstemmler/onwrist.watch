import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DB } from './db';
import { users, watches, wearSessions } from './db/schema';
import { createSession, getOpenSession, lockUser, putOn } from './sessions';
import { createSession as createAuthSession } from './auth';
import { sessionCookieOptions, type CookieOptions } from './flows';
import { rateLimit } from './rate-limit';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** History older than this triggers a re-anchor at demo login. */
export const DEMO_STALE_MS = 24 * HOUR;

export async function findDemoUser(db: DB): Promise<{ id: number } | null> {
	const rows = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.isDemo, true), isNull(users.disabledAt)))
		.limit(1);
	return rows[0] ?? null;
}

/** Stale = no open session (never seeded / manually closed) or the open
 * session started more than DEMO_STALE_MS ago. */
export async function isDemoHistoryStale(db: DB, userId: number, now = new Date()): Promise<boolean> {
	const open = await getOpenSession(db, userId);
	if (!open) return true;
	return now.getTime() - open.startedAt.getTime() > DEMO_STALE_MS;
}

// Deterministic PRNG so every refresh produces the same shape of history,
// just re-anchored — and so tests are reproducible.
function mulberry32(a: number) {
	return () => {
		a |= 0; a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const NOTES = [
	'dinner out', 'weekend errands', 'office day', 'date night', 'travel day',
	'gym then brunch', 'first wear after service', 'lazy Sunday'
];

/** Wipes and regenerates ~120 days of wear history for the demo account,
 * anchored at `anchor`, leaving one session open (started anchor-3h).
 * Everything runs through the domain layer inside one transaction behind
 * lockUser, so session invariants hold and concurrent refreshes serialize. */
export async function refreshDemoHistory(db: DB, userId: number, anchor = new Date()): Promise<void> {
	const rows = await db
		.select({ id: watches.id })
		.from(watches)
		.where(eq(watches.userId, userId))
		.orderBy(asc(watches.id));
	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return;

	await db.transaction(async (tx) => {
		await lockUser(tx, userId);
		await tx.delete(wearSessions).where(inArray(wearSessions.watchId, ids));

		const rand = mulberry32(7);
		const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
		// Favorites get worn more: weight by position (earlier = more worn).
		const weighted = ids.flatMap((id, i) => Array(Math.max(1, 8 - i)).fill(id) as number[]);
		const startOfDay = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);

		// Same clamp as scripts/seed.ts: generated ends must stay strictly
		// below the open session's start or early-UTC anchors 409 the putOn.
		const openStart = new Date(anchor.getTime() - 3 * HOUR);
		const capMs = openStart.getTime() - 60_000;
		const clamp = (d: Date) => new Date(Math.min(d.getTime(), capMs));

		for (let daysAgo = 120; daysAgo >= 1; daysAgo--) {
			if (rand() < 0.08) continue; // no-watch day
			const day = startOfDay(new Date(anchor.getTime() - daysAgo * DAY));
			const at = (h: number, extraMin: number) => new Date(day.getTime() + h * HOUR + extraMin * 60_000);
			const watchId = pick(weighted);
			const start = at(14, Math.floor(rand() * 90)); // ~6:30-8:00 AM Pacific in UTC
			const note = rand() < 0.15 ? pick(NOTES) : undefined;

			if (rand() < 0.12) {
				// midday swap: two back-to-back sessions
				const mid = clamp(at(20, Math.floor(rand() * 60)));
				const end = clamp(at(29, Math.floor(rand() * 90)));
				if (mid <= start) continue; // whole day would collide with the open session
				await createSession(tx, userId, { watchId, startedAt: start, endedAt: mid, note });
				if (end > mid) {
					await createSession(tx, userId, {
						watchId: pick(weighted.filter((i) => i !== watchId)),
						startedAt: mid,
						endedAt: end
					});
				}
			} else if (rand() < 0.04) {
				// overnight: worn late, off early the next morning
				const end = clamp(at(37, 0));
				if (end <= start) continue;
				await createSession(tx, userId, { watchId, startedAt: start, endedAt: end, note: note ?? 'late night' });
			} else {
				const end = clamp(at(28, Math.floor(rand() * 150)));
				if (end <= start) continue;
				await createSession(tx, userId, { watchId, startedAt: start, endedAt: end, note });
			}
		}

		// Leave the demo "currently wearing" its favorite.
		await putOn(tx, userId, { watchId: ids[0], at: openStart, source: 'web' });
	});
}

export type DemoLoginResult =
	| { ok: true; token: string; cookie: CookieOptions }
	| { ok: false; status: number; message: string };

/** Signs a visitor into the shared demo account: rate-limited per IP,
 * re-anchors stale history first (best-effort — a refresh failure logs and
 * falls through; stale data beats an error page). */
export async function demoLogin(db: DB, ip: string, now = new Date()): Promise<DemoLoginResult> {
	if (!(await rateLimit(db, 'demoIp', `demo:ip:${ip}`, now))) {
		return { ok: false, status: 429, message: 'Too many attempts — try again later' };
	}
	const demo = await findDemoUser(db);
	if (!demo) {
		return { ok: false, status: 404, message: 'This instance has no demo account' };
	}
	try {
		if (await isDemoHistoryStale(db, demo.id, now)) {
			await refreshDemoHistory(db, demo.id, now);
		}
	} catch (e) {
		console.error('[demo] history refresh failed; continuing with stale data:', e);
	}
	const token = await createAuthSession(db, demo.id, now);
	return { ok: true, token, cookie: sessionCookieOptions('member') };
}
