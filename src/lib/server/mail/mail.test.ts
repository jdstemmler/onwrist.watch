import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	verifyEmail,
	resetEmail,
	emailChangeVerify,
	emailChangedNotice,
	accountExistsEmail
} from './templates';
import { createFakeMailer } from './fake';
import { createResendMailer } from './resend';
import { config } from '../config';

describe('templates', () => {
	it('verifyEmail links to /verify?token=… for the given recipient', () => {
		const mail = verifyEmail('a@b.com', 'tok');
		expect(mail.to).toBe('a@b.com');
		expect(mail.text).toContain(`${config.origin}/verify?token=tok`);
		expect(mail.subject).toContain(config.appName);
	});

	it('resetEmail links to /reset/confirm?token=…', () => {
		const mail = resetEmail('a@b.com', 'tok');
		expect(mail.to).toBe('a@b.com');
		expect(mail.text).toContain(`${config.origin}/reset/confirm?token=tok`);
		expect(mail.subject).toContain(config.appName);
	});

	it('emailChangeVerify goes to the NEW address, links to /verify?token=…', () => {
		const mail = emailChangeVerify('new@b.com', 'tok2');
		expect(mail.to).toBe('new@b.com');
		expect(mail.text).toContain(`${config.origin}/verify?token=tok2`);
		expect(mail.subject).toContain(config.appName);
	});

	it('emailChangedNotice goes to the OLD address with no link', () => {
		const mail = emailChangedNotice('old@b.com');
		expect(mail.to).toBe('old@b.com');
		expect(mail.text).not.toContain('http');
		expect(mail.subject).toContain(config.appName);
	});

	it('accountExistsEmail says sign in or reset without revealing anything else', () => {
		const mail = accountExistsEmail('a@b.com');
		expect(mail.to).toBe('a@b.com');
		expect(mail.text.toLowerCase()).toContain('sign in');
		expect(mail.text.toLowerCase()).toContain('reset');
		expect(mail.subject).toContain(config.appName);
	});
});

describe('createFakeMailer', () => {
	it('records sent mail', async () => {
		const mailer = createFakeMailer();
		const mail = verifyEmail('a@b.com', 'tok');
		await mailer.send(mail);
		expect(mailer.sent).toEqual([mail]);
	});
});

describe('createResendMailer', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('posts the correct JSON with a Bearer auth header', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
		vi.stubGlobal('fetch', fetchMock);

		const mailer = createResendMailer('secret-key', 'noreply@onwrist.watch');
		await mailer.send({ to: 'a@b.com', subject: 'Hi', text: 'Body text' });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, opts] = fetchMock.mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		expect(opts.method).toBe('POST');
		expect(opts.headers.Authorization).toBe('Bearer secret-key');
		expect(opts.headers['Content-Type']).toBe('application/json');
		const body = JSON.parse(opts.body);
		expect(body).toEqual({
			from: 'noreply@onwrist.watch',
			to: 'a@b.com',
			subject: 'Hi',
			text: 'Body text'
		});
	});

	it('throws on a non-2xx response', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 422,
			text: async () => 'Unprocessable'
		});
		vi.stubGlobal('fetch', fetchMock);

		const mailer = createResendMailer('secret-key', 'noreply@onwrist.watch');
		await expect(mailer.send({ to: 'a@b.com', subject: 'Hi', text: 'Body' })).rejects.toThrow(
			/422/
		);
	});
});
