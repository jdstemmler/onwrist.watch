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
