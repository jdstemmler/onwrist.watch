// Shared categorical color scale for the stats charts: an 8-hue palette
// tuned per theme, WCAG-contrast-checked against the card surfaces
// (light #f7f8f4, dark #1b1f1c):
//   light: slots 3/4/5 land at 2.0-2.6:1 — mitigated by always pairing a
//   colored mark with a text label/legend, never color alone
//   dark:  all slots >= 3.3:1
//
// Order is the CVD-safety mechanism (adjacent slots keep a worst-case
// normal-vision ΔE of ~19.5) — never re-cycle or reorder per-chart.
export type ColorSlot = { light: string; dark: string };

export const CATEGORICAL: ColorSlot[] = [
	{ light: '#2a78d6', dark: '#3987e5' }, // 1 blue
	{ light: '#008300', dark: '#008300' }, // 2 green
	{ light: '#e87ba4', dark: '#d55181' }, // 3 magenta
	{ light: '#eda100', dark: '#c98500' }, // 4 yellow
	{ light: '#1baf7a', dark: '#199e70' }, // 5 aqua
	{ light: '#eb6834', dark: '#d95926' }, // 6 orange
	{ light: '#4a3aa7', dark: '#9085e9' }, // 7 violet
	{ light: '#e34948', dark: '#e66767' } // 8 red
];

/**
 * Stable watchId -> palette slot, assigned by ascending watch id so a given
 * watch always lands on the same slot no matter which chart's own sort order
 * (hours desc, lastWornAt asc, dayKey, ...) is calling this. Pass the full
 * watch-id universe (e.g. every id in `byWatch`), not just the ids visible in
 * one chart's slice, so a watch's color never shifts when a filter changes
 * which chart happens to render it.
 */
export function assignSlots(watchIds: Iterable<number>): Map<number, number> {
	const ids = [...new Set(watchIds)].sort((a, b) => a - b);
	return new Map(ids.map((id, i) => [id, i % CATEGORICAL.length]));
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
