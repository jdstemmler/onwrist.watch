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
	{#if data.email && !data.verified}
		<div class="unverified-banner">
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
<main>{@render children()}</main>

<style>
	.unverified-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--danger) 10%, var(--bg-raised));
		border-bottom: 1px solid var(--border);
		font-size: 0.82rem;
		text-align: center;
	}

	.unverified-banner p {
		margin: 0;
		color: var(--fg);
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
</style>
