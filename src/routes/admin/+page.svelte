<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const fmtDate = (d: string | Date | null) =>
		d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never';

	function humanBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let v = n;
		let i = -1;
		do {
			v /= 1024;
			i++;
		} while (v >= 1024 && i < units.length - 1);
		return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
	}

	function confirmEnhance(message: string) {
		return ({ cancel }: { cancel: () => void }) => {
			if (!confirm(message)) cancel();
		};
	}
</script>

<svelte:head>
	<title>Admin — {data.appName}</title>
</svelte:head>

<header class="row">
	<h1>Admin</h1>
	<span class="muted">{data.users.length} account{data.users.length === 1 ? '' : 's'}</span>
</header>

{#if form?.message}
	<p class="error-banner" role="alert">{form.message}</p>
{/if}

<div class="table-wrap">
	<table class="admin">
		<thead>
			<tr>
				<th>Email</th>
				<th>Role</th>
				<th>Verified</th>
				<th>Status</th>
				<th class="num">Watches</th>
				<th class="num">Storage</th>
				<th>Last active</th>
				<th class="num">Quota</th>
				<th class="actions-col">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				<tr class:disabled={u.disabled}>
					<td>{u.email}</td>
					<td>{u.role}</td>
					<td class="center">{u.verified ? '✓' : '—'}</td>
					<td>{u.disabled ? 'disabled' : 'active'}</td>
					<td class="num">{u.watchCount}</td>
					<td class="num">{humanBytes(u.storageBytes)}</td>
					<td>{fmtDate(u.lastActiveAt)}</td>
					<td class="num quota">
						<form
							method="POST"
							action="?/quota"
							use:enhance
							class="inline"
						>
							<input type="hidden" name="userId" value={u.id} />
							<input type="hidden" name="quotaMultiplier" value={Math.max(1, u.quotaMultiplier - 1)} />
							<button type="submit" class="small" disabled={u.quotaMultiplier <= 1} aria-label="Decrease quota">
								&minus;
							</button>
						</form>
						<span class="quota-value">{u.quotaMultiplier}&times;</span>
						<form method="POST" action="?/quota" use:enhance class="inline">
							<input type="hidden" name="userId" value={u.id} />
							<input type="hidden" name="quotaMultiplier" value={u.quotaMultiplier + 1} />
							<button type="submit" class="small" aria-label="Increase quota">&plus;</button>
						</form>
					</td>
					<td class="actions">
						{#if !u.verified}
							<form method="POST" action="?/resend" use:enhance class="inline">
								<input type="hidden" name="userId" value={u.id} />
								<button type="submit" class="small">Resend verify</button>
							</form>
						{/if}
						{#if u.disabled}
							<form method="POST" action="?/enable" use:enhance class="inline">
								<input type="hidden" name="userId" value={u.id} />
								<button type="submit" class="small">Enable</button>
							</form>
						{:else if u.role !== 'admin'}
							<form
								method="POST"
								action="?/disable"
								use:enhance={confirmEnhance(`Disable ${u.email}? This revokes all of their sessions.`)}
								class="inline"
							>
								<input type="hidden" name="userId" value={u.id} />
								<button type="submit" class="small">Disable</button>
							</form>
						{/if}
						{#if u.role !== 'admin'}
							<form
								method="POST"
								action="?/delete"
								use:enhance={confirmEnhance(`Permanently delete ${u.email} and all their watches, photos, and wear history? This can't be undone.`)}
								class="inline"
							>
								<input type="hidden" name="userId" value={u.id} />
								<button type="submit" class="small danger">Delete</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-raised);
	}

	table.admin {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		white-space: nowrap;
	}

	table.admin th,
	table.admin td {
		padding: 0.55rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}

	table.admin th {
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-muted);
	}

	table.admin tbody tr:last-child td {
		border-bottom: none;
	}

	table.admin tbody tr.disabled {
		color: var(--fg-muted);
	}

	table.admin .num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	table.admin .center {
		text-align: center;
	}

	.quota {
		display: table-cell;
	}

	.quota-value {
		display: inline-block;
		min-width: 2ch;
		text-align: center;
		margin: 0 0.25rem;
	}

	.inline {
		display: inline-block;
	}

	.actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
</style>
