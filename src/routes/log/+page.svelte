<script lang="ts">
	import { enhance } from '$app/forms';
	import SessionRow from '$lib/components/SessionRow.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(id);
	});

	function elapsed(sinceIso: string): string {
		const ms = now - new Date(sinceIso).getTime();
		const totalMin = Math.max(0, Math.floor(ms / 60_000));
		const h = Math.floor(totalMin / 60);
		const m = totalMin % 60;
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
</script>

<svelte:head>
	<title>Wear Log — horolog</title>
</svelte:head>

<section class="banner card" class:stale={data.stale}>
	<h1>{data.state.status_line}</h1>
	{#if data.state.wearing}
		<p class="elapsed num">Worn {elapsed(data.state.wearing.since)}</p>
	{/if}
	{#if data.stale}
		<p class="nudge">⚠️ Still wearing this? Fix below.</p>
	{/if}
</section>

{#if form?.message}
	<p class="toast" role="alert">{form.message}</p>
{/if}

<section class="actions">
	{#if data.state.valid_actions.includes('put_on')}
		<form method="POST" action="?/putOn" use:enhance class="card action-form">
			<h2>Put on</h2>
			<label class="field">
				<span class="lbl">Watch</span>
				<select name="watch_id" required>
					{#each data.state.watches as w (w.id)}
						<option value={w.id}>{w.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="lbl">Note</span>
				<input type="text" name="note" placeholder="optional" />
			</label>
			<button type="submit" class="primary big">Put On</button>
		</form>
	{/if}

	{#if data.state.valid_actions.includes('swap')}
		<form method="POST" action="?/swap" use:enhance class="card action-form">
			<h2>Swap</h2>
			<label class="field">
				<span class="lbl">New watch</span>
				<select name="watch_id" required>
					{#each data.state.watches as w (w.id)}
						<option value={w.id}>{w.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="lbl">Note</span>
				<input type="text" name="note" placeholder="optional" />
			</label>
			<button type="submit" class="primary big">Swap</button>
		</form>
	{/if}

	{#if data.state.valid_actions.includes('take_off')}
		<form method="POST" action="?/takeOff" use:enhance class="card action-form">
			<h2>Take off</h2>
			<label class="field">
				<span class="lbl">Note</span>
				<input type="text" name="note" placeholder="optional" />
			</label>
			<button type="submit" class="primary big">Take Off</button>
		</form>
	{/if}
</section>

<details class="card backfill">
	<summary>Backfill a session…</summary>
	<form method="POST" action="?/backfill" use:enhance>
		<label class="field">
			<span class="lbl">Watch</span>
			<select name="watch_id" required>
				{#each data.allWatches as w (w.id)}
					<option value={w.id}>{w.label}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span class="lbl">Start</span>
			<input type="datetime-local" name="started_at" required />
		</label>
		<label class="field">
			<span class="lbl">End <span class="muted">(optional — leave blank if still wearing)</span></span>
			<input type="datetime-local" name="ended_at" />
		</label>
		<label class="field">
			<span class="lbl">Note</span>
			<textarea name="note" rows="2" placeholder="optional"></textarea>
		</label>
		<button type="submit" class="primary big">Add Session</button>
	</form>
</details>

<h2>Timeline</h2>
<ul class="timeline">
	{#each data.sessions as s (s.id)}
		<SessionRow {s} watches={data.allWatches} />
	{/each}
</ul>

<style>
	.banner {
		text-align: center;
		margin-bottom: 1rem;
	}
	.banner h1 {
		margin-bottom: 0.25rem;
	}
	.banner.stale {
		border-color: var(--danger);
	}
	.elapsed {
		font-size: 1.1rem;
		color: var(--fg-muted);
		margin: 0;
	}
	.nudge {
		margin: 0.5rem 0 0;
		color: var(--danger);
		font-weight: 600;
	}
	.toast {
		background: var(--danger);
		color: var(--danger-fg);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		margin: 0 0 1rem;
		font-weight: 600;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	@media (min-width: 44rem) {
		.actions {
			grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
			align-items: start;
		}
	}
	.action-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.action-form h2 {
		margin: 0;
	}
	button.big {
		width: 100%;
		padding: 0.85rem 1rem;
		font-size: 1.05rem;
	}
	.backfill {
		margin-bottom: 1.5rem;
	}
	.backfill summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--accent);
		padding: 0.25rem 0;
	}
	.backfill form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.9rem;
		max-width: 34rem;
	}
	.timeline {
		list-style: none;
		margin: 0 0 2rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
</style>
