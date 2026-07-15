<script lang="ts">
	import { slotVar } from './palette';

	type Cell = { dayKey: string; watchId: number; label: string; hours: number };

	let { calendar, year, colorSlots }: { calendar: Cell[]; year: number; colorSlots: Map<number, number> } = $props();

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function pad(n: number) {
		return String(n).padStart(2, '0');
	}

	type Day = { dayKey: string; dow: number; col: number; month: number; date: number };

	const days = $derived.by((): Day[] => {
		const out: Day[] = [];
		const start = Date.UTC(year, 0, 1);
		const end = Date.UTC(year, 11, 31);
		const firstDow = new Date(start).getUTCDay();
		let idx = 0;
		for (let t = start; t <= end; t += 86_400_000) {
			const d = new Date(t);
			out.push({
				dayKey: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
				dow: d.getUTCDay(),
				col: Math.floor((idx + firstDow) / 7),
				month: d.getUTCMonth(),
				date: d.getUTCDate()
			});
			idx++;
		}
		return out;
	});

	const byDayKey = $derived(new Map(calendar.map((c) => [c.dayKey, c])));
	const colCount = $derived(Math.max(1, ...days.map((d) => d.col)) + 1);

	const monthLabels = $derived.by(() => {
		const seen = new Set<number>();
		const out: { col: number; label: string }[] = [];
		for (const d of days) {
			if (d.date === 1 && !seen.has(d.month)) {
				seen.add(d.month);
				out.push({ col: d.col, label: MONTHS[d.month] });
			}
		}
		return out;
	});

	const legend = $derived.by(() => {
		const seen = new Map<number, string>();
		for (const c of calendar) if (!seen.has(c.watchId)) seen.set(c.watchId, c.label);
		return [...seen.entries()].sort((a, b) => a[0] - b[0]);
	});

	const CELL = 12;
	const GAP = 2;
	const STEP = CELL + GAP;
	const LEFT_PAD = 24;
	const TOP_PAD = 16;

	function fmtHours(h: number) {
		return (Math.round(h * 10) / 10).toString();
	}
</script>

<div class="chart-palette calendar-heatmap">
	<div class="year-nav">
		<a href="?year={year - 1}">&larr; {year - 1}</a>
		<span class="year num">{year}</span>
		<a href="?year={year + 1}">{year + 1} &rarr;</a>
	</div>

	<div class="grid-scroll">
		<svg
			viewBox="0 0 {LEFT_PAD + colCount * STEP} {TOP_PAD + 7 * STEP}"
			role="img"
			aria-label="Calendar heatmap of {year}, colored by the watch worn most that day"
		>
			{#each monthLabels as m}
				<text x={LEFT_PAD + m.col * STEP} y={TOP_PAD - 5} class="month">{m.label}</text>
			{/each}
			<text x="0" y={TOP_PAD + 1 * STEP + CELL - 2} class="dow">M</text>
			<text x="0" y={TOP_PAD + 3 * STEP + CELL - 2} class="dow">W</text>
			<text x="0" y={TOP_PAD + 5 * STEP + CELL - 2} class="dow">F</text>
			{#each days as d (d.dayKey)}
				{@const cell = byDayKey.get(d.dayKey)}
				<rect
					x={LEFT_PAD + d.col * STEP}
					y={TOP_PAD + d.dow * STEP}
					width={CELL}
					height={CELL}
					rx="2"
					class="cell"
					class:empty={!cell}
					fill={cell ? slotVar(colorSlots.get(cell.watchId) ?? 0) : undefined}
				>
					<title>{d.dayKey} · {cell ? `${cell.label} · ${fmtHours(cell.hours)}h` : 'no wear'}</title>
				</rect>
			{/each}
		</svg>
	</div>

	{#if legend.length > 0}
		<ul class="legend">
			{#each legend as [watchId, label] (watchId)}
				<li>
					<span class="swatch" style="background: {slotVar(colorSlots.get(watchId) ?? 0)}"></span>
					{label}
				</li>
			{/each}
			<li><span class="swatch empty-swatch"></span> No wear</li>
		</ul>
	{/if}
</div>

<style>
	.chart-palette {
		--series-1: #2a78d6;
		--series-2: #008300;
		--series-3: #e87ba4;
		--series-4: #eda100;
		--series-5: #1baf7a;
		--series-6: #eb6834;
		--series-7: #4a3aa7;
		--series-8: #e34948;
	}
	@media (prefers-color-scheme: dark) {
		:root:where(:not([data-theme='light'])) .chart-palette {
			--series-1: #3987e5;
			--series-2: #008300;
			--series-3: #d55181;
			--series-4: #c98500;
			--series-5: #199e70;
			--series-6: #d95926;
			--series-7: #9085e9;
			--series-8: #e66767;
		}
	}
	:root[data-theme='dark'] .chart-palette {
		--series-1: #3987e5;
		--series-2: #008300;
		--series-3: #d55181;
		--series-4: #c98500;
		--series-5: #199e70;
		--series-6: #d95926;
		--series-7: #9085e9;
		--series-8: #e66767;
	}

	.year-nav {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}
	.year-nav a {
		text-decoration: none;
	}
	.year-nav a:hover {
		text-decoration: underline;
	}
	.year {
		font-weight: 600;
		color: var(--fg);
	}
	.grid-scroll {
		overflow-x: auto;
	}
	svg {
		display: block;
		min-width: 40rem;
	}
	.month,
	.dow {
		font-size: 9px;
		fill: var(--fg-muted);
	}
	.cell {
		stroke: var(--bg-raised);
		stroke-width: 1;
	}
	.cell.empty {
		fill: color-mix(in srgb, var(--border) 60%, transparent);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		list-style: none;
		margin: 0.6rem 0 0;
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
	.empty-swatch {
		background: color-mix(in srgb, var(--border) 60%, transparent);
	}
</style>
