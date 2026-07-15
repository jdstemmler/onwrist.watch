<script lang="ts">
	import { page } from '$app/state';
	const links = [
		{ href: '/', label: 'Collection' },
		{ href: '/log', label: 'Wear Log' },
		{ href: '/stats', label: 'Stats' }
	];
</script>

<nav>
	<span class="brand">horolog</span>
	<div class="links">
		{#each links as l}
			<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a>
		{/each}
	</div>
</nav>

<style>
	nav {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.9rem 1.25rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-raised);
	}

	.brand {
		font-family: var(--font-serif);
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
		background: var(--accent);
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
