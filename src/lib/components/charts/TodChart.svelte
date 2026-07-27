<script lang="ts">
	import { niceTicks } from './palette';

	// `wearingShareByHour` is optional: the per-watch page pairs it with the
	// put-on histogram, but /stats omits it — there the same quantity is the
	// column marginal of the weekday × hour heatmap (DowTodHeatmap), and
	// drawing it twice on one page was the page's main redundancy.
	let { putOnByHour, wearingShareByHour }: { putOnByHour: number[]; wearingShareByHour?: number[] } =
		$props();

	const PLOT_W = 700;
	const PLOT_H = 90;
	const COL = PLOT_W / 24;
	const BAR_W = Math.min(20, COL - 4);

	const maxPutOn = $derived(Math.max(0, ...putOnByHour));
	const putOnTicks = $derived(niceTicks(maxPutOn, 3));
	const putOnMax = $derived(putOnTicks[putOnTicks.length - 1] || 1);

	// Wearing share is already a 0–1 ratio; fixed honest scale, ticks at 0/50/100%.
	const shareTicks = [0, 0.5, 1];

	function hourLabel(h: number) {
		const period = h < 12 ? 'a' : 'p';
		const hr = h % 12 === 0 ? 12 : h % 12;
		return `${hr}${period}`;
	}
	// Same tick hours as TodByWatchChart and DowTodHeatmap — on /stats this
	// chart sits directly above the by-watch stack on a shared hour axis, and
	// two axes marked differently under one card heading read as two clocks.
	const xLabelHours = [0, 6, 12, 18, 23];

	function areaPath(values: number[], scaleMax: number, height: number) {
		const pts = values.map((v, h) => {
			const x = (h + 0.5) * COL;
			const y = height - (v / scaleMax) * height;
			return [x, y];
		});
		const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
		const first = pts[0];
		const last = pts[pts.length - 1];
		const area = `${line} L${last[0]},${height} L${first[0]},${height} Z`;
		return { line, area };
	}

	const share = $derived(wearingShareByHour ? areaPath(wearingShareByHour, 1, PLOT_H) : null);
</script>

<div class="chart-palette tod-chart">
	<section>
		<h3>Put-on times</h3>
		<svg viewBox="0 0 {PLOT_W + 40} {PLOT_H + 26}" role="img" aria-label="Number of times a watch was put on, by hour of day">
			<!-- 36px gutter, matching TodByWatchChart's: on /stats the two sit in
			     one card and their hour axes have to line up column-for-column. -->
			<g transform="translate(36, 0)">
				{#each putOnTicks as t}
					<line x1="0" x2={PLOT_W} y1={PLOT_H - (t / putOnMax) * PLOT_H} y2={PLOT_H - (t / putOnMax) * PLOT_H} class="gridline" />
					<text x="-8" y={PLOT_H - (t / putOnMax) * PLOT_H} class="ytick" text-anchor="end" dominant-baseline="middle">{t}</text>
				{/each}
				<line x1="0" x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} class="baseline" />
				{#each putOnByHour as count, h}
					{@const height = (count / putOnMax) * PLOT_H}
					{@const cx = (h + 0.5) * COL}
					{#if height > 0}
						<rect x={cx - BAR_W / 2} y={PLOT_H - height} width={BAR_W} height={height} rx="2" class="bar">
							<title>{hourLabel(h)} · {count} put-on{count === 1 ? '' : 's'}</title>
						</rect>
					{/if}
				{/each}
				{#each xLabelHours as h}
					<text x={(h + 0.5) * COL} y={PLOT_H + 18} class="xtick" text-anchor="middle">{hourLabel(h)}</text>
				{/each}
			</g>
		</svg>
	</section>

	{#if wearingShareByHour && share}
	<section>
		<h3>Wearing share <span class="qualifier">— of tracked days</span></h3>
		<svg viewBox="0 0 {PLOT_W + 40} {PLOT_H + 26}" role="img" aria-label="Share of days the watch was on the wrist, by hour of day">
			<g transform="translate(36, 0)">
				{#each shareTicks as t}
					<line x1="0" x2={PLOT_W} y1={PLOT_H - t * PLOT_H} y2={PLOT_H - t * PLOT_H} class="gridline" />
					<text x="-8" y={PLOT_H - t * PLOT_H} class="ytick" text-anchor="end" dominant-baseline="middle">{Math.round(t * 100)}%</text>
				{/each}
				<line x1="0" x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} class="baseline" />
				<path d={share.area} class="area" />
				<path d={share.line} class="line" />
				{#each wearingShareByHour as v, h}
					<rect x={h * COL} y="0" width={COL} height={PLOT_H} fill="transparent">
						<title>{hourLabel(h)} · {Math.round(v * 100)}% wearing share</title>
					</rect>
				{/each}
				{#each xLabelHours as h}
					<text x={(h + 0.5) * COL} y={PLOT_H + 18} class="xtick" text-anchor="middle">{hourLabel(h)}</text>
				{/each}
			</g>
		</svg>
	</section>
	{/if}
</div>

<style>
	.tod-chart {
		display: grid;
		gap: 1.25rem;
	}
	/* Axis chrome (.gridline/.baseline/.ytick/.xtick) and the panel-heading
	   idiom (h3/.qualifier) come from app.css, keyed off .chart-palette — this
	   chart is single-series (no watch legend), but shares the same vocabulary
	   as the multi-series charts. */
	svg {
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.bar {
		fill: var(--accent);
	}
	.area {
		fill: var(--accent);
		opacity: 0.12;
	}
	.line {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
