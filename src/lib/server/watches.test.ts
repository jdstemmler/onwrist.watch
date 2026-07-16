import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './db/test-utils';
import type { DB } from './db';
import { watchFormSchema, createWatch, updateWatch } from './watches';

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

	beforeEach(async () => {
		db = await createTestDb();
	});

	it('creates and updates', async () => {
		const w = await createWatch(db, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
		expect(w.id).toBe(1);
		const u = await updateWatch(db, w.id, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', nickname: 'Beater', status: 'owned' }));
		expect(u.nickname).toBe('Beater');
	});
});
