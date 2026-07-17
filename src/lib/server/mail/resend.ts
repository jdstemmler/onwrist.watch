import type { Mailer } from './index';

/** Resend HTTP driver. The only module in the app that calls the Resend API. */
export function createResendMailer(apiKey: string, from: string): Mailer {
	return {
		async send(mail) {
			const res = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text })
			});
			if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
		}
	};
}
