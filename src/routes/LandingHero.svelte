<script lang="ts">
	let { appName }: { appName: string } = $props();
</script>

<section class="hero">
	<div class="pitch">
		<p class="kicker"><span class="dot"></span>Self-hosted watch tracking</p>
		<h1>{appName}</h1>
		<p class="tagline">
			Log what's on your wrist, track your collection, and see your wear stats — your data, your
			server, no subscription.
		</p>
		<div class="actions">
			<a class="button primary" href="/signup">Create account</a>
			<a class="signin" href="/login">Sign in</a>
		</div>
	</div>

	<div class="showcase" aria-hidden="true">
		<figure class="shot shot-collection">
			<img class="shot-light" src="/landing/collection-light.webp" alt="" loading="lazy" />
			<img class="shot-dark" src="/landing/collection-dark.webp" alt="" loading="lazy" />
		</figure>
		<figure class="shot shot-stats">
			<img class="shot-light" src="/landing/stats-light.webp" alt="" loading="lazy" />
			<img class="shot-dark" src="/landing/stats-dark.webp" alt="" loading="lazy" />
		</figure>
	</div>
</section>

<style>
	.hero {
		min-height: 78dvh;
		display: grid;
		grid-template-columns: minmax(16rem, 26rem) 1fr;
		align-items: center;
		gap: 2.5rem;
		padding-block: 2rem;
	}

	.pitch {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
	}

	.kicker {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.18em;
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
		font-size: clamp(2.1rem, 5vw, 3rem);
		text-transform: lowercase;
		margin: 0;
	}

	.tagline {
		font-size: 1.05rem;
		line-height: 1.55;
		color: var(--fg-muted);
		max-width: 30ch;
		margin: 0;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		margin-top: 0.5rem;
	}

	.actions .button {
		padding: 0.65rem 1.3rem;
		font-size: 0.95rem;
	}

	.signin {
		font-size: 0.9rem;
		color: var(--fg-muted);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}

	.signin:hover {
		color: var(--fg);
	}

	.showcase {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 22rem;
	}

	.shot {
		margin: 0;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		overflow: hidden;
		background: var(--bg-raised);
	}

	.shot img {
		display: block;
		width: 100%;
		height: auto;
	}

	.shot-collection {
		position: relative;
		width: min(30rem, 92%);
		z-index: 2;
	}

	.shot-stats {
		position: absolute;
		width: min(22rem, 70%);
		right: -0.5rem;
		bottom: -1.5rem;
		z-index: 1;
		transform: rotate(2.5deg);
	}

	/* Light/dark screenshot pairs mirror app.css's two-way dark selection
	   (system preference, unless forced light, or the nav toggle's explicit
	   data-theme="dark"). Keep both blocks in sync with app.css. */
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

	@media (max-width: 46rem) {
		.hero {
			grid-template-columns: 1fr;
			min-height: auto;
			gap: 2rem;
		}

		.pitch {
			align-items: center;
			text-align: center;
		}

		.tagline {
			max-width: 34ch;
		}

		.showcase {
			min-height: 18rem;
		}

		.shot-collection {
			width: min(24rem, 100%);
		}

		.shot-stats {
			width: min(17rem, 70%);
			right: 0;
		}
	}
</style>
