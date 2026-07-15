<script lang="ts">
	import { page } from '$app/state';
	let { appName }: { appName: string } = $props();
	const links = [
		{ href: '/', label: 'Collection' },
		{ href: '/log', label: 'Wear Log' },
		{ href: '/stats', label: 'Stats' }
	];
</script>

<nav>
	<span class="brand">{appName}</span>
	<div class="links">
		{#each links as l}
			<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a>
		{/each}
	</div>
</nav>

<style>
	nav {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.9rem 1.25rem;
		background: var(--bg-raised);
	}

	/* NATO stripe: navy / olive / navy */
	nav::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		background: linear-gradient(
			90deg,
			var(--navy) 0 25%,
			var(--accent) 25% 75%,
			var(--navy) 75% 100%
		);
	}

	@media (prefers-color-scheme: dark) {
		nav::after {
			opacity: 0.65; /* lume tokens run hot on the black dial — keep the stripe quiet */
		}
	}

	.brand {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg);
		margin-right: auto;
	}

	.links {
		display: flex;
		gap: 1.25rem;
	}

	a {
		position: relative;
		font-size: 0.9rem;
		color: var(--fg-muted);
		text-decoration: none;
		padding-block: 0.25rem;
		transition: color 0.15s ease;
	}

	a:hover {
		color: var(--fg);
	}

	a[aria-current='page'] {
		color: var(--fg);
	}

	a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: var(--navy);
		border-radius: 1px;
	}

	@media (max-width: 30rem) {
		nav {
			gap: 0.85rem;
			padding: 0.75rem 1rem;
		}
		.links {
			gap: 0.85rem;
		}
		a {
			font-size: 0.82rem;
		}
	}
</style>
