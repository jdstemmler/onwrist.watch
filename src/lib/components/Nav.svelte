<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	let {
		appName,
		email = null,
		isAdmin = false
	}: { appName: string; email?: string | null; isAdmin?: boolean } = $props();

	type Theme = 'auto' | 'light' | 'dark';
	let theme = $state<Theme>('auto');
	let menuOpen = $state(false);
	let menuEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		const t = localStorage.getItem('theme');
		if (t === 'light' || t === 'dark') theme = t;
		const onClick = (e: MouseEvent) => {
			if (menuOpen && menuEl && !menuEl.contains(e.target as Node)) menuOpen = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') menuOpen = false;
		};
		document.addEventListener('click', onClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('click', onClick);
			document.removeEventListener('keydown', onKey);
		};
	});

	const GLYPH: Record<Theme, string> = { auto: '◐', light: '○', dark: '●' };

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
	<a class="brand" href="/" aria-label={appName}>
		<img src="/icon-192.png" alt="" width="30" height="30" />
		<span class="wordmark">{appName}</span>
	</a>
	<div class="links">
		{#each links as l}
			<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a>
		{/each}
	</div>
	{#if email}
		<div class="menu" bind:this={menuEl}>
			<!-- Disclosure pattern (aria-expanded only), not role="menu": menu
			     roles promise arrow-key navigation and focus management this
			     panel doesn't implement, which misleads screen-reader users.
			     Plain links/buttons + Tab is honest and works. -->
			<button
				class="menu-trigger"
				onclick={() => (menuOpen = !menuOpen)}
				aria-expanded={menuOpen}
				aria-label="Menu"
			>
				<svg viewBox="0 0 4 16" width="4" height="16" fill="currentColor" aria-hidden="true">
					<circle cx="2" cy="2" r="1.7" />
					<circle cx="2" cy="8" r="1.7" />
					<circle cx="2" cy="14" r="1.7" />
				</svg>
			</button>
			{#if menuOpen}
				<div class="menu-panel">
					<button class="item" type="button" onclick={cycleTheme}>
						<span class="glyph" aria-hidden="true">{GLYPH[theme]}</span>
						Theme · {theme}
					</button>
					{#if isAdmin}
						<a
							class="item"
							href="/admin"
							onclick={() => (menuOpen = false)}
							aria-current={page.url.pathname === '/admin' ? 'page' : undefined}>Admin</a
						>
					{/if}
					<a
						class="item"
						href="/settings"
						onclick={() => (menuOpen = false)}
						aria-current={page.url.pathname === '/settings' ? 'page' : undefined}>Settings</a
					>
					<form method="POST" action="/login?/logout">
						<button class="item danger" type="submit">Log out</button>
					</form>
				</div>
			{/if}
		</div>
	{/if}
</nav>

<style>
	nav {
		position: relative;
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.7rem 1.25rem;
		background: var(--bg-raised);
	}

	/* Accent line under the top nav — brand green, not the off-palette blue
	   this used to borrow from --navy. */
	nav::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 3px;
		background: var(--accent);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) nav::after {
			opacity: 0.65;
		}
	}
	:global([data-theme='dark']) nav::after {
		opacity: 0.65;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		margin-right: auto;
		text-decoration: none;
	}
	.brand img {
		display: block;
		width: 30px;
		height: 30px;
		border-radius: 7px;
	}
	.wordmark {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg);
	}
	/* Phones: logo only — the wordmark's width isn't worth it next to the
	   section links; desktop/tablet keep the full brand. */
	@media (max-width: 34rem) {
		.wordmark {
			display: none;
		}
	}

	.links {
		display: flex;
		gap: 1.25rem;
	}
	.links a {
		position: relative;
		font-size: 0.9rem;
		color: var(--fg-muted);
		text-decoration: none;
		padding-block: 0.25rem;
		white-space: nowrap;
		transition: color 0.15s ease;
	}
	.links a:hover,
	.links a[aria-current='page'] {
		color: var(--fg);
	}
	.links a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: var(--accent);
		border-radius: 1px;
	}

	/* Utility dropdown: theme / (admin) / settings / logout */
	.menu {
		position: relative;
		display: inline-flex;
	}
	.menu-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		/* pad the 4×16 glyph out to a finger-sized target */
		padding: 0.75rem 0.9rem;
		margin: -0.35rem -0.4rem;
		border-radius: var(--radius);
		color: var(--fg-muted);
		cursor: pointer;
	}
	.menu-trigger:hover,
	.menu-trigger[aria-expanded='true'] {
		color: var(--fg);
	}

	.menu-panel {
		position: absolute;
		top: calc(100% + 0.55rem);
		right: 0;
		z-index: 30;
		min-width: 11rem;
		display: flex;
		flex-direction: column;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	.menu-panel form {
		display: contents;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0.62rem 0.9rem;
		font-family: var(--font-display);
		font-size: 0.74rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--fg-muted);
		text-decoration: none;
		cursor: pointer;
	}
	.item:hover,
	.item[aria-current='page'] {
		color: var(--fg);
		background: color-mix(in srgb, var(--fg) 7%, transparent);
	}
	.item .glyph {
		font-size: 0.9rem;
		line-height: 1;
	}
	/* set the destructive action apart with a divider */
	.menu-panel form .item {
		border-top: 1px solid var(--border);
		color: var(--danger);
	}
	.menu-panel form .item:hover {
		background: color-mix(in srgb, var(--danger) 8%, transparent);
	}

	@media (max-width: 26rem) {
		nav {
			gap: 0.9rem;
			padding: 0.6rem 0.9rem;
		}
		.links {
			gap: 1rem;
		}
		.links a {
			font-size: 0.84rem;
		}
	}
</style>
