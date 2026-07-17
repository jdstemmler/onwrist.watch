import { config } from '../config';
import { createResendMailer } from './resend';

export type Mail = { to: string; subject: string; text: string };
export type Mailer = { send(mail: Mail): Promise<void> };

const logMailer: Mailer = {
	async send(mail) {
		console.log(`MAIL ${JSON.stringify(mail)}`);
	}
};

let instance: Mailer | undefined;

/** Resend driver if RESEND_API_KEY is set, else a log driver that writes a
 * "MAIL {...}" JSON line to stdout. Cached singleton, chosen once. */
export function getMailer(): Mailer {
	if (!instance) {
		instance = config.resendApiKey
			? createResendMailer(config.resendApiKey, config.mailFrom)
			: logMailer;
	}
	return instance;
}
