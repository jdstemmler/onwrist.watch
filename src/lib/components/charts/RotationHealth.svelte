<script lang="ts">
	import { slotVar, slotTier } from './palette';

	type WatchStats = {
		watchId: number;
		label: string;
		status: 'owned' | 'sold';
		wears: number;
		distinctDays: number;
		hours: number;
		lastWornAt: string | null;
		costPerWearCents: number | null;
	};

	let { byWatch, nowIso, colorSlots }: { byWatch: WatchStats[]; nowIso: string; colorSlots: Map<number, number> } =
		$props();

	const NEGLECT_DAYS = 90;
	const now = $derived(new Date(nowIso).getTime());

	const owned = $derived(byWatch.filter((w) => w.status === 'owned'));

	const neglect = $derived(
		[...owned]
			.sort((a, b) => (a.lastWornAt ?? '').localeCompare(b.lastWornAt ?? ''))
			.map((w) => ({
				...w,
				daysSince: w.lastWornAt ? Math.floor((now - new Date(w.lastWornAt).getTime()) / 86_400_000) : null
			}))
	);

	const costLeaderboard = $derived(
		owned
			.filter((w) => w.costPerWearCents != null)
			.sort((a, b) => (a.costPerWearCents as number) - (b.costPerWearCents as number))
	);

	function fmtCents(c: number) {
		return (c / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
	}
</script>

<div class="chart-palette rotation-health">
	<div class="block">
		<h3>Neglect — longest since last worn</h3>
		{#if neglect.length === 0}
			<p class="muted">No owned watches yet.</p>
		{:else}
			<ul class="neglect-list">
				{#each neglect as w (w.watchId)}
					<li>
						<span
							class="swatch"
							class:repeat={slotTier(colorSlots.get(w.watchId) ?? 0) >= 1}
							style="background: {slotVar(colorSlots.get(w.watchId) ?? 0)}"
						></span>
						<a class="name" href="/watches/{w.watchId}">{w.label}</a>
						<span class="days num">
							{#if w.daysSince === null}
								never worn
							{:else}
								{w.daysSince} day{w.daysSince === 1 ? '' : 's'}
							{/if}
						</span>
						{#if w.daysSince === null || w.daysSince >= NEGLECT_DAYS}
							<span class="badge outline">neglected</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="block">
		<h3>Cost per wear — best value first</h3>
		{#if costLeaderboard.length === 0}
			<p class="muted">No priced watches with wear history yet.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th scope="col">Watch</th>
						<th scope="col" class="num">$ / wear</th>
						<th scope="col" class="num">Days worn</th>
					</tr>
				</thead>
				<tbody>
					{#each costLeaderboard as w (w.watchId)}
						<tr>
							<td>
								<span
									class="swatch"
									class:repeat={slotTier(colorSlots.get(w.watchId) ?? 0) >= 1}
									style="background: {slotVar(colorSlots.get(w.watchId) ?? 0)}"
								></span>
								<a class="name" href="/watches/{w.watchId}">{w.label}</a>
							</td>
							<td class="num">{fmtCents(w.costPerWearCents ?? 0)}</td>
							<td class="num">{w.distinctDays}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<style>
	/* dataviz palette — --series-N custom properties are declared once in
	   src/routes/stats/+page.svelte; this component only references var(--series-N)
	   via slotVar(). Base .swatch sizing comes from app.css, keyed off
	   .chart-palette; this component only adds flex: none since its swatches
	   sit inline in flex rows (list items, table cells) that would otherwise
	   shrink them. */

	.rotation-health {
		display: grid;
		gap: 1.5rem;
	}
	h3 {
		font-family: var(--font-sans);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-muted);
		margin: 0 0 0.5rem;
	}
	.rotation-health .swatch {
		flex: none;
	}
	.neglect-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}
	.neglect-list li {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.9rem;
	}
	.name {
		flex: 1;
		color: inherit;
		text-decoration: none;
	}
	.name:hover {
		color: var(--accent);
		text-decoration: underline;
	}
	.days {
		color: var(--fg-muted);
		font-size: 0.85rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	th.num,
	td.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	/* Let the Watch column absorb the table's slack so the two numeric columns
	   ($ / wear, Days worn) sit flush-right together and read as one
	   right-aligned block — matching the neglect list above — instead of the
	   currency column's values floating in the middle of a stretched column. */
	th:first-child,
	td:first-child {
		width: 100%;
	}
	td:first-child {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
