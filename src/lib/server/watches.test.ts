import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { users } from './db/schema';
import { StateError } from './sessions';
import { watchFormSchema, createWatch, updateWatch, deleteWatch } from './watches';

describe('watchFormSchema', () => {
	it('coerces form strings: dollars->cents, empty->null, numbers', () => {
		const d = watchFormSchema.parse({
			brand: 'Omega', model: 'Speedmaster', nickname: 'Speedy',
			referenceNo: '', dialColor: 'black', movement: 'manual',
			caseMm: '42', lugMm: '20', waterResistanceM: '50',
			strapNotes: '', purchaseDate: '2024-11-02', pricePaid: '5000',
			purchasedFrom: 'AD', boxPapers: 'both', condition: 'excellent',
			status: 'owned', soldDate: '', soldPrice: '', notes: ''
		});
		expect(d.pricePaidCents).toBe(500000);
		expect(d.isGift).toBe(false); // checkbox absent -> false
		expect(d.serialNo).toBeNull(); // absent -> null
		expect(d.lastServiced).toBeNull();
		expect(d.referenceNo).toBeNull();
		expect(d.caseMm).toBe(42);
		expect(d.soldPriceCents).toBeNull();
	});
});

describe('watchFormSchema gift checkbox', () => {
	it("coerces the checkbox's 'on' to true", () => {
		const d = watchFormSchema.parse({ brand: 'Timex', model: 'Snoopy', isGift: 'on' });
		expect(d.isGift).toBe(true);
	});

	it('passes serial and last-serviced through, empty -> null', () => {
		const d = watchFormSchema.parse({
			brand: 'Tudor', model: 'BB GMT', serialNo: 'J8992xxx', lastServiced: '2026-01-10'
		});
		expect(d.serialNo).toBe('J8992xxx');
		expect(d.lastServiced).toBe('2026-01-10');
		const e = watchFormSchema.parse({ brand: 'T', model: 'M', serialNo: '', lastServiced: '' });
		expect(e.serialNo).toBeNull();
		expect(e.lastServiced).toBeNull();
	});
});

describe('watch crud', () => {
	let db: DB;
	let alice: number;
	let mallory: number;

	beforeEach(async () => {
		db = await createTestDb();
		alice = (await db.insert(users).values({ email: 'alice@b.com', passwordHash: 'x' }).returning())[0].id;
		mallory = (await db.insert(users).values({ email: 'mallory@b.com', passwordHash: 'x' }).returning())[0].id;
	});

	it('creates and updates', async () => {
		const w = await createWatch(db, alice, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
		expect(w.userId).toBe(alice);
		const u = await updateWatch(db, alice, w.id, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', nickname: 'Beater', status: 'owned' }));
		expect(u.nickname).toBe('Beater');
	});

	describe('tenancy', () => {
		it("mallory can't update alice's watch (StateError, not found)", async () => {
			const w = await createWatch(db, alice, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
			await expect(
				updateWatch(db, mallory, w.id, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', nickname: 'Hijacked', status: 'owned' }))
			).rejects.toThrow(StateError);
			await expect(
				updateWatch(db, mallory, w.id, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', nickname: 'Hijacked', status: 'owned' }))
			).rejects.toThrow('Watch not found');
		});

		it("mallory's deleteWatch against alice's watch is a no-op", async () => {
			const w = await createWatch(db, alice, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
			await deleteWatch(db, mallory, w.id);
			const stillThere = await updateWatch(db, alice, w.id, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', nickname: 'Still mine', status: 'owned' }));
			expect(stillThere.nickname).toBe('Still mine');
		});
	});

	describe('quota', () => {
		it('rejects the 21st watch with a quota StateError', async () => {
			for (let i = 0; i < 20; i++) {
				await createWatch(db, alice, watchFormSchema.parse({ brand: 'Brand', model: `M${i}`, status: 'owned' }));
			}
			await expect(
				createWatch(db, alice, watchFormSchema.parse({ brand: 'Brand', model: 'M21', status: 'owned' }))
			).rejects.toThrow('Watch limit reached (20) — contact the admin if you need more');
		});

		it('quotaMultiplier raises the watch quota', async () => {
			await db.update(users).set({ quotaMultiplier: 2 }).where(eq(users.id, alice));
			for (let i = 0; i < 20; i++) {
				await createWatch(db, alice, watchFormSchema.parse({ brand: 'Brand', model: `M${i}`, status: 'owned' }));
			}
			// with multiplier 2, quota is 40 -- the 21st watch must succeed
			const w = await createWatch(db, alice, watchFormSchema.parse({ brand: 'Brand', model: 'M21', status: 'owned' }));
			expect(w.id).toBeDefined();
		});

		it("mallory's watches never count against alice's quota", async () => {
			for (let i = 0; i < 20; i++) {
				await createWatch(db, mallory, watchFormSchema.parse({ brand: 'Brand', model: `M${i}`, status: 'owned' }));
			}
			const w = await createWatch(db, alice, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
			expect(w.id).toBeDefined();
		});
	});
});
