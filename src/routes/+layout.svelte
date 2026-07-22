<script lang="ts">
	import '../app.css';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Nav from '$lib/components/Nav.svelte';
	let { children, data } = $props();

	const resendResult = $derived(
		page.form?.action === 'resendVerify' ? page.form : undefined
	);

	const GATE_ROUTES = new Set(['/login', '/signup', '/verify', '/reset', '/reset/confirm']);
	// The public landing view (logged-out '/') is a marketing page, not a
	// signed-in surface — hide the app nav there too, same as the gate routes.
	const isLandingRoute = $derived(page.route.id === '/' && !data.email);
</script>

{#if !GATE_ROUTES.has(page.route.id ?? '') && !isLandingRoute}
	<Nav appName={data.appName} email={data.email} isAdmin={data.role === 'admin'} />
	{#if data.demo}
		<div class="top-banner demo-banner">
			<p>You're browsing a read-only demo.</p>
			<a href="/signup">Create your own account</a>
		</div>
	{/if}
	{#if data.email && !data.verified}
		<div class="top-banner unverified-banner">
			<p>Verify your email to add watches.</p>
			{#if resendResult?.sent}
				<span class="sent">Sent — check your inbox.</span>
			{:else}
				<form method="POST" action="/settings?/resendVerify" use:enhance>
					{#if resendResult?.message}
						<span class="error">{resendResult.message}</span>
					{/if}
					<button type="submit">Resend email</button>
				</form>
			{/if}
		</div>
	{/if}
{/if}
{#if GATE_ROUTES.has(page.route.id ?? '')}
	<header class="gate-header">
		<a href="/">‹ {data.appName}</a>
	</header>
{/if}
<main>{@render children()}</main>

<style>
	/* shell (layout, tint formula) is .top-banner in app.css; variants only
	   choose the tint and style their own contents */
	.demo-banner a {
		font-weight: 600;
		color: var(--accent);
	}

	.unverified-banner {
		--banner-tint: var(--danger);
		--banner-tint-amount: 10%;
	}

	.unverified-banner form {
		display: contents;
	}

	.unverified-banner button {
		font-size: 0.78rem;
		padding: 0.3rem 0.6rem;
	}

	.unverified-banner .sent {
		color: var(--accent);
		font-weight: 600;
	}

	.unverified-banner .error {
		color: var(--danger);
	}

	.gate-header {
		padding: 1rem 1.25rem 0;
	}

	.gate-header a {
		font-size: 0.85rem;
		color: var(--fg-muted);
		text-decoration: none;
	}

	.gate-header a:hover {
		color: var(--accent);
	}
</style>
