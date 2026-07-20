<script lang="ts">
	import { enhance } from '$app/forms';
	import { withPending } from '$lib/pending';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Reset password — {data.appName}</title>
</svelte:head>

<div class="gate">
	<div class="card">
		<p class="kicker"><span class="dot"></span>Reset password</p>
		{#if form?.sent}
			<p class="lead">If that address has an account, a reset link is on its way.</p>
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
					autocomplete="username"
					aria-label="Email"
					autofocus
					required
				/>
				<button type="submit" class="primary">Send reset link</button>
			</form>
			<div class="links">
				<a href="/login">Back to login</a>
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

	.card:focus-within .dot {
		border: none;
		background: var(--accent);
		box-shadow: 0 0 7px color-mix(in srgb, var(--accent) 65%, transparent);
	}

	input {
		color: var(--fg);
		text-align: center;
		font-family: var(--font-display);
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
		font-size: 0.8rem;
	}

	.links a {
		color: var(--fg-muted);
	}

	.links a:hover {
		color: var(--fg);
	}
</style>
