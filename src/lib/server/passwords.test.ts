import { describe, it, expect } from 'vitest';
import { emailKey, emailFormatError, hashPassword, verifyPasswordHash } from './passwords';

describe('emailKey', () => {
	it('normalizes case and whitespace', () => {
		expect(emailKey('  Jayson@Example.COM ')).toBe('jayson@example.com');
	});
});

describe('emailFormatError', () => {
	it('accepts a normal address', () => {
		expect(emailFormatError('jayson@example.com')).toBeNull();
	});

	it('accepts a subdomain address', () => {
		expect(emailFormatError('a@mail.example.co.uk')).toBeNull();
	});

	it('tolerates surrounding whitespace (trims before validating)', () => {
		expect(emailFormatError('  a@b.com  ')).toBeNull();
	});

	it.each([
		['empty string', ''],
		['no @', 'jaysonexample.com'],
		['no domain dot', 'jayson@examplecom'],
		['empty local part', '@example.com'],
		['empty domain', 'jayson@'],
		['internal space', 'jay son@example.com'],
		['internal newline', 'jay\nson@example.com'],
		['two @', 'jay@son@example.com']
	])('rejects %s', (_label, input) => {
		expect(emailFormatError(input)).toEqual(expect.any(String));
	});
});

describe('argon2id hashing', () => {
	it('control-1: hashes with OWASP argon2id parameters', async () => {
		const h = await hashPassword('a strong enough pw');
		expect(h.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
		expect(await verifyPasswordHash(h, 'a strong enough pw')).toBe(true);
		expect(await verifyPasswordHash(h, 'wrong password!')).toBe(false);
	});
});
