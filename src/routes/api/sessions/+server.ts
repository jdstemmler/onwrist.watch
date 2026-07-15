import { json, type RequestHandler } from '@sveltejs/kit';
import { apiTry } from '$lib/server/api';
import { handleBackfill } from '$lib/server/actions';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) =>
	apiTry(async () => json(handleBackfill(getDb(), await request.json())));
