// Shared categorical color scale for the stats charts: an 11-hue palette
// tuned per theme, WCAG-contrast-checked against the card surfaces
// (light #f7f8f4, dark #1b1f1c):
//   light: slots 3/4/5/11 land at 2.0-2.9:1 — mitigated by always pairing a
//   colored mark with a text label/legend, never color alone
//   dark:  all slots >= 3.3:1
//
// Order is the CVD-safety mechanism (adjacent slots keep a worst-case
// normal-vision ΔE of ~19.3 and CVD-sim ΔE of ~8.2) — never reorder per-chart.
//
// Hues never recycle. A collection has at most 11 colored watches: the top 11
// by all-time wear hours (`assignSlots`) hold the hues and every remaining
// watch pools into a single neutral "Other" series (`OTHER_SLOT` →
// `var(--series-other)`), so a hue always means one specific watch and color
// consistently reads as "core rotation". Collections of 11 or fewer watches
// colour exactly as before (all watches are core, id-ordered).
export type ColorSlot = { light: string; dark: string };

export const CATEGORICAL: ColorSlot[] = [
	{ light: '#2a78d6', dark: '#3987e5' }, // 1 blue
	{ light: '#008300', dark: '#008300' }, // 2 green
	{ light: '#e87ba4', dark: '#d55181' }, // 3 magenta
	{ light: '#eda100', dark: '#c98500' }, // 4 yellow
	{ light: '#1baf7a', dark: '#199e70' }, // 5 aqua
	{ light: '#eb6834', dark: '#d95926' }, // 6 orange
	{ light: '#4a3aa7', dark: '#9085e9' }, // 7 violet
	{ light: '#e34948', dark: '#e66767' }, // 8 red
	{ light: '#0f9a9a', dark: '#0f9a9a' }, // 9 teal
	{ light: '#a24bbf', dark: '#b05fce' }, // 10 purple
	{ light: '#7a9e00', dark: '#7d9a1a' } // 11 chartreuse
];

/** Number of colored hue slots; the top this-many watches by wear hold them. */
export const MAX_HUES = CATEGORICAL.length;

/** Slot sentinel for the pooled "Other" series — maps to the neutral
 * `var(--series-other)` rather than a categorical hue. */
export const OTHER_SLOT = -1;

/** Synthetic series/watch id for the merged "Other" band in the stacked
 * charts (day-of-week, watch-by-time-of-day). Distinct from every real watch
 * id (which are positive) so pooled watches sum into one band. */
export const OTHER_ID = -1;

/** Legend/label text for the pooled series. */
export const OTHER_LABEL = 'Other';

/**
 * Maps every watch to a color slot from its all-time wear hours. The top
 * {@link MAX_HUES} watches by hours (tiebreak: watch id ascending) are the
 * "core" rotation and hold the hues; every other watch maps to
 * {@link OTHER_SLOT}. Among the core, the hue *slot* is assigned by ascending
 * watch id — never by wear rank — so a watch keeps the same hue as long as it
 * stays in the core, and collections of ≤ MAX_HUES watches colour exactly as
 * an id-ordered scale (all core, no Other).
 *
 * Membership derives only from the hours passed in, so it's stable across a
 * chart's own sort order and across view filters (e.g. the calendar's year):
 * pass the full watch universe with its all-time hours and a watch's color
 * never shifts when a filter changes which rows a chart renders.
 */
export function assignSlots(watches: Iterable<{ watchId: number; hours: number }>): Map<number, number> {
	const all = [...watches];
	const core = [...all]
		.sort((a, b) => b.hours - a.hours || a.watchId - b.watchId)
		.slice(0, MAX_HUES)
		.map((w) => w.watchId);
	const coreSet = new Set(core);
	const slots = new Map<number, number>();
	// Hue slot is id-ordered among the core, independent of wear rank.
	core
		.slice()
		.sort((a, b) => a - b)
		.forEach((id, i) => slots.set(id, i));
	for (const wa of all) if (!coreSet.has(wa.watchId)) slots.set(wa.watchId, OTHER_SLOT);
	return slots;
}

/** CSS custom-property name for a slot, e.g. `var(--series-3)`; the pooled
 * `OTHER_SLOT` resolves to the neutral `var(--series-other)`. The matching
 * values (light + dark, kept in sync with CATEGORICAL above) are declared
 * exactly once, in a `:global(.chart-palette)` rule in
 * `src/routes/stats/+page.svelte` — every chart component's root element
 * carries class="chart-palette" and only ever references these vars, never
 * redeclaring the values itself. (Svelte `<style>` blocks are static CSS
 * text, so this constant can't be interpolated into them — the page's
 * `<style>` block is the single source of truth instead.) */
export function slotVar(slot: number): string {
	return slot === OTHER_SLOT ? 'var(--series-other)' : `var(--series-${slot + 1})`;
}

/** Stack/legend order comparator for the stacked band charts: real watches by
 * ascending id, with the pooled "Other" series ({@link OTHER_ID}) always last
 * (top of a stack, end of a legend). */
export function stackOrder(a: { watchId: number }, b: { watchId: number }): number {
	if (a.watchId === OTHER_ID) return 1;
	if (b.watchId === OTHER_ID) return -1;
	return a.watchId - b.watchId;
}

/** Rounds `max` up to a "nice" axis ceiling (1/2/5 × 10^n) and returns evenly
 * spaced tick values from 0..niceMax inclusive (honest 0-based axes). */
export function niceTicks(max: number, count = 4): number[] {
	if (max <= 0) return [0, 1];
	const rough = max / count;
	const mag = 10 ** Math.floor(Math.log10(rough));
	const norm = rough / mag;
	const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
	const niceMax = Math.ceil(max / step) * step;
	const ticks: number[] = [];
	for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
	return ticks;
}
