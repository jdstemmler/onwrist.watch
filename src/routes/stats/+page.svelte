<script lang="ts">
	import type { PageData } from './$types';
	import { assignSlots } from '$lib/components/charts/palette';
	import WristShare from '$lib/components/charts/WristShare.svelte';
	import DowChart from '$lib/components/charts/DowChart.svelte';
	import TodChart from '$lib/components/charts/TodChart.svelte';
	import TodByWatchChart from '$lib/components/charts/TodByWatchChart.svelte';
	import CalendarHeatmap from '$lib/components/charts/CalendarHeatmap.svelte';
	import RotationHealth from '$lib/components/charts/RotationHealth.svelte';

	let { data }: { data: PageData } = $props();

	const colorSlots = $derived(assignSlots(data.byWatch.map((w) => w.watchId)));

	function fmtHours(h: number) {
		return (Math.round(h * 10) / 10).toLocaleString();
	}
	function fmtSince(iso: string | null) {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	}
</script>

<svelte:head>
	<title>Stats — {data.appName}</title>
</svelte:head>

<h1>Stats</h1>

<section class="tiles">
	<div class="tile card">
		<span class="tile-label">Watches</span>
		<span class="tile-value num">{data.summary.watches}</span>
	</div>
	<div class="tile card">
		<span class="tile-label">Sessions logged</span>
		<span class="tile-value num">{data.summary.sessions}</span>
	</div>
	<div class="tile card">
		<span class="tile-label">Total hours worn</span>
		<span class="tile-value num">{fmtHours(data.summary.totalHours)}</span>
	</div>
	<div class="tile card">
		<span class="tile-label">Tracking since</span>
		<span class="tile-value num tile-value--small">{fmtSince(data.summary.firstLoggedAt)}</span>
	</div>
</section>

<section class="card">
	<h2>Wrist-time share</h2>
	<p class="muted">Total hours worn, all time.</p>
	<WristShare rows={data.byWatch} {colorSlots} />
</section>

<section class="card">
	<h2>Day of week</h2>
	<p class="muted">Hours worn per weekday, stacked by watch.</p>
	<DowChart rows={data.byDow} {colorSlots} />
</section>

<section class="card">
	<h2>Time of day</h2>
	<p class="muted">When watches go on, and how much of the day they stay on.</p>
	<TodChart putOnByHour={data.byTod.putOnByHour} wearingShareByHour={data.byTod.wearingShareByHour} />
</section>

<section class="card">
	<h2>Watch by time of day</h2>
	<p class="muted">Which watch owns which hour, all time.</p>
	<TodByWatchChart rows={data.todByWatch} {colorSlots} />
</section>

<section class="card">
	<h2>Calendar</h2>
	<p class="muted">Dominant watch per day.</p>
	<CalendarHeatmap calendar={data.calendar} year={data.year} {colorSlots} />
</section>

<section class="card">
	<h2>Rotation health</h2>
	<p class="muted">Owned watches only.</p>
	<RotationHealth byWatch={data.byWatch} nowIso={data.nowIso} {colorSlots} />
</section>

<style>
	/* Single source of truth for the chart series palette — every chart
	   component's root element carries class="chart-palette" and only
	   references var(--series-N) (see slotVar() in
	   $lib/components/charts/palette.ts); the values are declared once here
	   instead of being copy-pasted into each component's local <style> block.
	   Must stay in sync with CATEGORICAL in palette.ts. */
	:global(.chart-palette) {
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
		:root:where(:not([data-theme='light'])) :global(.chart-palette) {
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
	:root[data-theme='dark'] :global(.chart-palette) {
		--series-1: #3987e5;
		--series-2: #008300;
		--series-3: #d55181;
		--series-4: #c98500;
		--series-5: #199e70;
		--series-6: #d95926;
		--series-7: #9085e9;
		--series-8: #e66767;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.tile-label {
		font-size: 0.75rem;
		color: var(--fg-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.tile-value {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--fg);
	}
	.tile-value--small {
		font-size: 1.1rem;
	}
	section.card {
		margin-bottom: 1.25rem;
	}
	section.card h2 {
		margin-bottom: 0.15rem;
	}
	section.card > p.muted {
		margin-top: 0;
		margin-bottom: 0.85rem;
		font-size: 0.85rem;
	}
</style>
