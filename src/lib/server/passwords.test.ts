import { describe, it, expect } from 'vitest';
import { emailKey, passwordPolicyError, hashPassword, verifyPasswordHash } from './passwords';

describe('emailKey', () => {
	it('normalizes case and whitespace', () => {
		expect(emailKey('  Jayson@Example.COM ')).toBe('jayson@example.com');
	});
});

describe('password policy', () => {
	it('rejects short passwords', () => {
		expect(passwordPolicyError('short12')).toMatch(/10/);
	});
	it('control-1b: rejects top-10k common passwords', () => {
		expect(passwordPolicyError('1234567890')).toMatch(/common/i);
	});
	it('accepts a long uncommon password with no composition rules', () => {
		expect(passwordPolicyError('correct horse battery')).toBeNull();
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
