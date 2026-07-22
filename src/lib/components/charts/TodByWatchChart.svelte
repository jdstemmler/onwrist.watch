<script lang="ts">
	import { slotVar, stackOrder, niceTicks, OTHER_SLOT, OTHER_ID, OTHER_LABEL } from './palette';

	type Row = { hour: number; watchId: number; label: string; hours: number };

	let { rows, colorSlots }: { rows: Row[]; colorSlots: Map<number, number> } = $props();

	// Watches outside the top 11 pool into one summed neutral "Other" series,
	// stacked last; the top 11 keep their id-ordered stack + hue.
	const pooled = (watchId: number) => colorSlots.get(watchId) === OTHER_SLOT;
	const colorOf = (watchId: number) =>
		slotVar(watchId === OTHER_ID ? OTHER_SLOT : (colorSlots.get(watchId) ?? 0));
	const seriesId = (watchId: number) => (pooled(watchId) ? OTHER_ID : watchId);

	const series = $derived.by(() => {
		const seen = new Map<number, string>();
		for (const r of rows) {
			const key = seriesId(r.watchId);
			if (!seen.has(key)) seen.set(key, pooled(r.watchId) ? OTHER_LABEL : r.label);
		}
		return [...seen.entries()].sort((a, b) => stackOrder({ watchId: a[0] }, { watchId: b[0] }));
	});

	// hours[seriesId][hour] -> wrist-hours (pooled watches summed under OTHER_ID)
	const grid = $derived.by(() => {
		const m = new Map<number, number[]>();
		for (const [id] of series) m.set(id, Array(24).fill(0));
		for (const r of rows) m.get(seriesId(r.watchId))![r.hour] += r.hours;
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
					<path d={b.d} fill={colorOf(b.id)} class="band" />
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
					<span class="swatch" style="background: {colorOf(id)}"></span>
					{label}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	/* --series-N values, and axis/legend chrome (.gridline/.baseline/.ytick/
	   .xtick/.legend/.swatch), come from app.css, keyed off .chart-palette. */

	svg {
		width: 100%;
		height: auto;
		display: block;
	}

	.band {
		stroke: var(--bg-raised); /* 1px surface gap between stacked fills */
		stroke-width: 1;
	}

	.hit {
		fill: transparent;
	}
</style>
