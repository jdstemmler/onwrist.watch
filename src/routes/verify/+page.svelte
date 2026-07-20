<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const token = $derived(page.url.searchParams.get('token') ?? '');
</script>

<svelte:head>
	<title>{form?.ok ? 'Verified' : 'Verify email'} — {data.appName}</title>
</svelte:head>

<div class="gate">
	<div class="card">
		{#if form?.ok}
			<p class="kicker"><span class="dot on"></span>Verified</p>
			<p class="lead">Your email is confirmed.</p>
			<a class="button primary" href="/log">Go to wear log</a>
		{:else if form && !form.ok}
			<p class="kicker"><span class="dot"></span>Link expired</p>
			<p class="error" role="alert">{form.message}</p>
			<a class="button" href="/login">Back to login</a>
		{:else if data.hasToken}
			<!-- Confirmation is a POST so link-prefetching mail scanners can't
			     consume the single-use token with a bare GET. -->
			<p class="kicker"><span class="dot"></span>Verify email</p>
			<p class="lead">Confirm this email address to finish setting up your account.</p>
			<form method="POST" use:enhance>
				<input type="hidden" name="token" value={token} />
				<button type="submit" class="button primary">Confirm email</button>
			</form>
		{:else}
			<p class="kicker"><span class="dot"></span>Link expired</p>
			<p class="error" role="alert">That link is no good — request a fresh one</p>
			<a class="button" href="/login">Back to login</a>
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

	.card form {
		display: contents;
	}

	.kicker {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1.5px solid var(--fg-muted);
	}

	.dot.on {
		border: none;
		background: var(--accent);
		box-shadow: 0 0 7px color-mix(in srgb, var(--accent) 65%, transparent);
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
</style>
