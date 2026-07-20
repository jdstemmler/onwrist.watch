import path from 'node:path';
import { config } from '../config';
import { createFsStorage } from './fs';

export type PhotoStorage = {
	put(key: string, data: Buffer): Promise<void>;
	get(key: string): Promise<Buffer | null>;
	delete(key: string): Promise<void>;
	sizeOfPrefix(prefix: string): Promise<number>; // bytes under a key prefix (storage quotas)
};

let instance: PhotoStorage | undefined;

/** fs driver rooted at `${DATA_DIR ?? './data'}/photos`. Cached singleton. */
export function getStorage(): PhotoStorage {
	if (!instance) instance = createFsStorage(path.resolve(config.dataDir, 'photos'));
	return instance;
}
