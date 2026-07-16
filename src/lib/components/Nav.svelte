<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	let { appName }: { appName: string } = $props();

	type Theme = 'auto' | 'light' | 'dark';
	let theme = $state<Theme>('auto');

	onMount(() => {
		const t = localStorage.getItem('theme');
		if (t === 'light' || t === 'dark') theme = t;
	});

	const GLYPH: Record<Theme, string> = { auto: '\u25d0', light: '\u25cb', dark: '\u25cf' };

	function cycleTheme() {
		theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
		const root = document.documentElement;
		if (theme === 'auto') {
			localStorage.removeItem('theme');
			delete root.dataset.theme;
		} else {
			localStorage.setItem('theme', theme);
			root.dataset.theme = theme;
		}
		const dark =
			theme === 'dark' ||
			(theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', dark ? '#131614' : '#eef0ec');
	}
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
	<button class="theme" onclick={cycleTheme} title="Theme: {theme}" aria-label="Theme: {theme}">
		<span aria-hidden="true">{GLYPH[theme]}</span><span class="theme-label">{theme}</span>
	</button>
	<form method="POST" action="/login?/logout" class="logout">
		<button type="submit" title="Lock" aria-label="Lock">&#9919;</button>
	</form>
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

	/* lume tokens run hot on the black dial — keep the stripe quiet.
	   Mirrors app.css's two-way dark selection (system pref + manual). */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) nav::after {
			opacity: 0.65;
		}
	}
	:global([data-theme='dark']) nav::after {
		opacity: 0.65;
	}

	.theme {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: none;
		border: none;
		padding: 0.25rem 0.35rem;
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}
	.theme:hover {
		color: var(--fg);
		border: none;
	}

	@media (max-width: 34rem) {
		.theme-label {
			display: none;
		}
		.theme {
			font-size: 0.95rem;
			padding: 0.15rem 0.25rem;
		}
	}

	.logout {
		display: contents;
	}
	.logout button {
		background: none;
		border: none;
		padding: 0.15rem 0.25rem;
		font-size: 0.95rem;
		color: var(--fg-muted);
	}
	.logout button:hover {
		color: var(--fg);
		border: none;
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
