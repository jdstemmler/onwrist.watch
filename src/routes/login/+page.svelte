<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Wrist check — {data.appName}</title>
</svelte:head>

<div class="gate">
	<form method="POST" action="?/login" use:enhance class="card">
		<p class="kicker"><span class="dot"></span>Wrist check</p>
		{#if form?.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}
		<input type="hidden" name="next" value={data.next} />
		<!-- svelte-ignore a11y_autofocus -->
		<input
			type="password"
			name="password"
			placeholder="password"
			autocomplete="current-password"
			aria-label="Password"
			autofocus
			required
		/>
		<button type="submit" class="primary">Unlock</button>
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

	form:focus-within .dot {
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
</style>
