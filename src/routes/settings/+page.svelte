<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const resultFor = (action: string) => (form?.action === action ? form : undefined);
</script>

<svelte:head>
	<title>Settings — {data.appName}</title>
</svelte:head>

<div class="settings">
	<header class="head">
		<h1>Settings</h1>
		<a class="back" href="/log">Back to wear log</a>
	</header>

	<section class="card">
		<p class="kicker left-align"><span class="dot" class:on={data.verified}></span>Account</p>
		<p class="muted">Signed in as <span class="num">{data.email}</span></p>
		{#if !data.verified}
			<div class="verify-row">
				<p class="warn">Not verified yet — some actions are locked until you confirm your email.</p>
				{#if resultFor('resendVerify')?.sent}
					<span class="success">Sent — check your inbox.</span>
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
				<input type="password" name="newPassword" autocomplete="new-password" minlength="10" required />
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
				<p class="success wide">Check the new address — we sent a confirmation link.</p>
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
				<p class="success wide">Saved.</p>
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

	<fieldset class="danger-zone">
		<legend>Delete account</legend>
		<form method="POST" action="?/deleteAccount" use:enhance class="fields">
			<p class="muted wide">
				Deletes your account and everything in it — watches, wear history, and photos. This is
				permanent.
			</p>
			{#if resultFor('deleteAccount')?.message}
				<p class="error wide" role="alert">{resultFor('deleteAccount')?.message}</p>
			{/if}
			<label class="field"><span class="lbl">Current password</span>
				<input type="password" name="currentPassword" autocomplete="current-password" required />
			</label>
			<label class="field"><span class="lbl">Type <span class="num">{data.email}</span> to confirm</span>
				<input type="email" name="confirmEmail" autocomplete="off" required />
			</label>
			<div class="wide actions">
				<button type="submit" class="danger">Delete account</button>
			</div>
		</form>
	</fieldset>
</div>

<style>
	/* Cap the content column so cards size to their content instead of
	   stretching to `main`'s full 64rem width at ~40% occupancy. */
	.settings {
		max-width: 45rem;
	}

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

	/* .kicker/.dot/.dot.on come from app.css; this page's kicker sits in a
	   left-aligned card (unlike the centered auth-gate cards), so it keeps
	   its own alignment + spacing. */
	.kicker.left-align {
		justify-content: flex-start;
		margin: 0 0 0.5rem;
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

	/* fieldset/legend/.fields come from app.css; this page stacks its
	   sections with a margin rather than a form gap */
	fieldset {
		margin-bottom: 1.25rem;
	}

	.actions {
		display: flex;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0;
	}

	.danger-zone {
		border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
	}

	.danger-zone legend {
		color: var(--danger);
		border-bottom-color: color-mix(in srgb, var(--danger) 30%, var(--border));
	}

	.danger-zone .muted {
		margin: 0;
	}
</style>
