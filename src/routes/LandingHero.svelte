<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { appName, demoAvailable }: { appName: string; demoAvailable: boolean } = $props();
	const REPO = 'https://github.com/jdstemmler/onwrist.watch';
</script>

<section class="hero band">
	<div class="copy">
		<p class="kicker"><span class="dot solid"></span>Watch collection tracker</p>
		<h1>{appName}</h1>
		<p class="tagline">
			Track your collection and log every wear, so you can see what you actually reach for. Free —
			no subscription.
		</p>
		<ul class="features">
			<li>One tap to log the watch on your wrist</li>
			<li>Photos and details for every piece</li>
			<li>Installable app — add it to your home screen</li>
		</ul>
		<div class="cta-group">
			<div class="actions">
				<a class="button primary" href="/signup">Create account</a>
				<a class="button ghost" href="/login">Sign in</a>
			</div>
			{#if demoAvailable}
				<form class="demo-form" method="POST" action="/?/demo" use:enhance>
					<button type="submit" class="button demo-cta">
						Try the live demo <span aria-hidden="true">→</span>
					</button>
				</form>
			{/if}
		</div>
		{#if page.form?.message}
			<p class="demo-error" role="alert">{page.form.message}</p>
		{/if}
	</div>

	<figure class="shot" aria-hidden="true">
		<img class="shot-light" src="/landing/collection-light.webp" alt="" loading="eager" />
		<img class="shot-dark" src="/landing/collection-dark.webp" alt="" loading="eager" />
	</figure>
</section>

<section class="stats band">
	<div class="copy">
		<p class="kicker"><span class="dot solid"></span>Wear stats, automatically</p>
		<h2>See where the hours go</h2>
		<p class="tagline">
			Every wear session rolls up into the numbers behind your habits — no spreadsheet required.
		</p>
		<ul class="features">
			<li>Wrist-time share and rotation health</li>
			<li>Day-of-week and time-of-day rhythms</li>
			<li>A wear calendar, colored by watch</li>
			<li>Cost-per-wear on every piece</li>
		</ul>
		<div class="actions">
			<a class="button ghost" href="/signup">Start your log <span aria-hidden="true">→</span></a>
		</div>
	</div>
	<figure class="shot" aria-hidden="true">
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
	<a class="privacy-link" href="/privacy">Privacy</a>
	<span class="credit"
		>Demo watch photos via <a href="{REPO}/blob/main/scripts/demo-assets/CREDITS.md">Wikimedia Commons</a></span
	>
</footer>

<style>
	/* Two feature bands share one layout: a text column and a framed product
	   shot, vertically centered, with the whole pair centered in the page. */
	.band {
		display: grid;
		grid-template-columns: minmax(15rem, 26rem) minmax(0, 34rem);
		justify-content: center;
		align-items: center;
		gap: clamp(2rem, 5vw, 4rem);
		padding-block: clamp(1.5rem, 5vw, 3.5rem);
	}
	.stats {
		border-top: 1px solid var(--border);
	}

	.copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1.1rem;
	}

	/* .kicker/.dot come from app.css — these dots are permanently lit
	   (class="dot solid"), there's no on/off state to represent. */

	/* text-wrap: balance evens the rag so a heading can't strand a single
	   word on its own line at any width (older browsers just skip it). */
	.hero h1 {
		font-size: clamp(2.4rem, 6vw, 3.4rem);
		text-transform: lowercase;
		letter-spacing: 0.02em;
		margin: 0;
		text-wrap: balance;
	}
	.stats h2 {
		font-size: clamp(1.5rem, 3.5vw, 2rem);
		margin: 0;
		text-wrap: balance;
	}

	.tagline {
		font-size: 1.05rem;
		line-height: 1.55;
		color: var(--fg-muted);
		max-width: 34ch;
		margin: 0;
	}

	/* Spec-sheet feature list: monospace to echo the engraving vocabulary the
	   app uses for every watch label, each line led by an olive tick. */
	.features {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.features li {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		line-height: 1.35;
		color: var(--fg);
	}
	.features li::before {
		content: '';
		flex: none;
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: var(--accent);
		transform: translateY(-0.1rem);
	}

	/* The CTA pair and the demo button share one fit-content column so the
	   full-width demo button stretches to exactly the pair's width — both
	   rows' edges line up. */
	.cta-group {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: fit-content;
		margin-top: 0.3rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
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

	/* Demo: a full-width, lower-emphasis link-button on its own row below the
	   two primary CTAs — never in the CTA row (a third button orphan-wraps at
	   phone widths). */
	.demo-form {
		width: 100%;
		margin: 0;
	}
	.demo-cta {
		width: 100%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--fg-muted);
		font-size: 0.9rem;
	}
	.demo-cta:hover {
		border-color: var(--accent);
		color: var(--fg);
	}

	.demo-error {
		margin: 0;
		font-size: 0.85rem;
		color: var(--danger);
	}

	/* Framed product shots: capped height with a bottom fade so the cropped
	   edge reads as "more below" instead of a hard mid-card clip, and so the
	   bright light-theme shot doesn't dead-end as a hard rectangle. */
	.shot {
		position: relative;
		width: 100%;
		max-width: 34rem;
		max-height: 22rem;
		margin: 0;
		overflow: hidden;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		background: var(--bg-raised);
	}
	.shot img {
		width: 100%;
		height: auto;
	}
	.shot::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 4.5rem;
		background: linear-gradient(to bottom, transparent, var(--bg-raised));
		pointer-events: none;
	}
	/* base display lives on the toggle classes (not `.shot img`) so the
	   `.shot-dark { display: none }` default can't be out-specificity'd by a
	   `.shot img { display: block }` rule (which would render both images). */
	.shot-light,
	.shot-dark {
		display: block;
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
	.privacy-link {
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	.privacy-link:hover {
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

	@media (max-width: 52rem) {
		.band {
			grid-template-columns: 1fr;
			gap: 1.75rem;
			justify-items: center;
		}
		.copy {
			align-items: center;
			text-align: center;
			max-width: 34rem;
		}
		.features li {
			text-align: left;
		}
		.actions {
			justify-content: center;
		}
		.demo-form {
			align-self: center;
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
