import { describe, it, expect } from 'vitest';
import { assignSlots, stackOrder, MAX_HUES, OTHER_SLOT, OTHER_ID } from './palette';

// A watch's "membership" (colored vs pooled) derives from all-time wear hours;
// its hue *slot* among the colored core is id-ordered, never wear-ordered.
const w = (watchId: number, hours: number) => ({ watchId, hours });

describe('assignSlots — palette membership', () => {
	it('≤ 11 watches: every watch is colored, slot = id rank, no Other', () => {
		const ids = [5, 2, 9, 1, 7, 3, 11, 4, 6, 8, 10]; // 11 watches, shuffled input
		const slots = assignSlots(ids.map((id) => w(id, id * 10)));
		// id-ordered: smallest id → slot 0, largest → slot 10
		[...ids].sort((a, b) => a - b).forEach((id, i) => expect(slots.get(id)).toBe(i));
		expect([...slots.values()]).not.toContain(OTHER_SLOT);
	});

	it('12+ watches: only the least-worn tail pools into Other', () => {
		// ids 1..12; hours ascending with id, so id 1 is least worn.
		const slots = assignSlots(Array.from({ length: 12 }, (_, i) => w(i + 1, (i + 1) * 10)));
		expect(slots.get(1)).toBe(OTHER_SLOT); // least worn → pooled
		// The surviving 11 (ids 2..12) take slots id-ordered, 0..10.
		[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((id, i) => expect(slots.get(id)).toBe(i));
		expect([...slots.values()].filter((s) => s === OTHER_SLOT)).toHaveLength(1);
	});

	it('hue slots among the core stay id-ordered even when the pooled watch is interior', () => {
		// id 6 is the least-worn; the other 11 keep hues, id-ordered around the gap.
		const rows = Array.from({ length: 12 }, (_, i) => w(i + 1, i + 1 === 6 ? 1 : 100 + i));
		const slots = assignSlots(rows);
		expect(slots.get(6)).toBe(OTHER_SLOT);
		// ids 1..5 keep slots 0..4; ids 7..12 shift up to fill 5..10.
		expect(slots.get(5)).toBe(4);
		expect(slots.get(7)).toBe(5);
		expect(slots.get(12)).toBe(10);
	});

	it('tiebreak on the membership boundary: equal hours, lower id stays core', () => {
		// 13 watches all at the same hours → ids 1..11 are core, 12 & 13 pooled.
		const slots = assignSlots(Array.from({ length: 13 }, (_, i) => w(i + 1, 50)));
		for (let id = 1; id <= 11; id++) expect(slots.get(id)).toBe(id - 1);
		expect(slots.get(12)).toBe(OTHER_SLOT);
		expect(slots.get(13)).toBe(OTHER_SLOT);
	});

	it('membership is independent of input row order', () => {
		const rows = Array.from({ length: 12 }, (_, i) => w(i + 1, (i + 1) * 10));
		const a = assignSlots(rows);
		const b = assignSlots([...rows].reverse());
		const c = assignSlots([...rows].sort((x, y) => y.hours - x.hours));
		for (let id = 1; id <= 12; id++) {
			expect(b.get(id)).toBe(a.get(id));
			expect(c.get(id)).toBe(a.get(id));
		}
	});

	it('caps the colored set at MAX_HUES hues', () => {
		const slots = assignSlots(Array.from({ length: 20 }, (_, i) => w(i + 1, (i + 1) * 10)));
		const colored = [...slots.values()].filter((s) => s !== OTHER_SLOT);
		expect(colored).toHaveLength(MAX_HUES);
		expect(new Set(colored).size).toBe(MAX_HUES); // no hue reused
	});
});

describe('stackOrder — Other stacks last', () => {
	it('orders real watches by id ascending, Other after all of them', () => {
		const rows = [{ watchId: 3 }, { watchId: OTHER_ID }, { watchId: 1 }];
		expect([...rows].sort(stackOrder).map((r) => r.watchId)).toEqual([1, 3, OTHER_ID]);
	});
});
