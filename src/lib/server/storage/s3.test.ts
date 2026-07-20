import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';

// --- Driver selection ------------------------------------------------------

describe('getStorage driver selection', () => {
	beforeEach(() => {
		// config reads env at module load; reset so each case re-evaluates it
		vi.resetModules();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('defaults to the fs driver with no S3 config (the self-hosting path)', async () => {
		vi.stubEnv('S3_BUCKET', '');
		const { getStorage } = await import('./index');
		expect(getStorage().kind).toBe('fs');
	});

	it('selects the S3 driver when the S3_* vars are set', async () => {
		vi.stubEnv('S3_ENDPOINT', 'https://s3.us-west-004.backblazeb2.com');
		vi.stubEnv('S3_REGION', 'us-west-004');
		vi.stubEnv('S3_BUCKET', 'onwrist-photos');
		vi.stubEnv('S3_ACCESS_KEY_ID', 'key-id');
		vi.stubEnv('S3_SECRET_ACCESS_KEY', 'key-secret');
		const { getStorage } = await import('./index');
		expect(getStorage().kind).toBe('s3');
	});
});

// --- Contract against a real bucket (opt-in) --------------------------------
//
// The S3 driver is network-backed, so the contract runs only when pointed at
// a real S3-compatible bucket (a throwaway B2/MinIO bucket, never one with
// production data):
//   S3_TEST_ENDPOINT=... S3_TEST_REGION=... S3_TEST_BUCKET=... \
//   S3_TEST_ACCESS_KEY_ID=... S3_TEST_SECRET_ACCESS_KEY=... \
//     npx vitest run src/lib/server/storage/s3.test.ts
// Same pattern as the RACE_DATABASE_URL-gated concurrency test.

const testCfg = {
	endpoint: process.env.S3_TEST_ENDPOINT ?? '',
	region: process.env.S3_TEST_REGION ?? '',
	bucket: process.env.S3_TEST_BUCKET ?? '',
	accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? '',
	secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? ''
};

describe.skipIf(!testCfg.bucket)('S3 storage contract (opt-in, real bucket)', () => {
	// unique prefix per run so parallel/aborted runs can't collide
	const prefix = `contract-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

	async function makeStorage() {
		const { createS3Storage } = await import('./s3');
		return createS3Storage(testCfg);
	}

	afterAll(async () => {
		const storage = await makeStorage();
		for (const key of [`${prefix}/a.webp`, `${prefix}/nested/b.webp`]) await storage.delete(key);
	});

	it('round-trips bytes through put/get', async () => {
		const storage = await makeStorage();
		const data = Buffer.from('webp-bytes-here');
		await storage.put(`${prefix}/a.webp`, data);
		expect(await storage.get(`${prefix}/a.webp`)).toEqual(data);
	});

	it('returns null for a missing key', async () => {
		const storage = await makeStorage();
		expect(await storage.get(`${prefix}/does-not-exist.webp`)).toBeNull();
	});

	it('sizeOfPrefix sums nested objects and ignores other prefixes', async () => {
		const storage = await makeStorage();
		await storage.put(`${prefix}/a.webp`, Buffer.alloc(10));
		await storage.put(`${prefix}/nested/b.webp`, Buffer.alloc(7));
		expect(await storage.sizeOfPrefix(`${prefix}/`)).toBe(17);
		expect(await storage.sizeOfPrefix(`${prefix}-other/`)).toBe(0);
	});

	it('delete is idempotent and removes the object', async () => {
		const storage = await makeStorage();
		await storage.put(`${prefix}/a.webp`, Buffer.alloc(4));
		await storage.delete(`${prefix}/a.webp`);
		await storage.delete(`${prefix}/a.webp`); // second delete: no throw
		expect(await storage.get(`${prefix}/a.webp`)).toBeNull();
	});
});
