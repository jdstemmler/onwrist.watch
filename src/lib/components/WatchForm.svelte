<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Watch, WatchPhoto } from '$lib/server/db/schema';

	let { watch, photos }: { watch?: Watch; photos?: WatchPhoto[] } = $props();

	const editing = $derived(watch != null);
	const centsToDollars = (cents: number | null | undefined) =>
		cents == null ? '' : (cents / 100).toFixed(2);
	const message = $derived(page.form?.message as string | undefined);
</script>

<header class="head">
	<h1>{editing ? 'Edit watch' : 'Add watch'}</h1>
	{#if editing}
		<a class="back" href="/watches/{watch!.id}">Back to watch</a>
	{:else}
		<a class="back" href="/">Back to collection</a>
	{/if}
</header>

{#if message}
	<p class="error" role="alert">{message}</p>
{/if}

<form
	method="POST"
	action={editing ? '?/update' : undefined}
	enctype="multipart/form-data"
	use:enhance
>
	<fieldset>
		<legend>Watch</legend>
		<div class="fields">
			<label>Brand <span class="req">*</span>
				<input name="brand" required value={watch?.brand ?? ''} />
			</label>
			<label>Model <span class="req">*</span>
				<input name="model" required value={watch?.model ?? ''} />
			</label>
			<label>Nickname
				<input name="nickname" value={watch?.nickname ?? ''} placeholder="e.g. Speedy" />
			</label>
			<label>Reference no.
				<input name="referenceNo" value={watch?.referenceNo ?? ''} />
			</label>
			<label>Dial color
				<input name="dialColor" value={watch?.dialColor ?? ''} />
			</label>
			<label>Movement
				<select name="movement">
					<option value="" selected={watch?.movement == null}>—</option>
					{#each ['automatic', 'manual', 'quartz', 'solar', 'other'] as m}
						<option value={m} selected={watch?.movement === m}>{m}</option>
					{/each}
				</select>
			</label>
			<label>Case (mm)
				<input name="caseMm" type="number" step="0.1" min="0" value={watch?.caseMm ?? ''} />
			</label>
			<label>Lug width (mm)
				<input name="lugMm" type="number" step="0.1" min="0" value={watch?.lugMm ?? ''} />
			</label>
			<label>Water resistance (m)
				<input name="waterResistanceM" type="number" step="1" min="0" value={watch?.waterResistanceM ?? ''} />
			</label>
			<label class="wide">Strap notes
				<input name="strapNotes" value={watch?.strapNotes ?? ''} />
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Purchase</legend>
		<div class="fields">
			<label>Purchase date
				<input name="purchaseDate" type="date" value={watch?.purchaseDate ?? ''} />
			</label>
			<label>Price paid ($)
				<input name="pricePaid" type="number" step="0.01" min="0" value={centsToDollars(watch?.pricePaidCents)} />
			</label>
			<label>Purchased from
				<input name="purchasedFrom" value={watch?.purchasedFrom ?? ''} />
			</label>
			<label>Box &amp; papers
				<select name="boxPapers">
					<option value="" selected={watch?.boxPapers == null}>—</option>
					{#each ['none', 'box', 'papers', 'both'] as b}
						<option value={b} selected={watch?.boxPapers === b}>{b}</option>
					{/each}
				</select>
			</label>
			<label>Condition
				<input name="condition" value={watch?.condition ?? ''} placeholder="e.g. excellent" />
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Status</legend>
		<div class="fields">
			<label>Status
				<select name="status">
					<option value="owned" selected={(watch?.status ?? 'owned') === 'owned'}>owned</option>
					<option value="sold" selected={watch?.status === 'sold'}>sold</option>
				</select>
			</label>
			<label>Sold date
				<input name="soldDate" type="date" value={watch?.soldDate ?? ''} />
			</label>
			<label>Sold price ($)
				<input name="soldPrice" type="number" step="0.01" min="0" value={centsToDollars(watch?.soldPriceCents)} />
			</label>
			<label class="wide">Notes
				<textarea name="notes" rows="3">{watch?.notes ?? ''}</textarea>
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Photos</legend>
		{#if editing && photos?.length}
			<ul class="photos">
				{#each photos as p (p.id)}
					<li class:primary={p.isPrimary}>
						<img src="/photos/{p.filePath}" alt="" />
						{#if p.isPrimary}
							<span class="badge">Primary</span>
						{:else}
							<button formaction="?/setPrimary" formnovalidate name="photoId" value={p.id} class="small">
								Set primary
							</button>
						{/if}
						<button formaction="?/deletePhoto" formnovalidate name="photoId" value={p.id} class="small danger">
							Delete
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<label class="wide">{editing ? 'Add photo' : 'Photo'}
			<input name="photo" type="file" accept="image/*" />
		</label>
	</fieldset>

	<div class="actions">
		<button class="primary" type="submit">{editing ? 'Save changes' : 'Add watch'}</button>
		{#if editing}
			<button
				class="danger"
				formaction="?/delete"
				formnovalidate
				onclick={(e) => {
					if (!confirm('Delete this watch and all its wear history?')) e.preventDefault();
				}}
			>
				Delete watch
			</button>
		{/if}
	</div>
</form>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 1rem;
	}

	.head h1 {
		margin: 0;
	}

	.back {
		font-size: 0.85rem;
	}

	.error {
		color: var(--danger);
		border: 1px solid var(--danger);
		border-radius: var(--radius);
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, var(--danger) 7%, transparent);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-raised);
		box-shadow: var(--shadow);
		padding: 1rem 1.1rem 1.2rem;
		margin: 0;
	}

	legend {
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 0.95rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: 0 0.4rem;
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.9rem 1.1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.82rem;
		color: var(--fg-muted);
	}

	label.wide {
		grid-column: 1 / -1;
	}

	input,
	select,
	textarea {
		color: var(--fg);
		width: 100%;
	}

	textarea {
		resize: vertical;
	}

	.req {
		color: var(--accent);
	}

	.photos {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
		gap: 0.9rem;
		margin: 0 0 1rem;
		padding: 0;
	}

	.photos li {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem;
		background: var(--bg);
	}

	.photos li.primary {
		border-color: var(--accent);
	}

	.photos img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: calc(var(--radius) - 3px);
	}

	.badge {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--accent);
		text-align: center;
		padding: 0.3rem 0;
	}

	button.small {
		font-size: 0.78rem;
		padding: 0.3rem 0.5rem;
	}

	.actions {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
</style>
