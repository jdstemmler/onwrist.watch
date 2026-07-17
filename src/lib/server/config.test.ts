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
});
