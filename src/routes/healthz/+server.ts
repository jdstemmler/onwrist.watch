import { json, type RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';

// Liveness + readiness probe for the compose healthcheck (and anything else
// watching the box). Touches the DB so a wedged pool reads as unhealthy, not
// just "process is up". Unauthenticated by design — it returns no data.
export const GET: RequestHandler = async () => {
	await (await getDb()).execute(sql`select 1`);
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};
