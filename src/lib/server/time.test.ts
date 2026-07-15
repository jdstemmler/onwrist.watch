import { describe, it, expect } from 'vitest';
import { zonedParts, formatTime } from './time';

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
