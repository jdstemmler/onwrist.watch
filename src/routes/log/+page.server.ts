import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { watches, wearSessions } from '$lib/server/db/schema';
import { getState } from '$lib/server/state';
import {
	StateError, createSession, deleteSession, putOn, swap, takeOff, updateSession, watchLabel
} from '$lib/server/sessions';
import { requireVerified } from '$lib/server/auth';
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

export const load: PageServerLoad = async ({ locals }) => {
	const uid = locals.user!.id;
	const homeTz = locals.user!.homeTz;
	const db = await getDb();
	const state = await getState(db, uid, homeTz);
	const quip = EMPTY_WRIST_QUIPS[Math.floor(Math.random() * EMPTY_WRIST_QUIPS.length)].replace(
		'{n}',
		String(state.watches.length)
	);
	const sessions = (
		await db
			.select({ session: wearSessions, watch: watches })
			.from(wearSessions)
			.innerJoin(watches, eq(wearSessions.watchId, watches.id))
			.where(eq(watches.userId, uid))
			.orderBy(desc(wearSessions.startedAt))
			.limit(100)
	).map(({ session, watch }) => ({
			...session,
			label: watchLabel(watch),
			startedLocal: toLocalInput(session.startedAt, homeTz),
			endedLocal: session.endedAt ? toLocalInput(session.endedAt, homeTz) : ''
		}));
	const open = sessions.find((s) => s.endedAt === null);
	const stale =
		!!open && Date.now() - open.startedAt.getTime() > locals.user!.staleSessionHours * 3_600_000;
	return { state, sessions, stale, quip, allWatches: state.wearing
		? [...state.watches, { id: state.wearing.id, label: state.wearing.label }].sort((a, b) =>
				a.label.localeCompare(b.label)
			)
		: state.watches };
};

const err = (e: unknown) =>
	e instanceof StateError ? fail(e.status, { message: e.message }) : (() => { throw e; })();

// Server-side guard for datetime-local values: the browser's `required` is
// the only client-side check, so a missing/garbage string would otherwise
// ride localInputToUtc into an Invalid Date and blow up in the driver as a
// 500. Bad input is a plain 400 instead.
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
function parseLocalOrThrow(raw: FormDataEntryValue | null, homeTz: string): Date {
	if (typeof raw !== 'string' || !DATETIME_LOCAL.test(raw)) {
		throw new StateError('Enter a valid date and time', 400);
	}
	const d = localInputToUtc(raw, homeTz);
	if (Number.isNaN(d.getTime())) throw new StateError('Enter a valid date and time', 400);
	return d;
}

export const actions: Actions = {
	putOn: async ({ request, locals }) => {
		const f = await request.formData();
		try {
			requireVerified(locals.user!);
			await putOn(await getDb(), locals.user!.id, {
				watchId: Number(f.get('watch_id')),
				note: (f.get('note') as string) || undefined,
				source: 'web'
			});
		} catch (e) { return err(e); }
	},
	swap: async ({ request, locals }) => {
		const f = await request.formData();
		try {
			requireVerified(locals.user!);
			await swap(await getDb(), locals.user!.id, {
				watchId: Number(f.get('watch_id')),
				note: (f.get('note') as string) || undefined,
				source: 'web'
			});
		} catch (e) { return err(e); }
	},
	takeOff: async ({ request, locals }) => {
		const f = await request.formData();
		try {
			requireVerified(locals.user!);
			await takeOff(await getDb(), locals.user!.id, { note: (f.get('note') as string) || undefined, source: 'web' });
		} catch (e) { return err(e); }
	},
	backfill: async ({ request, locals }) => {
		const f = await request.formData();
		const homeTz = locals.user!.homeTz;
		try {
			requireVerified(locals.user!);
			await createSession(await getDb(), locals.user!.id, {
				watchId: Number(f.get('watch_id')),
				startedAt: parseLocalOrThrow(f.get('started_at'), homeTz),
				endedAt: f.get('ended_at') ? parseLocalOrThrow(f.get('ended_at'), homeTz) : null,
				note: (f.get('note') as string) || undefined,
				source: 'backfill'
			});
		} catch (e) { return err(e); }
	},
	update: async ({ request, locals }) => {
		const f = await request.formData();
		const homeTz = locals.user!.homeTz;
		try {
			requireVerified(locals.user!);
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
			await updateSession(await getDb(), locals.user!.id, Number(f.get('id')), {
				watchId: Number(f.get('watch_id')),
				startedAt:
					startedAtRaw === startedAtOrig
						? undefined
						: parseLocalOrThrow(startedAtRaw, homeTz),
				endedAt:
					endedAtRaw === endedAtOrig
						? undefined
						: endedAtRaw
							? parseLocalOrThrow(endedAtRaw, homeTz)
							: null,
				note: (f.get('note') as string) || null
			});
		} catch (e) { return err(e); }
	},
	delete: async ({ request, locals }) => {
		const f = await request.formData();
		try {
			requireVerified(locals.user!);
			await deleteSession(await getDb(), locals.user!.id, Number(f.get('id')));
		} catch (e) { return err(e); }
	}
};
