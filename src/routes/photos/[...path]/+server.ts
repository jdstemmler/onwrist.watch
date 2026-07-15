import { error, type RequestHandler } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '$lib/server/config';

const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.heic': 'image/heic'
};

export const GET: RequestHandler = async ({ params }) => {
	const root = path.resolve(config.dataDir, 'photos');
	const file = path.resolve(root, params.path!);
	if (!file.startsWith(root + path.sep)) throw error(400, 'Bad path');
	if (!fs.existsSync(file)) throw error(404, 'Not found');
	return new Response(fs.readFileSync(file), {
		headers: {
			'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
