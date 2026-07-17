import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users } from './db/schema';
import { issueToken, consumeToken, hashToken, TTL } from './tokens';

let db: DB;
let uid: number;
beforeEach(async () => {
	db = await createTestDb();
	uid = (await db.insert(users).values({ email: 'a@b.com', passwordHash: 'x' }).returning())[0].id;
});

describe('email tokens', () => {
	it('control-2: raw token is 256-bit random and only its sha256 hash is stored', async () => {
		const raw = await issueToken(db, uid, 'verify', TTL.verify);
		expect(Buffer.from(raw, 'base64url').length).toBeGreaterThanOrEqual(32);
		const rows = await db.select().from((await import('./db/schema')).emailTokens);
		expect(rows[0].tokenHash).toBe(hashToken(raw));
		expect(rows[0].tokenHash).not.toBe(raw);
	});

	it('control-3: single-use — second consume returns null', async () => {
		const raw = await issueToken(db, uid, 'verify', TTL.verify);
		expect(await consumeToken(db, raw, 'verify')).not.toBeNull();
		expect(await consumeToken(db, raw, 'verify')).toBeNull();
	});

	it('control-3b: expiry — consuming after ttl returns null', async () => {
		const t0 = new Date('2026-07-16T00:00:00Z');
		const raw = await issueToken(db, uid, 'reset', TTL.reset, undefined, t0);
		const late = new Date(t0.getTime() + TTL.reset + 1);
		expect(await consumeToken(db, raw, 'reset', late)).toBeNull();
	});

	it('rejects wrong-purpose consumption', async () => {
		const raw = await issueToken(db, uid, 'verify', TTL.verify);
		expect(await consumeToken(db, raw, 'reset')).toBeNull();
	});

	it('stores new_email for email_change tokens', async () => {
		const raw = await issueToken(db, uid, 'email_change', TTL.emailChange, 'new@b.com');
		const row = await consumeToken(db, raw, 'email_change');
		expect(row?.newEmail).toBe('new@b.com');
	});
});
