<script lang="ts">
	import { slotVar, niceTicks } from './palette';

	type Row = { hour: number; watchId: number; label: string; hours: number };

	let { rows, colorSlots }: { rows: Row[]; colorSlots: Map<number, number> } = $props();

	// stable stack + color order: ascending watch id, same as every other chart
	const series = $derived.by(() => {
		const seen = new Map<number, string>();
		for (const r of rows) if (!seen.has(r.watchId)) seen.set(r.watchId, r.label);
		return [...seen.entries()].sort((a, b) => a[0] - b[0]);
	});

	// hours[watchId][hour] -> wrist-hours
	const grid = $derived.by(() => {
		const m = new Map<number, number[]>();
		for (const [id] of series) m.set(id, Array(24).fill(0));
		for (const r of rows) m.get(r.watchId)![r.hour] += r.hours;
		return m;
	});

	const totals = $derived.by(() => {
		const t = Array(24).fill(0);
		for (const arr of grid.values()) for (let h = 0; h < 24; h++) t[h] += arr[h];
		return t;
	});
	const ticks = $derived(niceTicks(Math.max(0, ...totals), 4));
	const niceMax = $derived(ticks[ticks.length - 1] || 1);

	const PLOT_W = 700;
	const PLOT_H = 160;
	const CELL = PLOT_W / 24; // hour buckets are discrete: one flat cell each
	const x = (h: number) => h * CELL;
	const y = (v: number) => PLOT_H - (v / niceMax) * PLOT_H;

	// cumulative bands rendered as steps — each hour is a flat cell, so a
	// single worn hour is a block, not an interpolated wedge
	const bands = $derived.by(() => {
		const cum = Array(24).fill(0);
		const stepPoints = (vals: number[]) =>
			vals.flatMap((v, h) => [
				`${x(h).toFixed(1)},${y(v).toFixed(1)}`,
				`${x(h + 1).toFixed(1)},${y(v).toFixed(1)}`
			]);
		return series.map(([id, label]) => {
			const lower = [...cum];
			const arr = grid.get(id)!;
			for (let h = 0; h < 24; h++) cum[h] += arr[h];
			const upper = [...cum];
			const top = stepPoints(upper).join(' L');
			const bottom = stepPoints(lower).reverse().join(' L');
			return { id, label, d: `M${top} L${bottom} Z` };
		});
	});

	const HOUR_LABELS = new Map([
		[0, '12a'],
		[6, '6a'],
		[12, '12p'],
		[18, '6p'],
		[23, '11p']
	]);

	const fmtHour = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);
	const fmtHours = (v: number) => (Math.round(v * 10) / 10).toString();

	function hourTitle(h: number): string {
		const parts = series
			.map(([id, label]) => ({ label, v: grid.get(id)![h] }))
			.filter((p) => p.v > 0)
			.sort((a, b) => b.v - a.v)
			.map((p) => `${p.label} ${fmtHours(p.v)}h`);
		return parts.length ? `${fmtHour(h)} — ${parts.join(' · ')}` : `${fmtHour(h)} — no wear`;
	}
</script>

{#if rows.length === 0}
	<p class="muted">No wear logged yet.</p>
{:else}
	<div class="chart-palette todw-chart">
		<svg
			viewBox="0 -8 {PLOT_W + 40} {PLOT_H + 38}"
			role="img"
			aria-label="Hours on wrist by hour of day, stacked by watch"
		>
			<g transform="translate(36, 0)">
				{#each ticks as t}
					<line x1="0" x2={PLOT_W} y1={y(t)} y2={y(t)} class="gridline" />
					<text x="-8" y={y(t)} class="ytick" text-anchor="end" dominant-baseline="middle">{t}</text>
				{/each}
				{#each bands as b (b.id)}
					<path d={b.d} fill={slotVar(colorSlots.get(b.id) ?? 0)} class="band" />
				{/each}
				{#each Array.from({ length: 24 }, (_, h) => h) as h}
					<rect x={x(h)} y="0" width={CELL} height={PLOT_H} class="hit">
						<title>{hourTitle(h)}</title>
					</rect>
				{/each}
				{#each [...HOUR_LABELS] as [h, lbl]}
					<text x={x(h) + CELL / 2} y={PLOT_H + 16} class="xtick" text-anchor="middle">{lbl}</text>
				{/each}
				<line x1="0" x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} class="baseline" />
			</g>
		</svg>
		<ul class="legend">
			{#each series as [id, label] (id)}
				<li>
					<span class="swatch" style="background: {slotVar(colorSlots.get(id) ?? 0)}"></span>
					{label}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}

	/* --series-N values come from the .chart-palette rule in the stats page */
	.band {
		stroke: var(--bg-raised); /* 1px surface gap between stacked fills */
		stroke-width: 1;
	}

	.hit {
		fill: transparent;
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
		font-size: 11px;
		fill: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}

	.legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		margin: 0.5rem 0 0;
		padding: 0;
		font-size: 0.82rem;
		color: var(--fg-muted);
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
	}
</style>
