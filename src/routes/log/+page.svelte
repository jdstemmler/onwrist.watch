<script lang="ts">
	import { enhance } from '$app/forms';
	import { withPending } from '$lib/pending';
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

	const fmtTime = (d: string | Date) =>
		new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: data.homeTz
		}).format(new Date(d));

	// One picker serves both put-on and swap: each watch in the list is a
	// submit button, so choosing a watch IS the action — no select + confirm.
	// Notes are added afterwards from the timeline's edit form.
	let picker = $state<HTMLDialogElement>();

	const pickWatch = withPending(
		() =>
			async ({ update }: { update: () => Promise<void> }) => {
				picker?.close();
				await update();
			}
	);
</script>

<svelte:head>
	<title>Wear Log — {data.appName}</title>
</svelte:head>

{#if form?.message}
	<p class="toast" role="alert">{form.message}</p>
{/if}

<div class="page">
	<div class="rail">
		<section class="wear card" class:stale={data.stale}>
			{#if data.state.wearing}
				<p class="kicker"><span class="dot on"></span>On wrist</p>
				<h1 class="watch-name">{data.state.wearing.label}</h1>
				<p class="sub num">
					since {fmtTime(data.state.wearing.since)} · {elapsed(data.state.wearing.since)}
				</p>
				<div class="actions">
					{#if data.state.valid_actions.includes('take_off')}
						<form method="POST" action="?/takeOff" use:enhance={withPending()}>
							<button type="submit" class="primary off">Take Off</button>
						</form>
					{/if}
					{#if data.state.valid_actions.includes('swap') && data.state.watches.length > 0}
						<button type="button" onclick={() => picker?.showModal()}>Swap…</button>
					{/if}
				</div>
			{:else}
				<p class="kicker"><span class="dot"></span>No watch on</p>
				<h1 class="watch-name quip">{data.quip}</h1>
				{#if data.state.watches.length === 0}
					<!-- The PWA opens straight onto this page, so a brand-new account
					     needs a first step here — not a picker with zero options. -->
					<p class="empty-lead">Add your first watch to start logging wear.</p>
					<div class="actions">
						<a class="button primary" href="/watches/new">Add a watch</a>
					</div>
				{:else if data.state.valid_actions.includes('put_on')}
					<div class="actions">
						<button type="button" class="primary" onclick={() => picker?.showModal()}>
							Put on a watch…
						</button>
					</div>
				{/if}
			{/if}
			{#if data.stale}
				<p class="nudge">⚠️ Still wearing this? Fix it in the timeline.</p>
			{/if}

			{#if data.state.watches.length > 0}
			<dialog bind:this={picker} closedby="any" aria-labelledby="picker-title">
				<p class="dialog-kicker" id="picker-title">{data.state.wearing ? 'Swap to' : 'Put on'}</p>
				<form
					method="POST"
					action={data.state.wearing ? '?/swap' : '?/putOn'}
					use:enhance={pickWatch}
				>
					<div class="picker-list">
						{#each data.state.watches as w (w.id)}
							<button type="submit" name="watch_id" value={w.id}>{w.label}</button>
						{/each}
					</div>
				</form>
				<!-- autofocus: showModal() otherwise focuses the first watch button,
				     which iOS Safari renders with a focus ring that reads as a
				     pre-selected watch. Cancel is the one safe place to land. -->
				<!-- svelte-ignore a11y_autofocus -->
				<button type="button" class="picker-cancel" autofocus onclick={() => picker?.close()}>Cancel</button>
			</dialog>
			{/if}
		</section>

		{#if data.allWatches.length > 0}
		<details class="card backfill">
			<summary>Backfill a session…</summary>
			<form method="POST" action="?/backfill" use:enhance={withPending()}>
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
		{/if}
	</div>

	<div class="history">
		<h2>Timeline</h2>
		{#if data.sessions.length === 0}
			<p class="muted timeline-empty">No sessions yet — they'll show up here as you log wear.</p>
		{:else}
			<ul class="timeline">
				{#each data.sessions as s (s.id)}
					<SessionRow {s} watches={data.allWatches} homeTz={data.homeTz} />
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.wear {
		text-align: center;
		margin-bottom: 0.75rem;
		padding: 1.4rem 1rem 1.2rem;
	}
	.wear.stale {
		border-color: var(--danger);
	}
	.kicker {
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 0.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
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
	.watch-name {
		font-size: 1.5rem;
		margin: 0;
		line-height: 1.25;
	}
	.watch-name.quip {
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--fg-muted);
	}
	.sub {
		font-size: 0.9rem;
		color: var(--fg-muted);
		margin: 0.3rem 0 0;
	}
	.nudge {
		margin: 0.6rem 0 0;
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
		display: flex;
		justify-content: center;
		gap: 0.6rem;
		margin-top: 1.1rem;
	}
	/* the Take Off form is a flex child; let its button fill it */
	.actions form {
		display: contents;
	}
	.actions button,
	.actions .button {
		flex: 1 1 0;
		max-width: 10.5rem;
		padding-block: 0.55rem;
	}
	.empty-lead {
		margin: 0.75rem 0 0;
		color: var(--fg-muted);
	}
	.timeline-empty {
		margin: 0 0 2rem;
	}
	dialog {
		background: var(--bg-raised);
		color: var(--fg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 1rem;
		width: min(22rem, calc(100vw - 2rem));
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.35);
	}
	.dialog-kicker {
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 0.6rem;
		text-align: left;
	}
	.picker-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		max-height: 55dvh;
		overflow-y: auto;
	}
	.picker-list button {
		width: 100%;
		padding: 0.6rem 0.9rem;
	}
	.picker-cancel {
		width: 100%;
		margin-top: 0.75rem;
		color: var(--fg-muted);
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

	@media (min-width: 60rem) {
		.page {
			display: grid;
			grid-template-columns: minmax(20rem, 24rem) 1fr;
			gap: 0 2rem;
			align-items: start;
		}
		.rail {
			position: sticky;
			top: 1rem;
			/* never pin content out of reach on short viewports */
			max-height: calc(100dvh - 2rem);
			overflow-y: auto;
		}
		.history h2 {
			margin-top: 0;
		}
	}
</style>
