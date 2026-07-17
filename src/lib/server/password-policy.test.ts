import { describe, it, expect } from 'vitest';
import { passwordPolicyError } from './password-policy';

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
