<script lang="ts">
	import { slotVar, niceTicks } from './palette';

	type Row = { dow: number; watchId: number; label: string; hours: number };

	let { rows, colorSlots }: { rows: Row[]; colorSlots: Map<number, number> } = $props();

	const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	const byDow = $derived.by(() => {
		const m: Row[][] = Array.from({ length: 7 }, () => []);
		for (const r of rows) m[r.dow].push(r);
		for (const arr of m) arr.sort((a, b) => a.watchId - b.watchId);
		return m;
	});
	const totals = $derived(byDow.map((day) => day.reduce((s, r) => s + r.hours, 0)));
	const maxTotal = $derived(Math.max(0, ...totals));
	const ticks = $derived(niceTicks(maxTotal, 4));
	const niceMax = $derived(ticks[ticks.length - 1] || 1);

	const PLOT_H = 160;
	const PLOT_W = 700;
	const COL = PLOT_W / 7;
	const BAR_W = 26;

	type Seg = { watchId: number; label: string; hours: number; y: number; height: number };

	function segmentsFor(day: Row[]): Seg[] {
		const n = day.length;
		let cum = 0;
		return day.map((seg, i) => {
			const hPx = (seg.hours / niceMax) * PLOT_H;
			const yTopRaw = PLOT_H - cum - hPx;
			const yBottomRaw = PLOT_H - cum;
			cum += hPx;
			const yTop = yTopRaw + (i < n - 1 ? 1 : 0);
			const yBottom = yBottomRaw - (i > 0 ? 1 : 0);
			return { watchId: seg.watchId, label: seg.label, hours: seg.hours, y: yTop, height: Math.max(0, yBottom - yTop) };
		});
	}

	const legend = $derived.by(() => {
		const seen = new Map<number, string>();
		for (const r of rows) if (!seen.has(r.watchId)) seen.set(r.watchId, r.label);
		return [...seen.entries()].sort((a, b) => a[0] - b[0]);
	});

	function fmtHours(h: number) {
		return (Math.round(h * 10) / 10).toString();
	}
</script>

<div class="chart-palette dow-chart">
	<svg viewBox="0 0 {PLOT_W + 40} {PLOT_H + 30}" role="img" aria-label="Hours worn by day of week, stacked by watch">
		<g transform="translate(36, 0)">
			{#each ticks as t}
				<line x1="0" x2={PLOT_W} y1={PLOT_H - (t / niceMax) * PLOT_H} y2={PLOT_H - (t / niceMax) * PLOT_H} class="gridline" />
				<text x="-8" y={PLOT_H - (t / niceMax) * PLOT_H} class="ytick" text-anchor="end" dominant-baseline="middle">{t}</text>
			{/each}
			<line x1="0" x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} class="baseline" />
			{#each byDow as day, i}
				{@const segs = segmentsFor(day)}
				{@const cx = (i + 0.5) * COL}
				{#each segs as seg (seg.watchId)}
					{#if seg.height > 0}
						<rect
							x={cx - BAR_W / 2}
							y={seg.y}
							width={BAR_W}
							height={seg.height}
							rx="2"
							fill={slotVar(colorSlots.get(seg.watchId) ?? 0)}
						>
							<title>{DOW_NAMES[i]} · {seg.label} · {fmtHours(seg.hours)}h</title>
						</rect>
					{/if}
				{/each}
				<text x={cx} y={PLOT_H + 18} class="xtick" text-anchor="middle">{DOW_LABELS[i]}</text>
			{/each}
		</g>
	</svg>
	{#if legend.length > 1}
		<ul class="legend">
			{#each legend as [watchId, label] (watchId)}
				<li>
					<span class="swatch" style="background: {slotVar(colorSlots.get(watchId) ?? 0)}"></span>
					{label}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* dataviz palette — --series-N custom properties are declared once in
	   src/routes/stats/+page.svelte; this component only references var(--series-N)
	   via slotVar(). */

	.dow-chart svg {
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.gridline {
		stroke: var(--border);
		stroke-width: 1;
	}
	.baseline {
		stroke: var(--fg-muted);
		stroke-width: 1;
	}
	.ytick,
	.xtick {
		fill: var(--fg-muted);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--fg-muted);
	}
	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
	}
</style>
