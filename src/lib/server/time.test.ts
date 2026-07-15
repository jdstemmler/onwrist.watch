import { describe, it, expect } from 'vitest';
import { zonedParts, formatTime, localInputToUtc, toLocalInput } from './time';

const TZ = 'America/Los_Angeles';

describe('zonedParts', () => {
	it('converts UTC to home-tz calendar parts', () => {
		// 2026-07-14T14:42Z = 7:42 AM PDT, a Tuesday
		const p = zonedParts(new Date('2026-07-14T14:42:00Z'), TZ);
		expect(p).toEqual({
			year: 2026, month: 7, day: 14, hour: 7, minute: 42, dow: 2, dayKey: '2026-07-14'
		});
	});

	it('buckets a UTC evening into the previous local day', () => {
		// 2026-07-15T02:00Z = 7:00 PM PDT on the 14th
		const p = zonedParts(new Date('2026-07-15T02:00:00Z'), TZ);
		expect(p.dayKey).toBe('2026-07-14');
		expect(p.hour).toBe(19);
	});

	it('handles the spring-forward DST gap', () => {
		// 2026-03-08T10:00Z = 2:00 AM PST -> clocks jump to 3:00 AM PDT
		const p = zonedParts(new Date('2026-03-08T10:00:00Z'), TZ);
		expect(p.hour).toBe(3);
		expect(p.dayKey).toBe('2026-03-08');
	});
});

describe('formatTime', () => {
	it('formats 12-hour home-tz time', () => {
		expect(formatTime(new Date('2026-07-14T14:42:00Z'), TZ)).toBe('7:42 AM');
	});
});

describe('localInputToUtc / toLocalInput round-trip', () => {
	it('round-trips an ordinary wall time exactly', () => {
		const value = '2026-07-14T07:42';
		const utc = localInputToUtc(value, TZ);
		expect(utc.toISOString()).toBe('2026-07-14T14:42:00.000Z');
		expect(toLocalInput(utc, TZ)).toBe(value);
	});

	it('resolves a spring-forward gap input deterministically and stays idempotent', () => {
		// 2026-03-08T02:30 doesn't exist in America/Los_Angeles: clocks jump
		// 2:00 AM PST -> 3:00 AM PDT. localInputToUtc must still return *some*
		// deterministic instant (never throw), and re-running format/parse on
		// that instant must be a no-op.
		const gap = localInputToUtc('2026-03-08T02:30', TZ);
		expect(gap.toISOString()).toBe('2026-03-08T09:30:00.000Z');

		const roundTripped = localInputToUtc(toLocalInput(gap, TZ), TZ);
		expect(roundTripped.getTime()).toBe(gap.getTime());
	});

	it('resolves an ambiguous fall-back-hour input to a single, documented occurrence', () => {
		// 2026-11-01 01:00-2:00 AM occurs twice in America/Los_Angeles: once at
		// PDT (UTC-7) and again, an hour later in UTC, at PST (UTC-8). The
		// wall-clock string "2026-11-01T01:30" is ambiguous between them.
		// localInputToUtc must pick one occurrence deterministically rather
		// than vary run to run — documented as the earlier (pre-transition,
		// PDT) occurrence, produced by the fixpoint's iteration order.
		const ambiguous = '2026-11-01T01:30';
		const early = new Date('2026-11-01T08:30:00.000Z'); // 01:30 PDT (UTC-7)
		const late = new Date('2026-11-01T09:30:00.000Z'); // 01:30 PST (UTC-8)

		const resolved = localInputToUtc(ambiguous, TZ);
		expect(resolved.getTime()).toBe(early.getTime());

		// Both distinct instants format to the *same* string — this is the
		// root cause of the round-trip defect: you cannot tell, from the
		// string alone, which occurrence was originally meant.
		expect(toLocalInput(early, TZ)).toBe(ambiguous);
		expect(toLocalInput(late, TZ)).toBe(ambiguous);

		// Confirm the lossy direction explicitly: reparsing the formatted
		// string of the *later* occurrence resolves back to the *earlier*
		// one, not the original instant. Callers that must preserve an
		// existing ambiguous instant across an edit need to keep the
		// original Date rather than reformat-then-reparse it.
		expect(localInputToUtc(toLocalInput(late, TZ), TZ).getTime()).toBe(early.getTime());

		// But the conversion itself is stable/idempotent: once resolved,
		// repeated format -> parse round trips never drift further.
		const roundTripped = localInputToUtc(toLocalInput(resolved, TZ), TZ);
		expect(roundTripped.getTime()).toBe(resolved.getTime());
	});
});
