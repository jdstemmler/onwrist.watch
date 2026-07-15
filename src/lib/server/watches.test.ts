import { describe, it, expect } from 'vitest';
import { createDb } from './db';
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
		expect(d.referenceNo).toBeNull();
		expect(d.caseMm).toBe(42);
		expect(d.soldPriceCents).toBeNull();
	});
});

describe('watch crud', () => {
	it('creates and updates', () => {
		const db = createDb(':memory:');
		const w = createWatch(db, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', status: 'owned' }));
		expect(w.id).toBe(1);
		const u = updateWatch(db, w.id, watchFormSchema.parse({ brand: 'Seiko', model: 'SKX007', nickname: 'Beater', status: 'owned' }));
		expect(u.nickname).toBe('Beater');
	});
});
