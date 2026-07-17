<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const resultFor = (action: string) => (form?.action === action ? form : undefined);
</script>

<svelte:head>
	<title>Settings — {data.appName}</title>
</svelte:head>

<header class="head">
	<h1>Settings</h1>
	<a class="back" href="/log">Back to wear log</a>
</header>

<section class="card">
	<p class="kicker"><span class="dot" class:on={data.verified}></span>Regulation</p>
	<p class="muted">Signed in as <span class="num">{data.email}</span></p>
	{#if !data.verified}
		<div class="verify-row">
			<p class="warn">Not verified yet — some actions are locked until you confirm your email.</p>
			{#if resultFor('resendVerify')?.sent}
				<span class="ok">Sent — check your inbox.</span>
			{:else}
				<form method="POST" action="/settings?/resendVerify" use:enhance>
					{#if resultFor('resendVerify')?.message}
						<p class="error" role="alert">{resultFor('resendVerify')?.message}</p>
					{/if}
					<button type="submit" class="small">Resend verification email</button>
				</form>
			{/if}
		</div>
	{/if}
</section>

<fieldset>
	<legend>Password</legend>
	<form method="POST" action="?/password" use:enhance class="fields">
		{#if resultFor('password')?.message}
			<p class="error wide" role="alert">{resultFor('password')?.message}</p>
		{/if}
		<label class="field"><span class="lbl">Current password</span>
			<input type="password" name="currentPassword" autocomplete="current-password" required />
		</label>
		<label class="field"><span class="lbl">New password</span>
			<input type="password" name="newPassword" autocomplete="new-password" required />
		</label>
		<div class="wide actions">
			<button type="submit" class="primary">Change password</button>
		</div>
	</form>
</fieldset>

<fieldset>
	<legend>Email</legend>
	<form method="POST" action="?/email" use:enhance class="fields">
		{#if resultFor('email')?.sent}
			<p class="ok wide">Check the new address — we sent a confirmation link.</p>
		{/if}
		{#if resultFor('email')?.message}
			<p class="error wide" role="alert">{resultFor('email')?.message}</p>
		{/if}
		<label class="field"><span class="lbl">Current password</span>
			<input type="password" name="currentPassword" autocomplete="current-password" required />
		</label>
		<label class="field"><span class="lbl">New email</span>
			<input type="email" name="newEmail" autocomplete="email" required />
		</label>
		<div class="wide actions">
			<button type="submit" class="primary">Change email</button>
		</div>
	</form>
</fieldset>

<fieldset>
	<legend>Preferences</legend>
	<form method="POST" action="?/prefs" use:enhance class="fields">
		{#if resultFor('prefs')?.saved}
			<p class="ok wide">Saved.</p>
		{/if}
		{#if resultFor('prefs')?.message}
			<p class="error wide" role="alert">{resultFor('prefs')?.message}</p>
		{/if}
		<label class="field"><span class="lbl">Home timezone</span>
			<select name="homeTz">
				{#each data.timeZones as tz (tz)}
					<option value={tz} selected={tz === data.homeTz}>{tz}</option>
				{/each}
			</select>
		</label>
		<label class="field"><span class="lbl">Stale-session nudge (hours)</span>
			<input
				type="number"
				name="staleSessionHours"
				min="1"
				max="168"
				step="1"
				value={data.staleSessionHours}
				required
			/>
		</label>
		<div class="wide actions">
			<button type="submit" class="primary">Save preferences</button>
		</div>
	</form>
</fieldset>

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

	.card {
		margin-bottom: 1.25rem;
	}

	.kicker {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--fg-muted);
		margin: 0 0 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.verify-row {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}

	.warn {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
	}

	.ok {
		color: var(--accent);
		font-size: 0.85rem;
	}

	fieldset {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-raised);
		box-shadow: var(--shadow);
		padding: 1.1rem 1.1rem 1.2rem;
		margin: 0 0 1.25rem;
	}

	legend {
		float: left;
		width: 100%;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-muted);
		padding: 0 0 0.5rem;
		margin: 0 0 1rem;
		border-bottom: 1px solid var(--border);
	}

	fieldset::after {
		content: '';
		display: block;
		clear: both;
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 1rem 1.25rem;
		clear: both;
	}

	.wide {
		grid-column: 1 / -1;
	}

	.actions {
		display: flex;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0;
	}
</style>
