import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users, watches } from './db/schema';
import {
	StateError, watchLabel, getOpenSession,
	putOn, swap, takeOff, createSession, updateSession, deleteSession
} from './sessions';

let db: DB;
let alice: number;
let mallory: number;
let aliceSpeedy: number;
let aliceDatejust: number;
let malloryWatch: number;
const T = (s: string) => new Date(s);

beforeEach(async () => {
	db = await createTestDb();
	const [a] = await db.insert(users).values({ email: 'alice@b.com', passwordHash: 'x' }).returning();
	const [m] = await db.insert(users).values({ email: 'mallory@b.com', passwordHash: 'x' }).returning();
	alice = a.id;
	mallory = m.id;
	aliceSpeedy = (await db.insert(watches).values({ userId: alice, brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' }).returning())[0].id;
	aliceDatejust = (await db.insert(watches).values({ userId: alice, brand: 'Rolex', model: 'Datejust' }).returning())[0].id;
	malloryWatch = (await db.insert(watches).values({ userId: mallory, brand: 'Seiko', model: 'SKX007' }).returning())[0].id;
});

describe('watchLabel', () => {
	it('prefers nickname, falls back to brand+model', () => {
		expect(watchLabel({ nickname: 'Speedy', brand: 'Omega', model: 'Speedmaster' })).toBe('Speedy');
		expect(watchLabel({ nickname: null, brand: 'Rolex', model: 'Datejust' })).toBe('Rolex Datejust');
	});
});

describe('putOn', () => {
	it('opens a session', async () => {
		const s = await putOn(db, alice, { watchId: aliceSpeedy, at: T('2026-07-14T14:42:00Z') });
		expect(s.endedAt).toBeNull();
		expect((await getOpenSession(db, alice))?.id).toBe(s.id);
	});

	it('rejects when already wearing', async () => {
		await putOn(db, alice, { watchId: aliceSpeedy });
		await expect(putOn(db, alice, { watchId: aliceDatejust })).rejects.toThrow(StateError);
	});

	it('cross-tenant: putOn rejects a watch owned by another user', async () => {
		await expect(putOn(db, mallory, { watchId: aliceSpeedy })).rejects.toThrow(StateError);
	});

	it('cross-tenant: open sessions are invisible across users', async () => {
		await putOn(db, alice, { watchId: aliceSpeedy });
		expect(await getOpenSession(db, mallory)).toBeNull();
	});

	it('per-user: both users can be wearing simultaneously', async () => {
		await putOn(db, alice, { watchId: aliceSpeedy });
		const s = await putOn(db, mallory, { watchId: malloryWatch });
		expect(s.endedAt).toBeNull();
	});
});

describe('takeOff', () => {
	it('closes the open session and appends note', async () => {
		await putOn(db, alice, { watchId: aliceSpeedy, at: T('2026-07-14T14:42:00Z') });
		const s = await takeOff(db, alice, { at: T('2026-07-14T22:00:00Z'), note: 'long day' });
		expect(s.endedAt).toEqual(T('2026-07-14T22:00:00Z'));
		expect(s.note).toBe('long day');
		expect(await getOpenSession(db, alice)).toBeNull();
	});

	it('rejects when nothing is on', async () => {
		await expect(takeOff(db, alice)).rejects.toThrow(StateError);
	});

	it('rejects taking off at or before the open session start', async () => {
		const at = T('2026-07-14T14:42:00Z');
		await putOn(db, alice, { watchId: aliceSpeedy, at });
		await expect(takeOff(db, alice, { at })).rejects.toThrow(StateError);
		await expect(takeOff(db, alice, { at: T('2026-07-14T14:00:00Z') })).rejects.toThrow(StateError);
	});
});

describe('swap', () => {
	it('closes current and opens new atomically at the same instant', async () => {
		await putOn(db, alice, { watchId: aliceSpeedy, at: T('2026-07-14T14:42:00Z') });
		const at = T('2026-07-14T18:00:00Z');
		const { closed, opened } = await swap(db, alice, { watchId: aliceDatejust, at });
		expect(closed.endedAt).toEqual(at);
		expect(opened.startedAt).toEqual(at);
		expect(opened.watchId).toBe(aliceDatejust);
		expect((await getOpenSession(db, alice))?.id).toBe(opened.id);
	});

	it('rejects when nothing is on', async () => {
		await expect(swap(db, alice, { watchId: aliceDatejust })).rejects.toThrow(StateError);
	});

	it('rejects swapping to the same watch', async () => {
		await putOn(db, alice, { watchId: aliceSpeedy });
		await expect(swap(db, alice, { watchId: aliceSpeedy })).rejects.toThrow(StateError);
	});

	it('rejects swapping at or before the open session start', async () => {
		const at = T('2026-07-14T14:42:00Z');
		await putOn(db, alice, { watchId: aliceSpeedy, at });
		await expect(swap(db, alice, { watchId: aliceDatejust, at })).rejects.toThrow(StateError);
		await expect(swap(db, alice, { watchId: aliceDatejust, at: T('2026-07-14T14:00:00Z') })).rejects.toThrow(StateError);
	});
});

describe('createSession (backfill)', () => {
	beforeEach(async () => {
		// existing closed session Tue 7:42-22:00 UTC
		await createSession(db, alice, {
			watchId: aliceSpeedy,
			startedAt: T('2026-07-14T14:42:00Z'),
			endedAt: T('2026-07-14T22:00:00Z')
		});
	});

	it('accepts a non-overlapping backfill', async () => {
		const s = await createSession(db, alice, {
			watchId: aliceDatejust,
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
			createSession(db, alice, { watchId: aliceDatejust, startedAt: T(start), endedAt: T(end) })
		).rejects.toThrow(StateError);
	});

	it('allows touching boundaries (end == next start)', async () => {
		const s = await createSession(db, alice, {
			watchId: aliceDatejust,
			startedAt: T('2026-07-14T22:00:00Z'),
			endedAt: T('2026-07-14T23:00:00Z')
		});
		expect(s.id).toBeGreaterThan(0);
	});

	it('open-ended backfill rejected if an open session exists', async () => {
		await putOn(db, alice, { watchId: aliceDatejust, at: T('2026-07-15T14:00:00Z') });
		await expect(
			createSession(db, alice, { watchId: aliceSpeedy, startedAt: T('2026-07-15T01:00:00Z') })
		).rejects.toThrow(StateError);
	});

	it('rejects end <= start', async () => {
		await expect(
			createSession(db, alice, {
				watchId: aliceDatejust,
				startedAt: T('2026-07-13T10:00:00Z'),
				endedAt: T('2026-07-13T10:00:00Z')
			})
		).rejects.toThrow(StateError);
	});

	it('cross-tenant: overlap math ignores other users\' sessions', async () => {
		const s = await createSession(db, mallory, {
			watchId: malloryWatch,
			startedAt: T('2026-07-14T15:00:00Z'),
			endedAt: T('2026-07-14T16:00:00Z')
		});
		expect(s.id).toBeGreaterThan(0);
	});
});

describe('updateSession / deleteSession', () => {
	it('edits times and note, re-validating overlap', async () => {
		const a = await createSession(db, alice, {
			watchId: aliceSpeedy, startedAt: T('2026-07-14T14:00:00Z'), endedAt: T('2026-07-14T18:00:00Z')
		});
		const b = await createSession(db, alice, {
			watchId: aliceDatejust, startedAt: T('2026-07-14T18:00:00Z'), endedAt: T('2026-07-14T22:00:00Z')
		});
		const edited = await updateSession(db, alice, a.id, { endedAt: T('2026-07-14T17:00:00Z'), note: 'camping' });
		expect(edited.note).toBe('camping');
		// extending a into b must fail
		await expect(updateSession(db, alice, a.id, { endedAt: T('2026-07-14T19:00:00Z') })).rejects.toThrow(StateError);
		// but a session doesn't conflict with itself
		expect((await updateSession(db, alice, b.id, { startedAt: T('2026-07-14T18:30:00Z') })).id).toBe(b.id);
	});

	it('deletes a session', async () => {
		const a = await putOn(db, alice, { watchId: aliceSpeedy });
		await deleteSession(db, alice, a.id);
		expect(await getOpenSession(db, alice)).toBeNull();
	});

	it('rejects re-opening a closed session while another is open', async () => {
		const closed = await createSession(db, alice, {
			watchId: aliceSpeedy, startedAt: T('2026-07-14T14:00:00Z'), endedAt: T('2026-07-14T18:00:00Z')
		});
		await putOn(db, alice, { watchId: aliceDatejust, at: T('2026-07-14T19:00:00Z') });
		await expect(updateSession(db, alice, closed.id, { endedAt: null })).rejects.toThrow(StateError);
	});

	it('cross-tenant: updateSession/deleteSession cannot touch another user\'s rows', async () => {
		const s = await putOn(db, alice, { watchId: aliceSpeedy });
		await expect(updateSession(db, mallory, s.id, { note: 'pwn' })).rejects.toThrow(StateError);
		await deleteSession(db, mallory, s.id); // silently deletes nothing
		expect((await getOpenSession(db, alice))?.id).toBe(s.id);
	});
});
