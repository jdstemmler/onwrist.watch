<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status === 404 ? 'Not found' : 'Something went wrong'}</title>
</svelte:head>

<div class="gate">
	<div class="card">
		<p class="kicker"><span class="dot"></span>{page.status}</p>
		<h1>{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
		<p class="lead">
			{page.status === 404
				? "That page doesn't exist — the link may be stale."
				: 'An unexpected error occurred. Your data is fine; try again in a moment.'}
		</p>
		<a class="button primary" href="/">Back to collection</a>
	</div>
</div>

<style>
	.gate {
		min-height: 60dvh;
		display: grid;
		place-items: center;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: min(22rem, 100%);
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
		border: 1.5px solid var(--danger);
	}

	h1 {
		font-size: 1.3rem;
		margin: 0;
	}

	.lead {
		color: var(--fg-muted);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
