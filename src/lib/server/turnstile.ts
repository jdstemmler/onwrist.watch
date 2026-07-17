/** Verifies a Cloudflare Turnstile widget response server-side. Fails closed:
 * a network error or non-2xx response is treated as a failed captcha, never
 * as "skip the check". */
export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
	const body = new URLSearchParams({ secret, response: token });
	if (ip) body.set('remoteip', ip);
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});
		if (!res.ok) return false;
		const data = (await res.json()) as { success?: boolean };
		return data.success === true;
	} catch {
		return false;
	}
}
