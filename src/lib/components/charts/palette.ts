// Shared categorical color scale for the stats charts: an 11-hue palette
// tuned per theme, WCAG-contrast-checked against the card surfaces
// (light #f7f8f4, dark #1b1f1c):
//   light: slots 3/4/5/11 land at 2.0-2.9:1 — mitigated by always pairing a
//   colored mark with a text label/legend, never color alone
//   dark:  all slots >= 3.3:1
//
// Order is the CVD-safety mechanism (adjacent slots keep a worst-case
// normal-vision ΔE of ~19.3 and CVD-sim ΔE of ~8.2) — never re-cycle or
// reorder per-chart. The array cycles at the 20-watch quota, so the
// last→first wrap pair (slot 11 -> slot 1) is held to the same bar as every
// interior adjacency. Slots 9-11 are the only open hue positions left:
// teal↔aqua and purple↔violet are near-twins, so they're never placed
// adjacent and are told apart by the legend.
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

/**
 * Stable watchId -> palette rank, assigned by ascending watch id so a given
 * watch always lands on the same rank no matter which chart's own sort order
 * (hours desc, lastWornAt asc, dayKey, ...) is calling this. Pass the full
 * watch-id universe (e.g. every id in `byWatch`), not just the ids visible in
 * one chart's slice, so a watch's color never shifts when a filter changes
 * which chart happens to render it.
 *
 * The value is the stable 0-based rank, uncapped — `slotVar()` maps it to a
 * hue (wrapping past the last slot) and `slotTier()` reports which cycle it
 * lands in, so a legend can flag the second cycle's recycled hues.
 */
export function assignSlots(watchIds: Iterable<number>): Map<number, number> {
	const ids = [...new Set(watchIds)].sort((a, b) => a - b);
	return new Map(ids.map((id, i) => [id, i]));
}

/** CSS custom-property name for a slot, e.g. `var(--series-3)`. The matching
 * `--series-N` values (light + dark, kept in sync with CATEGORICAL above) are
 * declared exactly once, in a `:global(.chart-palette)` rule in
 * `src/routes/stats/+page.svelte` — every chart component's root element
 * carries class="chart-palette" and only ever references `var(--series-N)`,
 * never redeclaring the values itself. (Svelte `<style>` blocks are static
 * CSS text, so this constant can't be interpolated into them — the page's
 * `<style>` block is the single source of truth instead.) */
export function slotVar(slot: number): string {
	return `var(--series-${(slot % CATEGORICAL.length) + 1})`;
}

/** Which color cycle a rank lands in: 0 for the first pass through the 11
 * hues, 1 once ranks wrap and start recycling colors (only tier 1 occurs at
 * the 20-watch quota). Legends/chips ring the tier->=1 swatches so a recycled
 * hue is told apart from its first-cycle twin. */
export function slotTier(index: number): number {
	return Math.floor(index / CATEGORICAL.length);
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
