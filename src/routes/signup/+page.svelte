<script lang="ts">
	import { enhance } from '$app/forms';
	import { withPending } from '$lib/pending';
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Turnstile's api.js renders synchronously off data-theme at scan time
	// (it's async/defer, so this runs first); mirrors Nav's localStorage
	// theme read since there's no client-readable theme store to import.
	let turnstileTheme = $state<'light' | 'dark'>('light');
	onMount(() => {
		const stored = localStorage.getItem('theme');
		const dark =
			stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
		turnstileTheme = dark ? 'dark' : 'light';
	});
</script>

<svelte:head>
	<title>Create account — {data.appName}</title>
	<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</svelte:head>

<div class="gate">
	<div class="card">
		<p class="kicker"><span class="dot"></span>New collector</p>
		{#if form?.sent}
			<p class="lead">Check your inbox — we sent a link to verify your email.</p>
			<a class="button primary" href="/login">Back to login</a>
		{:else}
			<form method="POST" use:enhance={withPending()}>
				{#if form?.message}
					<p class="error" role="alert">{form.message}</p>
				{/if}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="email"
					name="email"
					placeholder="email"
					autocomplete="email"
					aria-label="Email"
					autofocus
					required
				/>
				<input
					type="password"
					name="password"
					placeholder="password (10+ characters)"
					autocomplete="new-password"
					aria-label="Password"
					minlength="10"
					required
				/>
				<div class="cf-turnstile" data-sitekey={data.turnstileSiteKey} data-theme={turnstileTheme}></div>
				<button type="submit" class="primary">Create account</button>
			</form>
			<div class="links">
				<a href="/login">Already have an account? Log in</a>
				<a href="/privacy">Privacy</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.gate {
		min-height: 70dvh;
		display: grid;
		place-items: center;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: min(20rem, 100%);
		padding: 1.5rem 1.25rem;
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	/* .kicker/.dot (and the focus-within glow) come from app.css. */

	input {
		color: var(--fg);
		text-align: center;
		font-family: var(--font-display);
	}

	.cf-turnstile {
		display: flex;
		justify-content: center;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0;
	}

	.lead {
		color: var(--fg-muted);
		font-size: 0.9rem;
		margin: 0;
	}

	.links {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
	}

	.links a {
		color: var(--fg-muted);
	}

	.links a:hover {
		color: var(--fg);
	}
</style>
