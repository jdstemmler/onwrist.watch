<script lang="ts">
	import { slotVar, niceTicks } from './palette';

	type Row = { watchId: number; label: string; hours: number; wears: number };

	let { rows, colorSlots }: { rows: Row[]; colorSlots: Map<number, number> } = $props();

	const sorted = $derived([...rows].filter((r) => r.hours > 0).sort((a, b) => b.hours - a.hours));
	const maxHours = $derived(Math.max(0, ...sorted.map((r) => r.hours)));
	const ticks = $derived(niceTicks(maxHours, 4));
	const niceMax = $derived(ticks[ticks.length - 1] || 1);

	function pct(hours: number) {
		return (hours / niceMax) * 100;
	}
	function fmtHours(h: number) {
		return h >= 100 ? Math.round(h).toLocaleString() : (Math.round(h * 10) / 10).toString();
	}
</script>

<div class="chart-palette wrist-share">
	{#if sorted.length === 0}
		<p class="muted empty">No wear time logged yet.</p>
	{:else}
		<div class="axis" aria-hidden="true">
			{#each ticks as t}
				<span class="tick" style="left: {pct(t)}%">{t}h</span>
			{/each}
		</div>
		<ul class="rows">
			{#each sorted as r (r.watchId)}
				<li class="row">
					<span class="label" title={r.label}>{r.label}</span>
					<span
						class="track"
						role="img"
						aria-label={`${r.label}: ${fmtHours(r.hours)} hours over ${r.wears} wear${r.wears === 1 ? '' : 's'}`}
					>
						{#each ticks as t}
							<span class="grid" style="left: {pct(t)}%"></span>
						{/each}
						<span class="fill" style="width: {pct(r.hours)}%; background: {slotVar(colorSlots.get(r.watchId) ?? 0)}"
						></span>
					</span>
					<span class="value num">{fmtHours(r.hours)}h · {r.wears}×</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* dataviz palette — --series-N custom properties are declared once in
	   src/routes/stats/+page.svelte; this component only references var(--series-N)
	   via slotVar(). */

	.wrist-share {
		display: grid;
		grid-template-columns: minmax(6rem, 9rem) 1fr auto;
		row-gap: 0.6rem;
		column-gap: 0.75rem;
	}
	.empty {
		grid-column: 1 / -1;
	}
	.axis {
		grid-column: 2;
		position: relative;
		height: 1rem;
		margin-bottom: 0.15rem;
	}
	.tick {
		position: absolute;
		transform: translateX(-50%);
		font-size: 0.7rem;
		color: var(--fg-muted);
		font-variant-numeric: tabular-nums;
	}
	.tick:first-child {
		transform: none;
	}
	.rows {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		list-style: none;
		margin: 0;
		padding: 0;
		row-gap: 0.6rem;
	}
	.row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
	}
	.label {
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		position: relative;
		height: 20px;
		background: color-mix(in srgb, var(--border) 55%, transparent);
		border-radius: 3px;
	}
	.grid {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border);
		opacity: 0.6;
	}
	.fill {
		position: absolute;
		inset-block: 0;
		left: 0;
		border-radius: 3px;
		min-width: 2px;
	}
	.value {
		font-size: 0.8rem;
		color: var(--fg-muted);
		white-space: nowrap;
	}
</style>
