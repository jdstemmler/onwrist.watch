import { describe, it, expect, afterEach, vi } from 'vitest';
import { assertConfig } from './config';

describe('assertConfig', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('throws when NODE_ENV=production and ORIGIN is unset (fail-closed, not fail-open)', () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ORIGIN', '');
		expect(() => assertConfig()).toThrow('ORIGIN must be set in production');
	});

	it('does not throw in production when ORIGIN is set', () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ORIGIN', 'https://onwrist.watch');
		expect(() => assertConfig()).not.toThrow();
	});

	it('does not throw outside production even with ORIGIN unset', () => {
		vi.stubEnv('NODE_ENV', 'test');
		vi.stubEnv('ORIGIN', '');
		expect(() => assertConfig()).not.toThrow();
	});

	it('rejects a partially configured S3 block in any env', () => {
		vi.stubEnv('NODE_ENV', 'test');
		vi.stubEnv('S3_BUCKET', 'onwrist-photos');
		expect(() => assertConfig()).toThrow('S3 storage is partially configured');
		vi.stubEnv('S3_ENDPOINT', 'https://s3.us-west-004.backblazeb2.com');
		vi.stubEnv('S3_REGION', 'us-west-004');
		vi.stubEnv('S3_ACCESS_KEY_ID', 'key-id');
		vi.stubEnv('S3_SECRET_ACCESS_KEY', 'key-secret');
		expect(() => assertConfig()).not.toThrow();
	});

	it('throws on a non-numeric or non-positive SESSION_DAYS in any env', () => {
		vi.stubEnv('NODE_ENV', 'test');
		vi.stubEnv('SESSION_DAYS', 'thirty');
		expect(() => assertConfig()).toThrow('SESSION_DAYS');
		vi.stubEnv('SESSION_DAYS', '0');
		expect(() => assertConfig()).toThrow('SESSION_DAYS');
		vi.stubEnv('SESSION_DAYS', '30');
		expect(() => assertConfig()).not.toThrow();
	});

	it('warns (not throws) in production when mail or Turnstile is unconfigured', () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ORIGIN', 'https://onwrist.watch');
		vi.stubEnv('RESEND_API_KEY', '');
		vi.stubEnv('TURNSTILE_SITE_KEY', '');
		vi.stubEnv('TURNSTILE_SECRET_KEY', '');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(() => assertConfig()).not.toThrow();
		const output = warn.mock.calls.map((c) => String(c[0])).join('\n');
		expect(output).toContain('RESEND_API_KEY');
		expect(output).toContain('Turnstile');
		warn.mockRestore();
	});

	it('warns in production when RESEND_API_KEY is set but MAIL_FROM is empty', () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('ORIGIN', 'https://onwrist.watch');
		vi.stubEnv('RESEND_API_KEY', 're_test_key');
		vi.stubEnv('MAIL_FROM', '');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(() => assertConfig()).not.toThrow();
		expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('MAIL_FROM');
		warn.mockRestore();
	});
});
