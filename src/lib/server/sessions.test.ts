import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users, watches, wearSessions } from './db/schema';
import {
	StateError, watchLabel, getOpenSession,
	putOn, swap, takeOff, createSession, updateSession, deleteSession
} from './sessions';

let db: DB;
let speedy: number;
let datejust: number;
const T = (s: string) => new Date(s);

beforeEach(async () => {
	db = await createTestDb();
	const [u] = await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning();
	speedy = (await db.insert(watches).values({ userId: u.id, brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' }).returning())[0].id;
	datejust = (await db.insert(watches).values({ userId: u.id, brand: 'Rolex', model: 'Datejust' }).returning())[0].id;
});

describe('watchLabel', () => {
	it('prefers nickname, falls back to brand+model', () => {
		expect(watchLabel({ nickname: 'Speedy', brand: 'Omega', model: 'Speedmaster' })).toBe('Speedy');
		expect(watchLabel({ nickname: null, brand: 'Rolex', model: 'Datejust' })).toBe('Rolex Datejust');
	});
});

describe('putOn', () => {
	it('opens a session', async () => {
		const s = await putOn(db, { watchId: speedy, at: T('2026-07-14T14:42:00Z') });
		expect(s.endedAt).toBeNull();
		expect((await getOpenSession(db))?.id).toBe(s.id);
	});

	it('rejects when already wearing', async () => {
		await putOn(db, { watchId: speedy });
		await expect(putOn(db, { watchId: datejust })).rejects.toThrow(StateError);
	});
});

describe('takeOff', () => {
	it('closes the open session and appends note', async () => {
		await putOn(db, { watchId: speedy, at: T('2026-07-14T14:42:00Z') });
		const s = await takeOff(db, { at: T('2026-07-14T22:00:00Z'), note: 'long day' });
		expect(s.endedAt).toEqual(T('2026-07-14T22:00:00Z'));
		expect(s.note).toBe('long day');
		expect(await getOpenSession(db)).toBeNull();
	});

	it('rejects when nothing is on', async () => {
		await expect(takeOff(db)).rejects.toThrow(StateError);
	});

	it('rejects taking off at or before the open session start', async () => {
		const at = T('2026-07-14T14:42:00Z');
		await putOn(db, { watchId: speedy, at });
		await expect(takeOff(db, { at })).rejects.toThrow(StateError);
		await expect(takeOff(db, { at: T('2026-07-14T14:00:00Z') })).rejects.toThrow(StateError);
	});
});

describe('swap', () => {
	it('closes current and opens new atomically at the same instant', async () => {
		await putOn(db, { watchId: speedy, at: T('2026-07-14T14:42:00Z') });
		const at = T('2026-07-14T18:00:00Z');
		const { closed, opened } = await swap(db, { watchId: datejust, at });
		expect(closed.endedAt).toEqual(at);
		expect(opened.startedAt).toEqual(at);
		expect(opened.watchId).toBe(datejust);
		expect((await getOpenSession(db))?.id).toBe(opened.id);
	});

	it('rejects when nothing is on', async () => {
		await expect(swap(db, { watchId: datejust })).rejects.toThrow(StateError);
	});

	it('rejects swapping to the same watch', async () => {
		await putOn(db, { watchId: speedy });
		await expect(swap(db, { watchId: speedy })).rejects.toThrow(StateError);
	});

	it('rejects swapping at or before the open session start', async () => {
		const at = T('2026-07-14T14:42:00Z');
		await putOn(db, { watchId: speedy, at });
		await expect(swap(db, { watchId: datejust, at })).rejects.toThrow(StateError);
		await expect(swap(db, { watchId: datejust, at: T('2026-07-14T14:00:00Z') })).rejects.toThrow(StateError);
	});
});

describe('createSession (backfill)', () => {
	beforeEach(async () => {
		// existing closed session Tue 7:42-22:00 UTC
		await createSession(db, {
			watchId: speedy,
			startedAt: T('2026-07-14T14:42:00Z'),
			endedAt: T('2026-07-14T22:00:00Z')
		});
	});

	it('accepts a non-overlapping backfill', async () => {
		const s = await createSession(db, {
			watchId: datejust,
			startedAt: T('2026-07-13T15:00:00Z'),
			endedAt: T('2026-07-13T23:00:00Z'),
			note: 'dinner with my wife'
		});
		expect(s.source).toBe('backfill');
	});

	it.each([
		['straddles start', '2026-07-14T14:00:00Z', '2026-07-14T15:00:00Z'],
		['inside', '2026-07-14T16:00:00Z', '2026-07-14T17:00:00Z'],
		['straddles end', '2026-07-14T21:00:00Z', '2026-07-14T23:00:00Z'],
		['covers', '2026-07-14T14:00:00Z', '2026-07-14T23:00:00Z']
	])('rejects overlap: %s', async (_name, start, end) => {
		await expect(
			createSession(db, { watchId: datejust, startedAt: T(start), endedAt: T(end) })
		).rejects.toThrow(StateError);
	});

	it('allows touching boundaries (end == next start)', async () => {
		const s = await createSession(db, {
			watchId: datejust,
			startedAt: T('2026-07-14T22:00:00Z'),
			endedAt: T('2026-07-14T23:00:00Z')
		});
		expect(s.id).toBeGreaterThan(0);
	});

	it('open-ended backfill rejected if an open session exists', async () => {
		await putOn(db, { watchId: datejust, at: T('2026-07-15T14:00:00Z') });
		await expect(
			createSession(db, { watchId: speedy, startedAt: T('2026-07-15T01:00:00Z') })
		).rejects.toThrow(StateError);
	});

	it('rejects end <= start', async () => {
		await expect(
			createSession(db, {
				watchId: datejust,
				startedAt: T('2026-07-13T10:00:00Z'),
				endedAt: T('2026-07-13T10:00:00Z')
			})
		).rejects.toThrow(StateError);
	});
});

describe('updateSession / deleteSession', () => {
	it('edits times and note, re-validating overlap', async () => {
		const a = await createSession(db, {
			watchId: speedy, startedAt: T('2026-07-14T14:00:00Z'), endedAt: T('2026-07-14T18:00:00Z')
		});
		const b = await createSession(db, {
			watchId: datejust, startedAt: T('2026-07-14T18:00:00Z'), endedAt: T('2026-07-14T22:00:00Z')
		});
		const edited = await updateSession(db, a.id, { endedAt: T('2026-07-14T17:00:00Z'), note: 'camping' });
		expect(edited.note).toBe('camping');
		// extending a into b must fail
		await expect(updateSession(db, a.id, { endedAt: T('2026-07-14T19:00:00Z') })).rejects.toThrow(StateError);
		// but a session doesn't conflict with itself
		expect((await updateSession(db, b.id, { startedAt: T('2026-07-14T18:30:00Z') })).id).toBe(b.id);
	});

	it('deletes a session', async () => {
		const a = await putOn(db, { watchId: speedy });
		await deleteSession(db, a.id);
		expect(await getOpenSession(db)).toBeNull();
	});

	it('rejects re-opening a closed session while another is open', async () => {
		const closed = await createSession(db, {
			watchId: speedy, startedAt: T('2026-07-14T14:00:00Z'), endedAt: T('2026-07-14T18:00:00Z')
		});
		await putOn(db, { watchId: datejust, at: T('2026-07-14T19:00:00Z') });
		await expect(updateSession(db, closed.id, { endedAt: null })).rejects.toThrow(StateError);
	});
});
