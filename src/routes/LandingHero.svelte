<script lang="ts">
	let { appName }: { appName: string } = $props();
	const REPO = 'https://github.com/jdstemmler/horolog';
</script>

<section class="hero">
	<div class="pitch">
		<p class="kicker"><span class="dot"></span>Watch collection tracker</p>
		<h1>{appName}</h1>
		<p class="tagline">
			Log what's on your wrist, track your collection, and see where the hours go. Free — no
			subscription.
		</p>
		<div class="actions">
			<a class="button primary" href="/signup">Create account</a>
			<a class="button ghost" href="/login">Sign in</a>
		</div>
	</div>

	<figure class="shot" aria-hidden="true">
		<img class="shot-light" src="/landing/collection-light.webp" alt="" loading="eager" />
		<img class="shot-dark" src="/landing/collection-dark.webp" alt="" loading="eager" />
	</figure>
</section>

<section class="band">
	<div class="band-copy">
		<p class="kicker"><span class="dot"></span>Wear stats, automatically</p>
		<h2>See where the hours go</h2>
		<p class="tagline">
			Wrist-time share, day-of-week rhythm, time-of-day habits, a wear calendar, and cost-per-wear —
			all computed from your log.
		</p>
	</div>
	<figure class="shot shot-stats" aria-hidden="true">
		<img class="shot-light" src="/landing/stats-light.webp" alt="" loading="lazy" />
		<img class="shot-dark" src="/landing/stats-dark.webp" alt="" loading="lazy" />
	</figure>
</section>

<footer class="foot">
	<a class="selfhost" href={REPO}>
		Want to run your own? Self-host {appName}
		<span aria-hidden="true">→</span>
	</a>
	<a class="gh" href={REPO} aria-label="{appName} on GitHub">
		<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
			<path
				d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
			/>
		</svg>
	</a>
	<span class="credit"
		>Demo watch photos via <a href="{REPO}/blob/main/scripts/demo-assets/CREDITS.md">Wikimedia Commons</a></span
	>
</footer>

<style>
	.hero {
		display: grid;
		grid-template-columns: minmax(15rem, 24rem) 1fr;
		align-items: center;
		gap: 3rem;
		padding-block: clamp(1.5rem, 5vw, 3.5rem);
	}

	.pitch {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1.1rem;
	}

	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-size: 0.76rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--accent);
	}

	.pitch h1 {
		font-size: clamp(2.4rem, 6vw, 3.4rem);
		text-transform: lowercase;
		letter-spacing: 0.02em;
		margin: 0;
	}

	.tagline {
		font-size: 1.05rem;
		line-height: 1.55;
		color: var(--fg-muted);
		max-width: 32ch;
		margin: 0;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 0.4rem;
	}
	.actions .button {
		padding: 0.65rem 1.4rem;
		font-size: 0.95rem;
	}
	/* balanced pair: solid primary + outlined secondary (same footprint) */
	.button.ghost {
		background: transparent;
		color: var(--fg);
		border: 1px solid var(--border);
	}
	.button.ghost:hover {
		border-color: var(--fg-muted);
		background: color-mix(in srgb, var(--fg) 5%, transparent);
	}

	/* Framed product shots */
	.shot {
		margin: 0;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		overflow: hidden;
		background: var(--bg-raised);
		max-height: 30rem;
	}
	.shot img {
		width: 100%;
		height: auto;
	}
	/* base display lives on the toggle classes (not `.shot img`) so the
	   `.shot-dark { display: none }` default isn't out-specificity'd by a
	   `.shot img { display: block }` rule — that bug rendered BOTH images in
	   light mode. */
	.shot-light,
	.shot-dark {
		display: block;
	}

	.band {
		display: grid;
		grid-template-columns: minmax(15rem, 24rem) 1fr;
		align-items: center;
		gap: 3rem;
		padding-block: clamp(1.5rem, 5vw, 3rem);
		border-top: 1px solid var(--border);
	}
	.band-copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.9rem;
	}
	.band-copy h2 {
		font-size: clamp(1.5rem, 3.5vw, 2rem);
		margin: 0;
	}
	.shot-stats {
		max-height: 26rem;
	}

	/* Light/dark screenshot pairs — mirror app.css's two-way dark selection
	   (system preference unless forced light, or the nav toggle's data-theme). */
	.shot-dark {
		display: none;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .shot-light {
			display: none;
		}
		:global(:root:not([data-theme='light'])) .shot-dark {
			display: block;
		}
	}
	:global([data-theme='dark']) .shot-light {
		display: none;
	}
	:global([data-theme='dark']) .shot-dark {
		display: block;
	}

	.foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1.25rem;
		padding-block: 1.75rem;
		border-top: 1px solid var(--border);
		margin-top: 1rem;
	}
	.selfhost {
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--fg-muted);
		text-decoration: none;
	}
	.selfhost:hover {
		color: var(--fg);
	}
	.gh {
		display: inline-flex;
		color: var(--fg-muted);
	}
	.gh:hover {
		color: var(--fg);
	}
	.credit {
		margin-left: auto;
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	.credit a {
		color: inherit;
	}

	@media (max-width: 46rem) {
		.hero,
		.band {
			grid-template-columns: 1fr;
			gap: 1.75rem;
		}
		.pitch,
		.band-copy {
			align-items: center;
			text-align: center;
		}
		.tagline {
			max-width: 36ch;
		}
		.shot {
			max-height: 24rem;
		}
		.credit {
			margin-left: 0;
			width: 100%;
			text-align: center;
		}
		.foot {
			justify-content: center;
		}
	}
</style>
