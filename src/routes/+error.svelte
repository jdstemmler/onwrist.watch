<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status === 404 ? 'Not found' : 'Something went wrong'}</title>
</svelte:head>

<div class="gate">
	<div class="card">
		<p class="kicker"><span class="dot error"></span>{page.status}</p>
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

	/* .kicker/.dot come from app.css — this page's dot is always in the
	   error/danger ring state (class="dot error"), never toggled. */

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
