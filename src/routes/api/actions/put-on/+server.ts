import { json, type RequestHandler } from '@sveltejs/kit';
import { apiTry } from '$lib/server/api';
import { handlePutOn } from '$lib/server/actions';
import { getDb } from '$lib/server/db';
import { config } from '$lib/server/config';

export const POST: RequestHandler = async ({ request }) =>
	apiTry(async () => json(handlePutOn(getDb(), config.homeTz, await request.json())));
