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
import { localInputToUtc, toLocalInput } from '$lib/server/time';

// Shown as the banner headline when nothing is on-wrist. Picked server-side
// per page load so SSR and hydration agree. `{n}` = owned-watch count.
const EMPTY_WRIST_QUIPS = [
	'Time is currently unsupervised.',
	'Bare wrist. Bold choice.',
	'Sundial mode engaged.',
	'The rotation is idle.',
	'Power reserves quietly draining.',
	'Naked wrist detected.',
	'Lume charged, nowhere to glow.',
	'{n} watches. Zero on duty.',
	'Somewhere a second hand sweeps unobserved.',
	'Off the wrist, off the record.',
	'No watch on. The audacity.',
	'The valet tray is fully staffed.'
];

export const load: PageServerLoad = async () => {
	const db = await getDb();
	const state = await getState(db, config.homeTz);
	const quip = EMPTY_WRIST_QUIPS[Math.floor(Math.random() * EMPTY_WRIST_QUIPS.length)].replace(
		'{n}',
		String(state.watches.length)
	);
	const sessions = (
		await db
			.select({ session: wearSessions, watch: watches })
			.from(wearSessions)
			.innerJoin(watches, eq(wearSessions.watchId, watches.id))
			.orderBy(desc(wearSessions.startedAt))
			.limit(100)
	).map(({ session, watch }) => ({
			...session,
			label: watchLabel(watch),
			startedLocal: toLocalInput(session.startedAt, config.homeTz),
			endedLocal: session.endedAt ? toLocalInput(session.endedAt, config.homeTz) : ''
		}));
	const open = sessions.find((s) => s.endedAt === null);
	const stale =
		!!open && Date.now() - open.startedAt.getTime() > config.staleSessionHours * 3_600_000;
	return { state, sessions, stale, quip, allWatches: state.wearing
		? [...state.watches, { id: state.wearing.id, label: state.wearing.label }]
		: state.watches };
};

const err = (e: unknown) =>
	e instanceof StateError ? fail(409, { message: e.message }) : (() => { throw e; })();

export const actions: Actions = {
	putOn: async ({ request }) => {
		const f = await request.formData();
		try {
			await putOn(await getDb(), {
				watchId: Number(f.get('watch_id')),
				note: (f.get('note') as string) || undefined,
				source: 'web'
			});
		} catch (e) { return err(e); }
	},
	swap: async ({ request }) => {
		const f = await request.formData();
		try {
			await swap(await getDb(), {
				watchId: Number(f.get('watch_id')),
				note: (f.get('note') as string) || undefined,
				source: 'web'
			});
		} catch (e) { return err(e); }
	},
	takeOff: async ({ request }) => {
		const f = await request.formData();
		try {
			await takeOff(await getDb(), { note: (f.get('note') as string) || undefined, source: 'web' });
		} catch (e) { return err(e); }
	},
	backfill: async ({ request }) => {
		const f = await request.formData();
		try {
			await createSession(await getDb(), {
				watchId: Number(f.get('watch_id')),
				startedAt: localInputToUtc(f.get('started_at') as string, config.homeTz),
				endedAt: f.get('ended_at')
					? localInputToUtc(f.get('ended_at') as string, config.homeTz)
					: null,
				note: (f.get('note') as string) || undefined,
				source: 'backfill'
			});
		} catch (e) { return err(e); }
	},
	update: async ({ request }) => {
		const f = await request.formData();
		try {
			// Only re-derive a timestamp the user actually edited. datetime-local
			// strings are lossy during the DST fall-back hour (two distinct instants
			// format identically — see localInputToUtc in $lib/server/time), so
			// re-parsing an unchanged prefill can silently shift a session that
			// started/ended in that repeated wall-clock hour. Comparing against the
			// hidden *_orig values (the exact strings the form was prefilled with)
			// lets an unchanged field fall through to updateSession's own
			// keep-existing-value behavior instead of round-tripping through the
			// lossy string representation.
			const startedAtRaw = f.get('started_at') as string;
			const startedAtOrig = f.get('started_at_orig') as string;
			const endedAtRaw = (f.get('ended_at') as string) ?? '';
			const endedAtOrig = (f.get('ended_at_orig') as string) ?? '';
			await updateSession(await getDb(), Number(f.get('id')), {
				watchId: Number(f.get('watch_id')),
				startedAt:
					startedAtRaw === startedAtOrig
						? undefined
						: localInputToUtc(startedAtRaw, config.homeTz),
				endedAt:
					endedAtRaw === endedAtOrig
						? undefined
						: endedAtRaw
							? localInputToUtc(endedAtRaw, config.homeTz)
							: null,
				note: (f.get('note') as string) || null
			});
		} catch (e) { return err(e); }
	},
	delete: async ({ request }) => {
		const f = await request.formData();
		await deleteSession(await getDb(), Number(f.get('id')));
	}
};
