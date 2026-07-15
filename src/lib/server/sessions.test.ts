import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import { watches, wearSessions } from './db/schema';
import {
	StateError, watchLabel, getOpenSession,
	putOn, swap, takeOff, createSession, updateSession, deleteSession
} from './sessions';

let db: DB;
let speedy: number;
let datejust: number;
const T = (s: string) => new Date(s);

beforeEach(() => {
	db = createDb(':memory:');
	speedy = db.insert(watches).values({ brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy' }).returning().get().id;
	datejust = db.insert(watches).values({ brand: 'Rolex', model: 'Datejust' }).returning().get().id;
});

describe('watchLabel', () => {
	it('prefers nickname, falls back to brand+model', () => {
		expect(watchLabel({ nickname: 'Speedy', brand: 'Omega', model: 'Speedmaster' })).toBe('Speedy');
		expect(watchLabel({ nickname: null, brand: 'Rolex', model: 'Datejust' })).toBe('Rolex Datejust');
	});
});

describe('putOn', () => {
	it('opens a session', () => {
		const s = putOn(db, { watchId: speedy, at: T('2026-07-14T14:42:00Z') });
		expect(s.endedAt).toBeNull();
		expect(getOpenSession(db)?.id).toBe(s.id);
	});

	it('rejects when already wearing', () => {
		putOn(db, { watchId: speedy });
		expect(() => putOn(db, { watchId: datejust })).toThrow(StateError);
	});
});

describe('takeOff', () => {
	it('closes the open session and appends note', () => {
		putOn(db, { watchId: speedy, at: T('2026-07-14T14:42:00Z') });
		const s = takeOff(db, { at: T('2026-07-14T22:00:00Z'), note: 'long day' });
		expect(s.endedAt).toEqual(T('2026-07-14T22:00:00Z'));
		expect(s.note).toBe('long day');
		expect(getOpenSession(db)).toBeNull();
	});

	it('rejects when nothing is on', () => {
		expect(() => takeOff(db)).toThrow(StateError);
	});
});

describe('swap', () => {
	it('closes current and opens new atomically at the same instant', () => {
		putOn(db, { watchId: speedy, at: T('2026-07-14T14:42:00Z') });
		const at = T('2026-07-14T18:00:00Z');
		const { closed, opened } = swap(db, { watchId: datejust, at });
		expect(closed.endedAt).toEqual(at);
		expect(opened.startedAt).toEqual(at);
		expect(opened.watchId).toBe(datejust);
		expect(getOpenSession(db)?.id).toBe(opened.id);
	});

	it('rejects when nothing is on', () => {
		expect(() => swap(db, { watchId: datejust })).toThrow(StateError);
	});

	it('rejects swapping to the same watch', () => {
		putOn(db, { watchId: speedy });
		expect(() => swap(db, { watchId: speedy })).toThrow(StateError);
	});
});

describe('createSession (backfill)', () => {
	beforeEach(() => {
		// existing closed session Tue 7:42-22:00 UTC
		createSession(db, {
			watchId: speedy,
			startedAt: T('2026-07-14T14:42:00Z'),
			endedAt: T('2026-07-14T22:00:00Z')
		});
	});

	it('accepts a non-overlapping backfill', () => {
		const s = createSession(db, {
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
	])('rejects overlap: %s', (_name, start, end) => {
		expect(() =>
			createSession(db, { watchId: datejust, startedAt: T(start), endedAt: T(end) })
		).toThrow(StateError);
	});

	it('allows touching boundaries (end == next start)', () => {
		const s = createSession(db, {
			watchId: datejust,
			startedAt: T('2026-07-14T22:00:00Z'),
			endedAt: T('2026-07-14T23:00:00Z')
		});
		expect(s.id).toBeGreaterThan(0);
	});

	it('open-ended backfill rejected if an open session exists', () => {
		putOn(db, { watchId: datejust, at: T('2026-07-15T14:00:00Z') });
		expect(() =>
			createSession(db, { watchId: speedy, startedAt: T('2026-07-15T01:00:00Z') })
		).toThrow(StateError);
	});

	it('rejects end <= start', () => {
		expect(() =>
			createSession(db, {
				watchId: datejust,
				startedAt: T('2026-07-13T10:00:00Z'),
				endedAt: T('2026-07-13T10:00:00Z')
			})
		).toThrow(StateError);
	});
});

describe('updateSession / deleteSession', () => {
	it('edits times and note, re-validating overlap', () => {
		const a = createSession(db, {
			watchId: speedy, startedAt: T('2026-07-14T14:00:00Z'), endedAt: T('2026-07-14T18:00:00Z')
		});
		const b = createSession(db, {
			watchId: datejust, startedAt: T('2026-07-14T18:00:00Z'), endedAt: T('2026-07-14T22:00:00Z')
		});
		const edited = updateSession(db, a.id, { endedAt: T('2026-07-14T17:00:00Z'), note: 'camping' });
		expect(edited.note).toBe('camping');
		// extending a into b must fail
		expect(() => updateSession(db, a.id, { endedAt: T('2026-07-14T19:00:00Z') })).toThrow(StateError);
		// but a session doesn't conflict with itself
		expect(updateSession(db, b.id, { startedAt: T('2026-07-14T18:30:00Z') }).id).toBe(b.id);
	});

	it('deletes a session', () => {
		const a = putOn(db, { watchId: speedy });
		deleteSession(db, a.id);
		expect(getOpenSession(db)).toBeNull();
	});
});
