<script lang="ts">
	import { WEEK, DOW_NAMES, DOW_SHORT } from '$lib/week';

	// Wrist occupancy as a weekday × hour grid. This is the two-dimensional form
	// of the old "wearing share" curve: that curve was the column marginal of
	// this grid, and also a straight rescale of TodByWatchChart's stack total —
	// three charts saying one thing. The grid keeps the interaction the curve
	// threw away (a 9 AM that is Monday-only, a Saturday that starts at noon).
	let {
		shares,
		hours,
		weekdayCounts
	}: { shares: number[][]; hours: number[][]; weekdayCounts: number[] } = $props();

	const HOURS = Array.from({ length: 24 }, (_, h) => h);
	// Same tick hours as the two hour-axis charts on this page (TodChart,
	// TodByWatchChart) — three plots reading the same clock should mark it in
	// the same places.
	const HOUR_LABELS = new Map([
		[0, '12a'],
		[6, '6a'],
		[12, '12p'],
		[18, '6p'],
		[23, '11p']
	]);

	// Fixed 0–100% bins, never quantiles of the data: the cell value is already a
	// share, so absolute bins let a Tuesday 8 AM be compared to a Saturday
	// midnight — and keep the reading stable as more weeks are logged.
	const BINS = [0.2, 0.4, 0.6, 0.8];
	function level(share: number): number {
		if (share <= 0) return 0;
		const i = BINS.findIndex((upper) => share <= upper);
		return i === -1 ? BINS.length + 1 : i + 1;
	}

	const fmtHour = (h: number) =>
		h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
	const fmtHours = (v: number) => (Math.round(v * 10) / 10).toString();

	function cellTitle(dow: number, h: number): string {
		const share = shares[dow][h];
		const when = `${DOW_NAMES[dow]} ${fmtHour(h)}`;
		if (share <= 0) return `${when} — never on the wrist`;
		const n = weekdayCounts[dow];
		return `${when} — on the wrist ${Math.round(share * 100)}% of the time (${fmtHours(hours[dow][h])}h across ${n} ${DOW_NAMES[dow]}${n === 1 ? '' : 's'})`;
	}
</script>

<div class="chart-palette dowtod">
	<div
		class="grid"
		role="img"
		aria-label="Share of time a watch is on the wrist, by weekday (rows, Monday to Sunday) and hour of day (columns)"
	>
		{#each WEEK as dow (dow)}
			<span class="row-label">{DOW_SHORT[dow]}</span>
			{#each HOURS as h (h)}
				<span class="cell lvl-{level(shares[dow][h])}" title={cellTitle(dow, h)}></span>
			{/each}
		{/each}
		<span class="row-label"></span>
		{#each HOURS as h (h)}
			<span class="hour-label">{HOUR_LABELS.get(h) ?? ''}</span>
		{/each}
	</div>

	<ul class="legend">
		<li class="ramp">
			Share of that weekday
			<span class="scale-end">0%</span>
			{#each [1, 2, 3, 4, 5] as l (l)}
				<span class="swatch lvl-{l}"></span>
			{/each}
			<span class="scale-end">100%</span>
		</li>
		<li><span class="swatch lvl-0"></span> Never worn</li>
	</ul>
</div>

<style>
	/* Sequential encoding, so one hue light→dark rather than the categorical
	   --series-N scale: a cell means "how much", not "which watch". Same accent
	   ramp as CalendarHeatmap's intensity mode, so the two heatmaps in this app
	   read on the same visual scale. color-mix against --bg-raised flips the
	   ramp's anchor for free in dark mode (dark surface, light accent), which is
	   what a sequential scale needs there. Legend chrome (.legend/.swatch) comes
	   from app.css, keyed off .chart-palette. */

	/* HTML grid rather than an SVG (the other charts here are SVG): the row
	   labels have to stay legible at phone width, and text inside a
	   width:100% viewBox scales down with the plot. */
	/* minmax(0, 1fr), not 1fr: a bare 1fr floors each track at its content's
	   intrinsic width, so the five columns carrying an hour label ("12a", "6a",
	   …) would grow wider than the other nineteen and shove the grid past the
	   card. The labels are meant to overflow their column, not size it. */
	.grid {
		display: grid;
		grid-template-columns: 2.25rem repeat(24, minmax(0, 1fr));
		gap: 2px;
		align-items: center;
	}
	.cell {
		aspect-ratio: 1.25;
		border-radius: 2px;
		min-height: 8px;
	}
	.row-label,
	.hour-label {
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.row-label {
		padding-right: 0.35rem;
		text-align: right;
	}
	/* Labels are sparse (4 of 24 columns), so letting one bleed over its empty
	   neighbours is what keeps it readable in a ~13px column on a phone. */
	.hour-label {
		text-align: center;
		padding-top: 0.15rem;
		overflow: visible;
	}

	.ramp {
		gap: 0.3rem;
	}
	.scale-end {
		font-variant-numeric: tabular-nums;
	}

	/* "Never worn" has to sit off the ramp, not at the bottom of it, or a dead
	   3 AM reads as a rare-but-real 3 AM. The ramp starts at a 30% accent mix
	   and this neutral lands past its light end (light theme) / dark end (dark
	   theme) — the mix flips with the surface, so one declaration covers both. */
	.lvl-0 {
		background: color-mix(in srgb, var(--border) 45%, transparent);
	}
	.lvl-1 {
		background: color-mix(in srgb, var(--accent) 30%, var(--bg-raised));
	}
	.lvl-2 {
		background: color-mix(in srgb, var(--accent) 48%, var(--bg-raised));
	}
	.lvl-3 {
		background: color-mix(in srgb, var(--accent) 64%, var(--bg-raised));
	}
	.lvl-4 {
		background: color-mix(in srgb, var(--accent) 82%, var(--bg-raised));
	}
	.lvl-5 {
		background: var(--accent);
	}
</style>
