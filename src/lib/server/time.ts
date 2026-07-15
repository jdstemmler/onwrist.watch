const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type ZonedParts = {
	year: number; month: number; day: number;
	hour: number; minute: number; dow: number; dayKey: string;
};

export function zonedParts(date: Date, tz: string): ZonedParts {
	const fmt = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', weekday: 'short',
		hourCycle: 'h23'
	});
	const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
	return {
		year: +p.year, month: +p.month, day: +p.day,
		hour: +p.hour, minute: +p.minute,
		dow: DOW[p.weekday],
		dayKey: `${p.year}-${p.month}-${p.day}`
	};
}

export function formatTime(date: Date, tz: string): string {
	return new Intl.DateTimeFormat('en-US', {
		timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
	}).format(date);
}

// Formats a Date as the "YYYY-MM-DDTHH:MM" value a <input type="datetime-local">
// expects, expressed in the given IANA tz — inverse of localInputToUtc below.
// Used to prefill edit-form inputs server-side (avoids duplicating tz math in
// the browser); the round-trip through localInputToUtc is exact for
// unambiguous wall times because zonedParts is the same function driving both
// directions. During the DST fall-back hour, two different UTC instants share
// an identical formatted string (see localInputToUtc) — callers that need to
// preserve a specific ambiguous instant across an edit must pass through the
// original value unparsed rather than round-tripping it (see
// src/routes/log/+page.server.ts's `update` action).
export function toLocalInput(date: Date, tz: string): string {
	const p = zonedParts(date, tz);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// datetime-local gives "2026-07-14T07:42" in tz — convert to UTC Date.
// Two-pass fixpoint: guess = value as UTC, then correct by the observed offset
// in tz at that guess, then repeat once more so the correction itself accounts
// for any offset change (DST transition) between the first guess and the
// corrected instant.
//
// Ambiguity note: during the DST fall-back hour, a wall-clock string like
// "2026-11-01T01:30" names two distinct UTC instants (once at the pre-
// transition offset, once at the post-transition offset). This algorithm is
// deterministic but does not disambiguate by any calendar-aware rule — it
// always converges on the occurrence reachable by the fixpoint iteration
// above (in practice, the earlier / pre-transition occurrence), and repeated
// parses of the same string always produce the same instant. Because
// toLocalInput's formatted output is identical for both occurrences, the
// *other* occurrence cannot be round-tripped through
// format -> parse -> format and get back its original instant — callers that
// must preserve an existing ambiguous instant should keep the original Date
// instead of reparsing an unchanged formatted string.
//
// During the DST spring-forward gap, the named wall time doesn't exist at
// all; the algorithm still converges deterministically (to the instant whose
// local rendering is nearest the requested wall time along the same fixpoint
// path) rather than throwing.
export function localInputToUtc(value: string, tz: string): Date {
	let guess = new Date(`${value}:00Z`);
	const target = guess.getTime();
	for (let i = 0; i < 2; i++) {
		const p = zonedParts(guess, tz);
		const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
		guess = new Date(guess.getTime() + (target - wall));
	}
	return guess;
}
