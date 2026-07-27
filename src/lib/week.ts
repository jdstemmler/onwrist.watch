// Weekday presentation, in one place. Every chart that lays out a week renders
// it Monday-first — imported from here rather than re-declared per component,
// so the app can't drift into two different weeks.
//
// The *data* keeps the calendar-standard day-of-week number (0 = Sunday,
// matching `Date#getDay` and `zonedParts` in src/lib/server/time.ts). That
// number is what `statsByDow`/`statsDowTod` index by and what the tests assert
// on; Monday-first is a rendering choice, applied at the edge. So every array
// here is indexed by the raw dow — never by the position it occupies on screen
// — and `WEEK` supplies the order to walk them in.

/** Raw dow values in display order: Monday → Sunday. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/** Screen position of a raw dow in the Monday-first week: Mon → 0, Sun → 6. */
export function weekIndex(dow: number): number {
	return (dow + 6) % 7;
}

/** Indexed by raw dow (0 = Sunday), not by screen position. */
export const DOW_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday'
];

/** Indexed by raw dow. For row labels with room for three characters. */
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Indexed by raw dow. For tick labels one character wide — ambiguous on its
 * own (two S's, two T's), so only use it where order or a tooltip resolves it. */
export const DOW_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
