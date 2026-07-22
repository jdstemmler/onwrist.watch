<script lang="ts">
	import { enhance } from '$app/forms';
	import { withPending } from '$lib/pending';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>New password — {data.appName}</title>
</svelte:head>

<div class="gate">
	<form method="POST" use:enhance={withPending()} class="card">
		<p class="kicker"><span class="dot"></span>New password</p>
		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}
		<input type="hidden" name="token" value={data.token} />
		<label class="field">
			<span class="lbl">New password</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="password"
				name="password"
				placeholder="10+ characters"
				autocomplete="new-password"
				minlength="10"
				autofocus
				required
			/>
		</label>
		<button type="submit" class="primary">Set password</button>
		<div class="links">
			<a href="/login">Back to login</a>
		</div>
	</form>
</div>

<style>
	.gate {
		min-height: 70dvh;
		display: grid;
		place-items: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: min(20rem, 100%);
		padding: 1.5rem 1.25rem;
		text-align: center;
	}

	/* .kicker/.dot (and the focus-within glow) come from app.css. */

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
