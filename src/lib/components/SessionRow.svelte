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

	let {
		s,
		watches,
		homeTz
	}: { s: Session; watches: { id: number; label: string }[]; homeTz: string } = $props();

	// A sold watch's sessions stay in the timeline but its watch is absent
	// from the owned-watch dropdown — without its own entry the browser would
	// auto-select the first option and Save would silently move the session
	// onto a different watch.
	const editWatches = $derived(
		watches.some((w) => w.id === s.watchId) ? watches : [{ id: s.watchId, label: s.label }, ...watches]
	);

	// Times render in the user's homeTz (matching the edit-form prefills three
	// lines below), not the server/device timezone.
	const dayFmt = $derived(
		new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: homeTz })
	);
	const timeFmt = $derived(
		new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: homeTz })
	);

	function fmtRange(start: Date, end: Date | null): string {
		const startStr = `${dayFmt.format(new Date(start))}, ${timeFmt.format(new Date(start))}`;
		if (!end) return `${startStr} – now`;
		const e = new Date(end);
		// Repeat the date on the end side when the session crosses local
		// midnight, so "9:00 PM – 8:00 AM" can't read as a same-day range.
		const sameDay = dayFmt.format(new Date(start)) === dayFmt.format(e);
		const endStr = sameDay ? timeFmt.format(e) : `${dayFmt.format(e)}, ${timeFmt.format(e)}`;
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
		<form method="POST" action="?/update" use:enhance class="edit-form" id={"edit-" + s.id}>
			<input type="hidden" name="id" value={s.id} />
			<!-- Original prefill strings, compared server-side so an unedited field
			     falls through to the stored Date instead of being re-parsed (lossy
			     across the DST fall-back hour). -->
			<input type="hidden" name="started_at_orig" value={s.startedLocal} />
			<input type="hidden" name="ended_at_orig" value={s.endedLocal} />
			<label class="field">
				<span class="lbl">Watch</span>
				<select name="watch_id" required>
					{#each editWatches as w (w.id)}
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
		</form>
		<!-- The confirm must cancel inside the enhance callback: use:enhance
		     replaces the native submit, so an onsubmit preventDefault() would
		     be ignored and Cancel would still delete. -->
		<form
			method="POST"
			action="?/delete"
			id={"delete-" + s.id}
			use:enhance={({ cancel }) => {
				if (!confirm('Delete this session?')) cancel();
			}}
		>
			<input type="hidden" name="id" value={s.id} />
		</form>
		<div class="edit-actions">
			<button type="submit" form={"edit-" + s.id} class="primary">Save</button>
			<button type="submit" form={"delete-" + s.id} class="danger">Delete</button>
		</div>
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
		margin: 0.75rem 0 0;
		max-width: 30rem;
	}
	.edit-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.75rem;
	}
	.edit-actions button {
		min-width: 8rem;
	}
</style>
