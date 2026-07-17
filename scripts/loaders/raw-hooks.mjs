// Node ESM loader hook that teaches `tsx` (a plain Node runtime) how to
// resolve Vite's `?raw` import suffix, used by src/lib/server/password-policy.ts
// to inline passwords-10k.txt. Under Vite (the app itself) this is native;
// under tsx (scripts run outside Vite, e.g. seed scripts) it isn't, so any
// script that transitively imports that module needs this hook registered
// first via scripts/loaders/register.mjs.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, nextLoad) {
	if (url.includes('?raw')) {
		const filePath = fileURLToPath(url.split('?')[0]);
		const source = await readFile(filePath, 'utf8');
		return { format: 'module', source: `export default ${JSON.stringify(source)};`, shortCircuit: true };
	}
	return nextLoad(url, context);
}
