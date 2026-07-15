<script lang="ts">
	import { enhance } from '$app/forms';

	type Session = {
		id: number;
		watchId: number;
		startedAt: Date;
		endedAt: Date | null;
		note: string | null;
		label: string;
		startedLocal: string;
		endedLocal: string;
	};

	let { s, watches }: { s: Session; watches: { id: number; label: string }[] } = $props();

	function fmtRange(start: Date, end: Date | null): string {
		const startStr = new Date(start).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
		if (!end) return `${startStr} – now`;
		const endStr = new Date(end).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
		return `${startStr} – ${endStr}`;
	}

	function duration(start: Date, end: Date | null): string {
		const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
		const totalMin = Math.max(0, Math.round(ms / 60_000));
		const h = Math.floor(totalMin / 60);
		const m = totalMin % 60;
		return h > 0 ? `${h}h ${m}m` : `${m}m`;
	}
</script>

<li class="card row">
	<div class="summary">
		<strong>{s.label}</strong>
		<span class="range num">{fmtRange(s.startedAt, s.endedAt)}</span>
		<span class="duration num muted">{duration(s.startedAt, s.endedAt)}</span>
	</div>
	{#if s.note}
		<p class="note"><em>{s.note}</em></p>
	{/if}

	<details>
		<summary>Edit</summary>
		<form method="POST" action="?/update" use:enhance class="edit-form">
			<input type="hidden" name="id" value={s.id} />
			<!-- Original prefill strings, compared server-side so an unedited field
			     falls through to the stored Date instead of being re-parsed (lossy
			     across the DST fall-back hour). -->
			<input type="hidden" name="started_at_orig" value={s.startedLocal} />
			<input type="hidden" name="ended_at_orig" value={s.endedLocal} />
			<label class="field">
				<span class="lbl">Watch</span>
				<select name="watch_id" required>
					{#each watches as w (w.id)}
						<option value={w.id} selected={w.id === s.watchId}>{w.label}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span class="lbl">Start</span>
				<input type="datetime-local" name="started_at" value={s.startedLocal} required />
			</label>
			<label class="field">
				<span class="lbl">End <span class="muted">(blank = still wearing)</span></span>
				<input type="datetime-local" name="ended_at" value={s.endedLocal} />
			</label>
			<label class="field">
				<span class="lbl">Note</span>
				<textarea name="note" rows="2">{s.note ?? ''}</textarea>
			</label>
			<button type="submit" class="primary">Save</button>
		</form>
		<form
			method="POST"
			action="?/delete"
			use:enhance
			onsubmit={(e) => !confirm('Delete this session?') && e.preventDefault()}
		>
			<input type="hidden" name="id" value={s.id} />
			<button type="submit" class="danger">Delete</button>
		</form>
	</details>
</li>

<style>
	.row {
		padding: 0.85rem 1rem;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.75rem;
	}
	.summary strong {
		font-family: var(--font-display);
	}
	.duration {
		font-size: 0.85rem;
	}
	.note {
		margin: 0.35rem 0 0;
	}
	details {
		margin-top: 0.5rem;
	}
	details summary {
		cursor: pointer;
		color: var(--accent);
		font-weight: 600;
		font-size: 0.9rem;
	}
	details[open] {
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
	.edit-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0.75rem 0 0.5rem;
		max-width: 30rem;
	}
	.edit-form button {
		align-self: flex-start;
		min-width: 8rem;
	}
	details > form:last-child {
		margin-top: 0.5rem;
	}
	details > form:last-child button {
		font-size: 0.85rem;
		padding: 0.35rem 0.7rem;
	}
</style>
