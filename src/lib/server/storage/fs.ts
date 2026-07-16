import fs from 'node:fs';
import path from 'node:path';
import type { PhotoStorage } from './index';

/** Resolves `key` under `root`, refusing to escape it. Returns null (rather
 * than throwing) so callers like `get` can treat traversal as "not found". */
function resolveWithin(root: string, key: string): string | null {
	const resolved = path.resolve(root, key);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
	return resolved;
}

/** Filesystem-backed PhotoStorage rooted at `root`. The only module in the
 * app that touches the filesystem for photo files. */
export function createFsStorage(root: string): PhotoStorage {
	return {
		async put(key, data) {
			const abs = resolveWithin(root, key);
			if (!abs) throw new Error(`Storage key escapes root: ${key}`);
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			fs.writeFileSync(abs, data);
		},

		async get(key) {
			const abs = resolveWithin(root, key);
			if (!abs) return null;
			try {
				return fs.readFileSync(abs);
			} catch {
				return null;
			}
		},

		async delete(key) {
			const abs = resolveWithin(root, key);
			if (!abs) return;
			fs.rmSync(abs, { force: true });
		},

		async sizeOfPrefix(prefix) {
			const abs = resolveWithin(root, prefix);
			if (!abs) return 0;
			let total = 0;
			const walk = (dir: string) => {
				let entries: fs.Dirent[];
				try {
					entries = fs.readdirSync(dir, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					const full = path.join(dir, entry.name);
					if (entry.isDirectory()) walk(full);
					else if (entry.isFile()) total += fs.statSync(full).size;
				}
			};
			walk(abs);
			return total;
		}
	};
}
