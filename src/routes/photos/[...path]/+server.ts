import { error, type RequestHandler } from '@sveltejs/kit';
import path from 'node:path';
import { getStorage } from '$lib/server/storage';
import { getDb } from '$lib/server/db';
import { getPhotoForUser } from '$lib/server/photos';

const MIME: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.heic': 'image/heic'
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const uid = locals.user?.id ?? null;
	const photo = uid ? await getPhotoForUser(await getDb(), uid, params.path!) : null;
	if (!photo) throw error(404, 'Not found');

	const data = await getStorage().get(params.path!);
	if (!data) throw error(404, 'Not found');
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': MIME[path.extname(params.path!).toLowerCase()] ?? 'application/octet-stream',
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
