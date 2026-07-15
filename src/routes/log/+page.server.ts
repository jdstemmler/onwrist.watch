import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';
import { watches, wearSessions } from '$lib/server/db/schema';
import { getState } from '$lib/server/state';
import {
	StateError, createSession, deleteSession, putOn, swap, takeOff, updateSession, watchLabel
} from '$lib/server/sessions';
import { zonedParts } from '$lib/server/time';

// Formats a Date as the "YYYY-MM-DDTHH:MM" value a <input type="datetime-local">
// expects, expressed in the given IANA tz — inverse of localInputToUtc below.
// Used only to prefill edit-form inputs server-side (avoids duplicating tz
// math in the browser); the round-trip through localInputToUtc is exact
// because zonedParts is the same function driving both directions.
function toLocalInput(date: Date, tz: string): string {
	const p = zonedParts(date, tz);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export const load: PageServerLoad = async () => {
	const db = getDb();
	const state = getState(db, config.homeTz);
	const sessions = db
		.select({ session: wearSessions, watch: watches })
		.from(wearSessions)
		.innerJoin(watches, eq(wearSessions.watchId, watches.id))
		.orderBy(desc(wearSessions.startedAt))
		.limit(100)
		.all()
		.map(({ session, watch }) => ({
			...session,
			label: watchLabel(watch),
			startedLocal: toLocalInput(session.startedAt, config.homeTz),
			endedLocal: session.endedAt ? toLocalInput(session.endedAt, config.homeTz) : ''
		}));
	const open = sessions.find((s) => s.endedAt === null);
	const stale =
		!!open && Date.now() - open.startedAt.getTime() > config.staleSessionHours * 3_600_000;
	return { state, sessions, stale, allWatches: state.wearing
		? [...state.watches, { id: state.wearing.id, label: state.wearing.label }]
		: state.watches };
};

// datetime-local gives "2026-07-14T07:42" in HOME_TZ — convert to UTC Date.
// Trick: format a probe date's tz offset via Intl, or require the server run with TZ=HOME_TZ.
// Simplest robust approach: new Date(`${value}:00${offsetForTz(value, config.homeTz)}`).
function localInputToUtc(value: string): Date {
	// value: YYYY-MM-DDTHH:MM interpreted in config.homeTz.
	// Find the UTC instant whose zonedParts match the requested wall time (two-pass fixpoint
	// handles DST): guess = value as UTC, then correct by the observed offset.
	let guess = new Date(`${value}:00Z`);
	for (let i = 0; i < 2; i++) {
		const p = zonedParts(guess, config.homeTz);
		const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
		guess = new Date(guess.getTime() + (new Date(`${value}:00Z`).getTime() - wall));
	}
	return guess;
}

const err = (e: unknown) =>
	e instanceof StateError ? fail(409, { message: e.message }) : (() => { throw e; })();

export const actions: Actions = {
	putOn: async ({ request }) => {
		const f = await request.formData();
		try {
			putOn(getDb(), {
				watchId: Number(f.get('watch_id')),
				note: (f.get('note') as string) || undefined,
				source: 'web'
			});
		} catch (e) { return err(e); }
	},
	swap: async ({ request }) => {
		const f = await request.formData();
		try {
			swap(getDb(), {
				watchId: Number(f.get('watch_id')),
				note: (f.get('note') as string) || undefined,
				source: 'web'
			});
		} catch (e) { return err(e); }
	},
	takeOff: async ({ request }) => {
		const f = await request.formData();
		try {
			takeOff(getDb(), { note: (f.get('note') as string) || undefined, source: 'web' });
		} catch (e) { return err(e); }
	},
	backfill: async ({ request }) => {
		const f = await request.formData();
		try {
			createSession(getDb(), {
				watchId: Number(f.get('watch_id')),
				startedAt: localInputToUtc(f.get('started_at') as string),
				endedAt: f.get('ended_at') ? localInputToUtc(f.get('ended_at') as string) : null,
				note: (f.get('note') as string) || undefined,
				source: 'backfill'
			});
		} catch (e) { return err(e); }
	},
	update: async ({ request }) => {
		const f = await request.formData();
		try {
			updateSession(getDb(), Number(f.get('id')), {
				watchId: Number(f.get('watch_id')),
				startedAt: localInputToUtc(f.get('started_at') as string),
				endedAt: f.get('ended_at') ? localInputToUtc(f.get('ended_at') as string) : null,
				note: (f.get('note') as string) || null
			});
		} catch (e) { return err(e); }
	},
	delete: async ({ request }) => {
		const f = await request.formData();
		deleteSession(getDb(), Number(f.get('id')));
	}
};
