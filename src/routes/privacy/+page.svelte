<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Privacy — {data.appName}</title>
</svelte:head>

<article class="privacy">
	<h1>Privacy</h1>
	<p class="muted">
		{data.appName} is open-source, self-hostable software. This page describes what the software
		stores and who can see it. It applies to whichever instance you're using — "the operator"
		below is whoever runs that instance.
	</p>

	<section class="card">
		<h2>What's stored</h2>
		<ul>
			<li>
				<strong>Your account:</strong> your email address and a hash of your password (argon2id —
				the password itself is never stored). Login sessions and email-verification links are
				stored as hashes too.
			</li>
			<li>
				<strong>Your collection and wear log:</strong> the watches you enter, their details, and
				when you wore them.
			</li>
			<li>
				<strong>Your photos:</strong> uploads are re-encoded to WebP on the server, which strips
				embedded metadata — including any GPS location your camera added.
			</li>
			<li>
				<strong>Operational records:</strong> short-lived rate-limit counters (keyed by IP) that
				protect the login and signup forms.
			</li>
		</ul>
	</section>

	<section class="card">
		<h2>Who can see it</h2>
		<ul>
			<li>
				<strong>You:</strong> every read and write is scoped to your account. Other members have
				no path to your data — photos are served only through authenticated, ownership-checked
				requests, never from a public bucket or directory.
			</li>
			<li>
				<strong>The operator:</strong> whoever hosts an instance can technically access its
				database and photo storage — that's inherent to hosting, not specific to this app. If
				you don't want to extend that trust, self-host your own instance.
			</li>
			<li>
				<strong>Nobody else.</strong> There are no analytics, trackers, or ads. The only
				third-party services involved are the signup captcha (Cloudflare Turnstile) and, if the
				operator configured one, the email provider that delivers verification and
				password-reset messages to your address.
			</li>
		</ul>
	</section>

	<section class="card">
		<h2>Cookies and email</h2>
		<ul>
			<li>One cookie: your login session. Nothing else is set, and nothing follows you around.</li>
			<li>
				Email is transactional only — verification, password reset, email-change confirmations.
				No marketing, no digests.
			</li>
		</ul>
	</section>

	<section class="card">
		<h2>Deleting your data</h2>
		<p>
			Delete your account yourself from the settings page — deletion is immediate and permanent,
			and removes every record and photo file. You can also ask the operator of your instance to
			delete it for you.
		</p>
	</section>
</article>

<style>
	.privacy {
		max-width: 42rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-block: 1rem 2.5rem;
	}

	.privacy > p {
		margin: 0;
	}

	section h2 {
		margin-bottom: 0.6rem;
	}

	section ul {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	section p {
		margin: 0;
	}
</style>
