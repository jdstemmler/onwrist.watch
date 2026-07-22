<script lang="ts">
	import LandingHero from './LandingHero.svelte';
	import { photoUrl } from '$lib/watch-label';
	let { data } = $props();
	const fmtDate = (iso: string | null) =>
		iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never';
</script>

<svelte:head>
	<title>{data.landing ? data.appName : `Collection — ${data.appName}`}</title>
</svelte:head>

{#if data.landing}
	<LandingHero appName={data.appName} demoAvailable={data.demoAvailable} />
{:else}
	<header class="row">
		<h1>Collection</h1>
		<a class="button primary" href="/watches/new">Add watch</a>
	</header>

	{#if data.owned.length === 0}
		<div class="empty card">
			<p>No watches yet.</p>
			<a class="button primary" href="/watches/new">Add your first watch</a>
		</div>
	{:else}
		<div class="grid">
			{#each data.owned as { watch, primaryPhoto, stats }}
				<a class="card" class:on-wrist={watch.id === data.wearingId} href="/watches/{watch.id}">
					<div class="photo">
						{#if primaryPhoto}
							<img src={photoUrl(primaryPhoto)} alt={stats.label} loading="lazy" />
						{:else}
							<div class="ph" aria-hidden="true">
								<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4">
									<circle cx="12" cy="12" r="7.25" />
									<path d="M12 8.5V12l2.6 1.5" stroke-linecap="round" stroke-linejoin="round" />
									<path d="M9.5 3.5h5M9.5 20.5h5" stroke-linecap="round" />
								</svg>
							</div>
						{/if}
					</div>
					{#if watch.id === data.wearingId}
						<p class="kicker onwrist"><span class="dot on"></span>On wrist</p>
					{/if}
					<h2>{stats.label}</h2>
					<p class="sub">{watch.brand} {watch.model}{watch.referenceNo ? ` · ${watch.referenceNo}` : ''}</p>
					<p class="meta num"><span class="seg">{stats.wears} wears</span> · <span class="seg"
						>{Math.round(stats.hours)}h</span
					> · <span class="seg">last worn {fmtDate(stats.lastWornAt)}</span></p>
				</a>
			{/each}
		</div>
	{/if}

	{#if data.sold.length}
		<details class="sold">
			<summary>Sold ({data.sold.length})</summary>
			<ul>
				{#each data.sold as { watch, stats }}
					<li><a href="/watches/{watch.id}">{stats.label}</a> <span class="muted">— sold {watch.soldDate ?? ''}</span></li>
				{/each}
			</ul>
		</details>
	{/if}
{/if}

<style>
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 1.5rem;
	}

	.row h1 {
		margin: 0;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.9rem;
		padding: 2rem 1.5rem;
	}

	.empty p {
		margin: 0;
		color: var(--fg-muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		align-items: stretch;
		gap: 1.1rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
	}

	.card:hover {
		transform: translateY(-2px);
		border-color: var(--accent);
		box-shadow: var(--shadow-lg);
	}

	/* On-wrist cue: a stronger border (the default olive tint alone is too
	   faint in light mode) plus the .kicker/.dot.on eyebrow shared with the
	   wear log — same "currently worn" vocabulary in both places. */
	.card.on-wrist {
		border-color: var(--accent);
		box-shadow: var(--shadow), inset 0 0 0 1px var(--accent);
	}

	.card.on-wrist:hover {
		box-shadow: var(--shadow-lg), inset 0 0 0 1px var(--accent);
	}

	.kicker.onwrist {
		justify-content: flex-start;
		margin: 0 0 0.35rem;
	}

	.photo {
		margin: -1rem -1rem 0.75rem;
		border-radius: var(--radius) var(--radius) 0 0;
		overflow: hidden;
		background: var(--bg);
	}

	.card img,
	.ph {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
	}

	.ph {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--fg-muted);
		background:
			radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--accent) 8%, transparent), transparent),
			var(--bg);
	}

	.card h2 {
		font-size: 1.05rem;
		margin: 0 0 0.2rem;
	}

	.sub {
		font-size: 0.85rem;
		margin: 0 0 0.35rem;
		color: var(--fg-muted);
	}

	.meta {
		font-size: 0.78rem;
		margin: auto 0 0;
		color: var(--fg-muted);
	}

	/* Only allow line breaks at the " · " separators — each segment stays
	   intact so a trailing token (e.g. "30" from "last worn Jun 30") never
	   wraps onto its own line. */
	.meta .seg {
		white-space: nowrap;
	}

	details.sold {
		margin-top: 2rem;
		border-top: 1px solid var(--border);
		padding-top: 1rem;
	}

	details.sold summary {
		cursor: pointer;
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--fg-muted);
	}

	details.sold ul {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	details.sold li {
		font-size: 0.9rem;
	}

	@media (max-width: 30rem) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
			gap: 0.75rem;
		}
	}
</style>
