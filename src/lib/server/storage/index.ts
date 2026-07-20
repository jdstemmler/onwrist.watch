import path from 'node:path';
import { config } from '../config';
import { createFsStorage } from './fs';
import { createS3Storage } from './s3';

export type PhotoStorage = {
	readonly kind: 'fs' | 's3';
	put(key: string, data: Buffer): Promise<void>;
	get(key: string): Promise<Buffer | null>;
	delete(key: string): Promise<void>;
	sizeOfPrefix(prefix: string): Promise<number>; // bytes under a key prefix (storage quotas)
};

let instance: PhotoStorage | undefined;

/** Cached singleton. S3-compatible driver when the `S3_*` env vars are set
 * (hosted deploys — Backblaze B2, R2, ...); otherwise the local-disk fs
 * driver rooted at `${DATA_DIR ?? './data'}/photos` — the self-hosting
 * default, with photos on the compose bind mount. assertConfig rejects a
 * partial S3 block at boot, so checking one var here is sufficient. */
export function getStorage(): PhotoStorage {
	if (!instance) {
		instance = config.s3.bucket
			? createS3Storage(config.s3)
			: createFsStorage(path.resolve(config.dataDir, 'photos'));
	}
	return instance;
}
