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


	// Notes live behind a pencil icon + <dialog> so the logger stays compact;
	// the textarea sits inside its action's <form>, so the value submits
	// normally. Pencil shows an active state while a note is pending.
	let notes = $state({ putOn: '', swap: '', takeOff: '' });
	let noteDialogs: Partial<Record<keyof typeof notes, HTMLDialogElement>> = {};

	const clearNotes = () => {
		notes.putOn = notes.swap = notes.takeOff = '';
	};
	// after a successful action, reset pending notes along with the form;
	// withPending disables the submitter while the request is in flight
	const submitAndClear = withPending(
		() =>
			async ({ update }: { update: () => Promise<void> }) => {
				await update();
				clearNotes();
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
		<section class="banner card" class:stale={data.stale}>
			{#if data.state.wearing}
				<p class="kicker"><span class="dot on"></span>On wrist</p>
				<h1 class="watch-name">{data.state.wearing.label}</h1>
				<p class="sub num">
					since {fmtTime(data.state.wearing.since)} · {elapsed(data.state.wearing.since)}
				</p>
				{#if data.state.valid_actions.includes('take_off')}
					<form
						method="POST"
						action="?/takeOff"
						use:enhance={submitAndClear}
						class="action-row banner-action"
					>
						<button type="submit" class="primary off">Take Off</button>
						<button
							type="button"
							class="note-btn"
							class:pending={notes.takeOff.length > 0}
							title="Add a note"
							aria-label="Add a note"
							onclick={() => noteDialogs.takeOff?.showModal()}
						>
							&#9998;
						</button>
						<dialog bind:this={noteDialogs.takeOff} closedby="any">
							<p class="dialog-kicker">Note — take off</p>
							<textarea name="note" rows="3" placeholder="optional" bind:value={notes.takeOff}></textarea>
							<div class="dialog-actions">
								<button type="button" onclick={() => { notes.takeOff = ''; noteDialogs.takeOff?.close(); }}>
									Clear
								</button>
								<button type="button" class="primary" onclick={() => noteDialogs.takeOff?.close()}>
									Done
								</button>
							</div>
						</dialog>
					</form>
				{/if}
			{:else}
				<p class="kicker"><span class="dot"></span>No watch on</p>
				<h1 class="watch-name quip">{data.quip}</h1>
			{/if}
			{#if data.stale}
				<p class="nudge">⚠️ Still wearing this? Fix it in the timeline.</p>
			{/if}
		</section>

		{#if data.state.watches.length === 0 && !data.state.wearing}
			<!-- The PWA opens straight onto this page, so a brand-new account needs a
			     first step here — not a required select with zero options. -->
			<section class="logger card empty">
				<p class="empty-lead">Add your first watch to start logging wear.</p>
				<a class="button primary" href="/watches/new">Add a watch</a>
			</section>
		{:else}
		<section class="logger card">
			{#if data.state.valid_actions.includes('put_on')}
				<form method="POST" action="?/putOn" use:enhance={submitAndClear} class="action-form">
					<p class="kicker form-kicker">Put on</p>
					<div class="action-row">
						<select name="watch_id" required aria-label="Watch to put on">
							<option value="" disabled selected>Pick a watch…</option>
							{#each data.state.watches as w (w.id)}
								<option value={w.id}>{w.label}</option>
							{/each}
						</select>
						<button type="submit" class="primary">Put On</button>
						<button
							type="button"
							class="note-btn"
							class:pending={notes.putOn.length > 0}
							title="Add a note"
							aria-label="Add a note"
							onclick={() => noteDialogs.putOn?.showModal()}
						>
							&#9998;
						</button>
					</div>
					<dialog bind:this={noteDialogs.putOn} closedby="any">
						<p class="dialog-kicker">Note — put on</p>
						<textarea name="note" rows="3" placeholder="optional" bind:value={notes.putOn}></textarea>
						<div class="dialog-actions">
							<button type="button" onclick={() => { notes.putOn = ''; noteDialogs.putOn?.close(); }}>
								Clear
							</button>
							<button type="button" class="primary" onclick={() => noteDialogs.putOn?.close()}>
								Done
							</button>
						</div>
					</dialog>
				</form>
			{/if}

			{#if data.state.valid_actions.includes('swap')}
				<form method="POST" action="?/swap" use:enhance={submitAndClear} class="action-form">
					<p class="kicker form-kicker">Swap to</p>
					<div class="action-row">
						<select name="watch_id" required aria-label="Watch to swap to">
							<option value="" disabled selected>Pick a watch…</option>
							{#each data.state.watches as w (w.id)}
								<option value={w.id}>{w.label}</option>
							{/each}
						</select>
						<button type="submit" class="primary">Swap</button>
						<button
							type="button"
							class="note-btn"
							class:pending={notes.swap.length > 0}
							title="Add a note"
							aria-label="Add a note"
							onclick={() => noteDialogs.swap?.showModal()}
						>
							&#9998;
						</button>
					</div>
					<dialog bind:this={noteDialogs.swap} closedby="any">
						<p class="dialog-kicker">Note — swap</p>
						<textarea name="note" rows="3" placeholder="optional" bind:value={notes.swap}></textarea>
						<div class="dialog-actions">
							<button type="button" onclick={() => { notes.swap = ''; noteDialogs.swap?.close(); }}>
								Clear
							</button>
							<button type="button" class="primary" onclick={() => noteDialogs.swap?.close()}>
								Done
							</button>
						</div>
					</dialog>
				</form>
			{/if}
		</section>
		{/if}

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
	.banner {
		text-align: center;
		margin-bottom: 1rem;
		padding-block: 1.25rem;
	}
	.banner.stale {
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
	.logger {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
		max-width: 34rem;
		margin-inline: auto;
		padding: 0.75rem;
	}
	.logger.empty {
		align-items: center;
		text-align: center;
		padding: 1.5rem 1rem;
	}
	.empty-lead {
		margin: 0;
		color: var(--fg-muted);
	}
	.timeline-empty {
		margin: 0 0 2rem;
	}
	.action-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}
	.action-row select {
		flex: 1 1 8rem;
		min-width: 0;
		color: var(--fg);
	}
	.action-row button.primary {
		flex: 0 0 auto;
	}
	.action-row button.off {
		flex: 1 1 auto;
	}
	.banner-action {
		margin-top: 0.9rem;
		max-width: 18rem;
		margin-inline: auto;
	}
	.action-form {
		display: flex;
		flex-direction: column;
	}
	.form-kicker {
		justify-content: flex-start;
		margin-bottom: 0.45rem;
	}
	.note-btn {
		flex: 0 0 2.5rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		color: var(--fg-muted);
		padding: 0;
	}
	.note-btn.pending {
		color: var(--accent-fg);
		background: var(--accent);
		border-color: var(--accent);
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
	}
	dialog textarea {
		width: 100%;
		color: var(--fg);
		resize: vertical;
	}
	.dialog-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.75rem;
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
		}
		.history h2 {
			margin-top: 0;
		}
	}
</style>
