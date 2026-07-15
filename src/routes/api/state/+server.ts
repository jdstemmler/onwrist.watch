import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getState } from '$lib/server/state';
import { config } from '$lib/server/config';

export const GET: RequestHandler = async () => json(getState(getDb(), config.homeTz));
