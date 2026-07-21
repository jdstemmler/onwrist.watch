<script lang="ts">
	import { slotVar } from './palette';

	type Cell = { dayKey: string; watchId: number; label: string; hours: number };

	// 'dominant' (default): each day colored by the watch worn most, categorical
	// palette + watch legend — the /stats view. 'intensity': all cells are one
	// watch; a sequential accent ramp encodes hours worn — the per-watch view.
	let { calendar, year, firstDayKey, todayKey, colorSlots = new Map(), mode = 'dominant' }: {
		calendar: Cell[];
		year: number;
		firstDayKey: string | null;
		todayKey: string;
		colorSlots?: Map<number, number>;
		mode?: 'dominant' | 'intensity';
	} = $props();

	const maxHours = $derived(Math.max(1, ...calendar.map((c) => c.hours)));
	function level(hours: number): number {
		return Math.min(4, Math.max(1, Math.ceil((hours / maxHours) * 4)));
	}

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function pad(n: number) {
		return String(n).padStart(2, '0');
	}

	type Day = { dayKey: string; dow: number; col: number; month: number; date: number };

	function keyToUtc(k: string): number {
		const [y, m, d] = k.split('-').map(Number);
		return Date.UTC(y, m - 1, d);
	}

	const days = $derived.by((): Day[] => {
		const out: Day[] = [];
		// Grid runs first-session → today, clamped to the displayed year —
		// no empty months before any logged data, no future months.
		const start = Math.max(Date.UTC(year, 0, 1), firstDayKey ? keyToUtc(firstDayKey) : -Infinity);
		const end = Math.min(Date.UTC(year, 11, 31), keyToUtc(todayKey));
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
			if (!seen.has(d.month)) {
				seen.add(d.month);
				// A clamped start can put two month starts in adjacent columns
				// (partial first month); the labels would overlap at one column
				// of spacing, so keep only the later one.
				if (out.length && d.col - out[out.length - 1].col < 2) out.pop();
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
		{#if firstDayKey && year > Number(firstDayKey.slice(0, 4))}
			<a href="?year={year - 1}">&larr; {year - 1}</a>
		{:else}
			<span class="nav-spacer"></span>
		{/if}
		<span class="year num">{year}</span>
		{#if year < Number(todayKey.slice(0, 4))}
			<a href="?year={year + 1}">{year + 1} &rarr;</a>
		{:else}
			<span class="nav-spacer"></span>
		{/if}
	</div>

	<div class="grid-scroll">
		<svg
			width={LEFT_PAD + colCount * STEP}
			height={TOP_PAD + 7 * STEP}
			viewBox="0 0 {LEFT_PAD + colCount * STEP} {TOP_PAD + 7 * STEP}"
			role="img"
			aria-label="Calendar heatmap, {days[0]?.dayKey ?? year} through {days.at(-1)?.dayKey ??
				year}, {mode === 'intensity'
				? 'shaded by hours worn that day'
				: 'colored by the watch worn most that day'}"
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
					class="cell {cell && mode === 'intensity' ? `lvl-${level(cell.hours)}` : ''}"
					class:empty={!cell}
					fill={cell && mode === 'dominant' ? slotVar(colorSlots.get(cell.watchId) ?? 0) : undefined}
				>
					<title
						>{d.dayKey} · {cell
							? mode === 'intensity'
								? `${fmtHours(cell.hours)}h`
								: `${cell.label} · ${fmtHours(cell.hours)}h`
							: 'no wear'}</title
					>
				</rect>
			{/each}
		</svg>
	</div>

	{#if mode === 'intensity'}
		{#if calendar.length > 0}
			<ul class="legend">
				<li class="ramp">
					Less
					{#each [1, 2, 3, 4] as l (l)}
						<span class="swatch lvl-{l}"></span>
					{/each}
					More
				</li>
				<li><span class="swatch empty-swatch"></span> No wear</li>
			</ul>
		{/if}
	{:else if legend.length > 0}
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
	/* dataviz palette — --series-N custom properties are declared once in
	   src/routes/stats/+page.svelte; this component only references var(--series-N)
	   via slotVar(). */

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
	.nav-spacer {
		min-width: 3.5rem;
	}
	.year {
		font-weight: 600;
		color: var(--fg);
	}
	.grid-scroll {
		overflow-x: auto;
	}
	/* Natural size from the width/height attributes: cells stay 12px however
	   short the span is — a stretched viewBox turns a two-week history into a
	   handful of giant cells. Full years overflow into .grid-scroll instead. */
	svg {
		display: block;
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
	/* Sequential accent ramp for intensity mode — one hue, light→dark, quartile
	   bins of the year's max day. Shared by cells (fill) and legend swatches
	   (background). */
	.lvl-1 {
		fill: color-mix(in srgb, var(--accent) 30%, var(--bg-raised));
		background: color-mix(in srgb, var(--accent) 30%, var(--bg-raised));
	}
	.lvl-2 {
		fill: color-mix(in srgb, var(--accent) 55%, var(--bg-raised));
		background: color-mix(in srgb, var(--accent) 55%, var(--bg-raised));
	}
	.lvl-3 {
		fill: color-mix(in srgb, var(--accent) 78%, var(--bg-raised));
		background: color-mix(in srgb, var(--accent) 78%, var(--bg-raised));
	}
	.lvl-4 {
		fill: var(--accent);
		background: var(--accent);
	}
	.ramp {
		gap: 0.25rem;
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
