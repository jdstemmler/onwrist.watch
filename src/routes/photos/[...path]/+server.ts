import { error, type RequestHandler } from '@sveltejs/kit';
import path from 'node:path';
import { getStorage } from '$lib/server/storage';

const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.heic': 'image/heic'
};

export const GET: RequestHandler = async ({ params }) => {
	const data = await getStorage().get(params.path!);
	if (!data) throw error(404, 'Not found');
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': MIME[path.extname(params.path!).toLowerCase()] ?? 'application/octet-stream',
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};
