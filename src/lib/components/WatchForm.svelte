<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Watch, WatchPhoto } from '$lib/server/db/schema';
	import { photoUrl } from '$lib/watch-label';

	let { watch, photos }: { watch?: Watch; photos?: WatchPhoto[] } = $props();

	const editing = $derived(watch != null);
	let isGift = $state(false);
	$effect(() => {
		isGift = watch?.isGift ?? false;
	});
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
	<p class="error-banner" role="alert">{message}</p>
{/if}

<form
	method="POST"
	action={editing ? '?/update' : undefined}
	enctype="multipart/form-data"
	use:enhance={() =>
		async ({ update }) => {
			// keep field values after photo delete/set-primary actions —
			// the default reset() blanks Svelte-rendered inputs
			await update({ reset: false });
		}}
>
	<fieldset>
		<legend>Watch</legend>
		<div class="fields">
			<label class="field"><span class="lbl">Brand <span class="req">*</span></span>
				<input name="brand" required value={watch?.brand ?? ''} />
			</label>
			<label class="field"><span class="lbl">Model <span class="req">*</span></span>
				<input name="model" required value={watch?.model ?? ''} />
			</label>
			<label class="field"><span class="lbl">Nickname</span>
				<input name="nickname" value={watch?.nickname ?? ''} placeholder="e.g. Speedy" />
			</label>
			<label class="field"><span class="lbl">Reference no.</span>
				<input name="referenceNo" value={watch?.referenceNo ?? ''} />
			</label>
			<label class="field"><span class="lbl">Serial no.</span>
				<input name="serialNo" value={watch?.serialNo ?? ''} />
			</label>
			<label class="field"><span class="lbl">Dial color</span>
				<input name="dialColor" value={watch?.dialColor ?? ''} />
			</label>
			<label class="field"><span class="lbl">Movement</span>
				<select name="movement">
					<option value="" selected={watch?.movement == null}>—</option>
					{#each ['automatic', 'manual', 'quartz', 'solar', 'other'] as m}
						<option value={m} selected={watch?.movement === m}>{m}</option>
					{/each}
				</select>
			</label>
			<label class="field"><span class="lbl">Case (mm)</span>
				<input name="caseMm" type="number" step="0.1" min="0" value={watch?.caseMm ?? ''} />
			</label>
			<label class="field"><span class="lbl">Lug width (mm)</span>
				<input name="lugMm" type="number" step="0.1" min="0" value={watch?.lugMm ?? ''} />
			</label>
			<label class="field"><span class="lbl">Water resistance (m)</span>
				<input name="waterResistanceM" type="number" step="1" min="0" value={watch?.waterResistanceM ?? ''} />
			</label>
			<label class="field wide"><span class="lbl">Strap notes</span>
				<input name="strapNotes" value={watch?.strapNotes ?? ''} />
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Purchase</legend>
		<div class="fields">
			<label class="check">
				<input type="checkbox" name="isGift" bind:checked={isGift} />
				<span>This was a gift</span>
				{#if isGift}<span class="muted">— excluded from cost-per-wear</span>{/if}
			</label>
			<label class="field"><span class="lbl">{isGift ? 'Received date' : 'Purchase date'}</span>
				<input name="purchaseDate" type="date" value={watch?.purchaseDate ?? ''} />
			</label>
			<label class="field"><span class="lbl">{isGift ? 'Est. value ($)' : 'Price paid ($)'}</span>
				<input name="pricePaid" type="number" step="0.01" min="0" value={centsToDollars(watch?.pricePaidCents)} />
			</label>
			<label class="field"><span class="lbl">Purchased from</span>
				<input name="purchasedFrom" value={watch?.purchasedFrom ?? ''} />
			</label>
			<label class="field"><span class="lbl">Box &amp; papers</span>
				<select name="boxPapers">
					<option value="" selected={watch?.boxPapers == null}>—</option>
					{#each ['none', 'box', 'papers', 'both'] as b}
						<option value={b} selected={watch?.boxPapers === b}>{b}</option>
					{/each}
				</select>
			</label>
			<label class="field"><span class="lbl">Condition</span>
				<input name="condition" value={watch?.condition ?? ''} placeholder="e.g. excellent" />
			</label>
			<label class="field"><span class="lbl">Last serviced</span>
				<input name="lastServiced" type="date" value={watch?.lastServiced ?? ''} />
			</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Status</legend>
		<div class="fields">
			<label class="field"><span class="lbl">Status</span>
				<select name="status">
					<option value="owned" selected={(watch?.status ?? 'owned') === 'owned'}>owned</option>
					<option value="sold" selected={watch?.status === 'sold'}>sold</option>
				</select>
			</label>
			<label class="field"><span class="lbl">Sold date</span>
				<input name="soldDate" type="date" value={watch?.soldDate ?? ''} />
			</label>
			<label class="field"><span class="lbl">Sold price ($)</span>
				<input name="soldPrice" type="number" step="0.01" min="0" value={centsToDollars(watch?.soldPriceCents)} />
			</label>
			<label class="field wide"><span class="lbl">Notes</span>
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
						<img src={photoUrl(p.filePath)} alt="" />
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
		<label class="field wide"><span class="lbl">{editing ? 'Add photo' : 'Photo'}</span>
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

	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* fieldset/legend/.fields come from app.css; direct children of the
	   Photos fieldset sit outside a .fields grid and must clear the
	   floated legend too */
	fieldset > label,
	.photos {
		clear: both;
	}

	.check {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--fg-muted);
	}

	.check input {
		min-height: 0;
		width: 1.05rem;
		height: 1.05rem;
		accent-color: var(--accent);
	}

	textarea {
		resize: vertical;
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

	/* type/color come from the global .badge; center it in the photo card */
	.badge {
		text-align: center;
		padding: 0.3rem 0;
	}

	.actions {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.actions button {
		min-width: 10rem;
	}

	@media (max-width: 30rem) {
		.actions {
			flex-direction: column;
		}

		.actions button {
			width: 100%;
		}
	}
</style>
