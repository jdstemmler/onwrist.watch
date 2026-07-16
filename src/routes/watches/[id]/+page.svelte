<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

	const MOVEMENT_LABEL: Record<string, string> = {
		automatic: 'Automatic',
		manual: 'Manual wind',
		quartz: 'Quartz',
		solar: 'Solar',
		other: 'Other'
	};

	const BOX_PAPERS_LABEL: Record<string, string> = {
		none: 'Neither',
		box: 'Box only',
		papers: 'Papers only',
		both: 'Box & papers'
	};

	const sortedPhotos = $derived(
		[...data.photos].sort(
			(a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder
		)
	);
	const primaryPhoto = $derived(sortedPhotos[0]);
	const thumbPhotos = $derived(sortedPhotos.slice(1));

	const dowHours = $derived.by(() => {
		const byDow = new Map(data.dow.map((r) => [r.dow, r.hours]));
		return Array.from({ length: 7 }, (_, i) => byDow.get(i) ?? 0);
	});
	const maxDowHours = $derived(Math.max(1, ...dowHours));

	function money(cents: number, digits = 2): string {
		return `$${(cents / 100).toFixed(digits)}`;
	}

	function fmtDay(d: Date): string {
		return new Intl.DateTimeFormat('en-US', {
			timeZone: data.homeTz,
			month: 'short',
			day: 'numeric'
		}).format(d);
	}

	function fmtTime(d: Date): string {
		return new Intl.DateTimeFormat('en-US', {
			timeZone: data.homeTz,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(d);
	}

	function sessionRange(s: { startedAt: Date; endedAt: Date | null }): string {
		const start = `${fmtDay(s.startedAt)} · ${fmtTime(s.startedAt)}`;
		if (!s.endedAt) return `${start} – on wrist now`;
		const end = fmtDay(s.startedAt) === fmtDay(s.endedAt)
			? fmtTime(s.endedAt)
			: `${fmtDay(s.endedAt)} · ${fmtTime(s.endedAt)}`;
		return `${start} – ${end}`;
	}
</script>

<svelte:head>
	<title>{data.stats.label} — {data.appName}</title>
</svelte:head>

<div class="detail">
	<a class="back" href="/">‹ Collection</a>

	<header class="head">
		<div class="titles">
			<h1>
				{data.stats.label}
				{#if data.watch.status === 'sold'}
					<span class="pill">Sold</span>
				{/if}
			</h1>
			{#if data.watch.nickname}
				<p class="subtitle muted">{data.watch.brand} {data.watch.model}</p>
			{/if}
		</div>
		<a class="button" href="/watches/{data.watch.id}/edit">Edit</a>
	</header>

	{#if sortedPhotos.length}
	<section class="photos">
		{#if primaryPhoto}
			<div class="primary-photo">
				<img src={primaryPhoto.url} alt={data.stats.label} />
			</div>
			{#if thumbPhotos.length}
				<div class="thumb-row">
					{#each thumbPhotos as p (p.id)}
						<div class="thumb">
							<img src={p.url} alt="" />
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</section>
	{/if}

	<section class="stat-row">
		<div class="stat card">
			<span class="stat-value num">{data.stats.wears}</span>
			<span class="stat-label muted">Wears</span>
		</div>
		<div class="stat card">
			<span class="stat-value num">{data.stats.distinctDays}</span>
			<span class="stat-label muted">Distinct days</span>
		</div>
		<div class="stat card">
			<span class="stat-value num">{data.stats.hours.toFixed(1)}</span>
			<span class="stat-label muted">Hours worn</span>
		</div>
		{#if data.stats.costPerWearCents != null}
			<div class="stat card">
				<span class="stat-value num">{money(data.stats.costPerWearCents, 0)}</span>
				<span class="stat-label muted">Per wear</span>
			</div>
		{/if}
	</section>

	<section class="two-col">
		<div class="card">
			<h2>Specification</h2>
			<table class="spec">
				<tbody>
					{#if data.watch.referenceNo}
						<tr><th>Reference</th><td>{data.watch.referenceNo}</td></tr>
					{/if}
					{#if data.watch.serialNo}
						<tr><th>Serial</th><td class="num">{data.watch.serialNo}</td></tr>
					{/if}
					{#if data.watch.dialColor}
						<tr><th>Dial</th><td>{data.watch.dialColor}</td></tr>
					{/if}
					{#if data.watch.movement}
						<tr><th>Movement</th><td>{MOVEMENT_LABEL[data.watch.movement]}</td></tr>
					{/if}
					{#if data.watch.caseMm != null}
						<tr><th>Case</th><td class="num">{data.watch.caseMm} mm</td></tr>
					{/if}
					{#if data.watch.lugMm != null}
						<tr><th>Lug width</th><td class="num">{data.watch.lugMm} mm</td></tr>
					{/if}
					{#if data.watch.waterResistanceM != null}
						<tr><th>Water resistance</th><td class="num">{data.watch.waterResistanceM} m</td></tr>
					{/if}
					{#if data.watch.strapNotes}
						<tr><th>Strap</th><td>{data.watch.strapNotes}</td></tr>
					{/if}
				</tbody>
			</table>
		</div>

		<div class="card">
			<h2>Ownership</h2>
			<table class="spec">
				<tbody>
					{#if data.watch.isGift}
						<tr><th>Gift</th><td>yes</td></tr>
					{/if}
					{#if data.watch.purchaseDate}
						<tr><th>{data.watch.isGift ? 'Received' : 'Purchased'}</th><td class="num">{data.watch.purchaseDate}</td></tr>
					{/if}
					{#if data.watch.pricePaidCents != null}
						<tr><th>{data.watch.isGift ? 'Est. value' : 'Price paid'}</th><td class="num">{money(data.watch.pricePaidCents)}</td></tr>
					{/if}
					{#if data.watch.purchasedFrom}
						<tr><th>From</th><td>{data.watch.purchasedFrom}</td></tr>
					{/if}
					{#if data.watch.boxPapers}
						<tr><th>Box &amp; papers</th><td>{BOX_PAPERS_LABEL[data.watch.boxPapers]}</td></tr>
					{/if}
					{#if data.watch.condition}
						<tr><th>Condition</th><td>{data.watch.condition}</td></tr>
					{/if}
					{#if data.watch.lastServiced}
						<tr><th>Last serviced</th><td class="num">{data.watch.lastServiced}</td></tr>
					{/if}
					{#if data.watch.status === 'sold'}
						{#if data.watch.soldDate}
							<tr><th>Sold</th><td class="num">{data.watch.soldDate}</td></tr>
						{/if}
						{#if data.watch.soldPriceCents != null}
							<tr><th>Sold price</th><td class="num">{money(data.watch.soldPriceCents)}</td></tr>
						{/if}
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	<section class="card dow">
		<h2>By day of week</h2>
		<div class="bars">
			{#each dowHours as h, i}
				<div class="bar-col">
					<div class="bar-track">
						<div class="bar" style="height: {(h / maxDowHours) * 100}%" title="{h.toFixed(1)}h"></div>
					</div>
					<span class="bar-label muted">{DOW_LABELS[i]}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="card sessions">
		<h2>Recent wear</h2>
		{#if data.sessions.length === 0}
			<p class="muted">No wear sessions logged yet.</p>
		{:else}
			<ul>
				{#each data.sessions as s (s.id)}
					<li>
						<span class="range num">{sessionRange(s)}</span>
						{#if s.note}
							<span class="note">{s.note}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.back {
		align-self: flex-start;
		font-size: 0.85rem;
		color: var(--fg-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--accent);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.titles h1 {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.15em;
	}

	.subtitle {
		font-size: 0.95rem;
		margin: 0;
	}

	.pill {
		font-family: var(--font-sans);
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--danger-fg);
		background: var(--danger);
		border-radius: 999px;
		padding: 0.2em 0.6em;
		vertical-align: middle;
	}

	.button {
		display: inline-block;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem 0.9rem;
		color: var(--fg);
		text-decoration: none;
		font-size: 0.9rem;
		white-space: nowrap;
		transition: border-color 0.15s ease;
	}

	.button:hover {
		border-color: var(--accent);
	}

	.photos {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.primary-photo {
		width: 100%;
		aspect-ratio: 16 / 10;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		background: var(--bg-raised);
	}

	.primary-photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}



	.thumb-row {
		display: flex;
		gap: 0.6rem;
		overflow-x: auto;
		padding-bottom: 0.2rem;
	}

	.thumb {
		flex: 0 0 auto;
		width: 4.5rem;
		height: 4.5rem;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.stat-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.stat {
		flex: 1 1 8rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.9rem 1rem;
	}

	.stat-value {
		font-family: var(--font-display);
		font-size: 1.7rem;
		color: var(--accent);
		line-height: 1.1;
	}

	.stat-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.spec {
		width: 100%;
		border-collapse: collapse;
	}

	.spec tr:not(:last-child) {
		border-bottom: 1px solid var(--border);
	}

	.spec th,
	.spec td {
		text-align: left;
		padding: 0.45rem 0;
		font-weight: 400;
		vertical-align: top;
	}

	.spec th {
		color: var(--fg-muted);
		font-size: 0.85rem;
		width: 40%;
		padding-right: 0.75rem;
	}

	.dow .bars {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		height: 6rem;
	}

	.bar-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		height: 100%;
	}

	.bar-track {
		width: 100%;
		height: 4.5rem;
		display: flex;
		align-items: flex-end;
	}

	.bar {
		width: 100%;
		min-height: 2px;
		background: var(--accent);
		border-radius: 3px 3px 0 0;
		transition: height 0.2s ease;
	}

	.bar-label {
		font-size: 0.75rem;
	}

	.sessions ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.sessions li {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0;
	}

	.sessions li:not(:last-child) {
		border-bottom: 1px solid var(--border);
	}

	.range {
		font-size: 0.92rem;
	}

	.note {
		font-style: italic;
		color: var(--fg-muted);
		font-size: 0.88rem;
	}

	@media (max-width: 40rem) {
		.two-col {
			grid-template-columns: 1fr;
		}
	}
</style>
