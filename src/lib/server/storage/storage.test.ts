import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createFsStorage } from './fs';

describe('createFsStorage', () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'onwrist-storage-'));
	});

	it('roundtrips put/get/delete', async () => {
		const storage = createFsStorage(root);
		const data = Buffer.from('hello world');
		await storage.put('1/photo.webp', data);
		expect(await storage.get('1/photo.webp')).toEqual(data);
		await storage.delete('1/photo.webp');
		expect(await storage.get('1/photo.webp')).toBeNull();
	});

	it('get returns null for a missing key', async () => {
		const storage = createFsStorage(root);
		expect(await storage.get('nope/nothing.webp')).toBeNull();
	});

	it('delete on a missing key is a no-op', async () => {
		const storage = createFsStorage(root);
		await expect(storage.delete('nope/nothing.webp')).resolves.toBeUndefined();
	});

	it('sizeOfPrefix sums nested files under a key prefix', async () => {
		const storage = createFsStorage(root);
		await storage.put('5/a.webp', Buffer.alloc(100));
		await storage.put('5/b.webp', Buffer.alloc(250));
		await storage.put('6/c.webp', Buffer.alloc(999));
		expect(await storage.sizeOfPrefix('5')).toBe(350);
	});

	it('sizeOfPrefix is 0 for a prefix with no files', async () => {
		const storage = createFsStorage(root);
		expect(await storage.sizeOfPrefix('missing')).toBe(0);
	});

	it('rejects traversal keys on get (returns null)', async () => {
		const storage = createFsStorage(root);
		expect(await storage.get('../escape')).toBeNull();
		expect(await storage.get('../../etc/passwd')).toBeNull();
	});

	it('rejects traversal keys on put (throws)', async () => {
		const storage = createFsStorage(root);
		await expect(storage.put('../escape', Buffer.from('x'))).rejects.toThrow();
	});
});
