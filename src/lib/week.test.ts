import { describe, it, expect } from 'vitest';
import { WEEK, weekIndex, DOW_NAMES, DOW_SHORT, DOW_INITIAL } from './week';

describe('week', () => {
	it('orders the display week Monday through Sunday', () => {
		expect([...WEEK]).toEqual([1, 2, 3, 4, 5, 6, 0]);
		expect(WEEK.map((d) => DOW_NAMES[d])).toEqual([
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday',
			'Sunday'
		]);
	});

	it('maps every raw dow to its screen row, and back', () => {
		// Sunday is last, not first — the whole point of the module.
		expect(weekIndex(1)).toBe(0);
		expect(weekIndex(0)).toBe(6);
		// WEEK and weekIndex are two views of one order: walking WEEK must land
		// each dow at exactly the row weekIndex claims. The calendar heatmap
		// derives its column breaks from weekIndex while every other chart walks
		// WEEK, so a drift between them would silently misalign the grid.
		WEEK.forEach((dow, row) => expect(weekIndex(dow)).toBe(row));
	});

	it('keeps the label arrays indexed by raw dow, not by screen position', () => {
		// The arrays are shared by charts that index them either way; if these
		// ever get pre-rotated to Monday-first, every tooltip shifts by one day.
		expect(DOW_NAMES[0]).toBe('Sunday');
		expect(DOW_SHORT[0]).toBe('Sun');
		expect(DOW_INITIAL[0]).toBe('S');
		expect(DOW_NAMES).toHaveLength(7);
		expect(DOW_SHORT).toHaveLength(7);
		expect(DOW_INITIAL).toHaveLength(7);
	});
});
