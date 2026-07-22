<script lang="ts">
	import { niceTicks } from './palette';

	// months arrive continuous (zero-filled) from the domain layer, first wear
	// month through the current month, keyed 'YYYY-MM'.
	let { months }: { months: { month: string; hours: number }[] } = $props();

	const PLOT_W = 700;
	const PLOT_H = 120;
	const COL = $derived(PLOT_W / Math.max(1, months.length));
	const BAR_W = $derived(Math.max(3, Math.min(26, COL - 4)));

	const maxHours = $derived(Math.max(0, ...months.map((m) => m.hours)));
	const ticks = $derived(niceTicks(maxHours, 3));
	const niceMax = $derived(ticks[ticks.length - 1] || 1);

	const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function shortLabel(key: string): string {
		return MONTH_NAMES[Number(key.slice(5, 7)) - 1];
	}
	function yearLabel(key: string): string {
		return `’${key.slice(2, 4)}`;
	}
	// Every month fits a label up to about a year of history; beyond that only
	// Januarys (plus the first bar) keep the axis readable — tooltips carry the rest.
	const labeled = $derived.by(() => {
		const all = months.length <= 13;
		return months.map((m, i) => all || i === 0 || m.month.endsWith('-01'));
	});
	// The year mark goes on January and on the first bar — unless a labeled
	// January sits within a bar of it, which would collide at this bar pitch.
	function showYear(i: number): boolean {
		const m = months[i];
		if (m.month.endsWith('-01')) return true;
		return i === 0 && !(months[i + 1]?.month.endsWith('-01') && labeled[i + 1]);
	}

	function fmtHours(h: number) {
		return h >= 100 ? Math.round(h).toLocaleString() : (Math.round(h * 10) / 10).toString();
	}
</script>

<div class="chart-palette monthly-trend">
	<svg viewBox="0 0 {PLOT_W + 40} {PLOT_H + 34}" role="img" aria-label="Hours worn per month">
		<g transform="translate(32, 0)">
			{#each ticks as t (t)}
				<line x1="0" x2={PLOT_W} y1={PLOT_H - (t / niceMax) * PLOT_H} y2={PLOT_H - (t / niceMax) * PLOT_H} class="gridline" />
				<text x="-6" y={PLOT_H - (t / niceMax) * PLOT_H} class="ytick" text-anchor="end" dominant-baseline="middle">{t}</text>
			{/each}
			<line x1="0" x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} class="baseline" />
			{#each months as m, i (m.month)}
				{@const height = (m.hours / niceMax) * PLOT_H}
				{@const cx = (i + 0.5) * COL}
				{#if height > 0}
					<rect x={cx - BAR_W / 2} y={PLOT_H - height} width={BAR_W} height={height} rx="2" class="bar">
						<title>{shortLabel(m.month)} {m.month.slice(0, 4)} · {fmtHours(m.hours)}h</title>
					</rect>
				{/if}
				{#if labeled[i]}
					<text x={cx} y={PLOT_H + 16} class="xtick" text-anchor="middle">{shortLabel(m.month)}</text>
					{#if showYear(i)}
						<text x={cx} y={PLOT_H + 29} class="xtick" text-anchor="middle">{yearLabel(m.month)}</text>
					{/if}
				{/if}
			{/each}
		</g>
	</svg>
</div>

<style>
	/* Axis chrome (.gridline/.baseline/.ytick/.xtick) comes from app.css, keyed
	   off .chart-palette — this chart is single-series (no watch legend), but
	   shares the same axis vocabulary as the multi-series charts. */

	.monthly-trend svg {
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.bar {
		fill: var(--accent);
	}
</style>
