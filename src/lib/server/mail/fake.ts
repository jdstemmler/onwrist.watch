import type { Mail, Mailer } from './index';

/** In-memory mailer for tests: records every send instead of delivering it. */
export function createFakeMailer(): Mailer & { sent: Mail[] } {
	const sent: Mail[] = [];
	return {
		sent,
		async send(mail) {
			sent.push(mail);
		}
	};
}
