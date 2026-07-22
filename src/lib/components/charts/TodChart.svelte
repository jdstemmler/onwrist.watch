<script lang="ts">
	import { niceTicks } from './palette';

	let { putOnByHour, wearingShareByHour }: { putOnByHour: number[]; wearingShareByHour: number[] } = $props();

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
	const xLabelHours = [0, 4, 8, 12, 16, 20];

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

	const share = $derived(areaPath(wearingShareByHour, 1, PLOT_H));
</script>

<div class="chart-palette tod-chart">
	<section>
		<h3>Put-on times</h3>
		<svg viewBox="0 0 {PLOT_W + 40} {PLOT_H + 26}" role="img" aria-label="Number of times a watch was put on, by hour of day">
			<g transform="translate(30, 0)">
				{#each putOnTicks as t}
					<line x1="0" x2={PLOT_W} y1={PLOT_H - (t / putOnMax) * PLOT_H} y2={PLOT_H - (t / putOnMax) * PLOT_H} class="gridline" />
					<text x="-6" y={PLOT_H - (t / putOnMax) * PLOT_H} class="ytick" text-anchor="end" dominant-baseline="middle">{t}</text>
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

	<section>
		<h3>Wearing share <span class="qualifier">— of tracked days</span></h3>
		<svg viewBox="0 0 {PLOT_W + 40} {PLOT_H + 26}" role="img" aria-label="Share of days the watch was on the wrist, by hour of day">
			<g transform="translate(30, 0)">
				{#each shareTicks as t}
					<line x1="0" x2={PLOT_W} y1={PLOT_H - t * PLOT_H} y2={PLOT_H - t * PLOT_H} class="gridline" />
					<text x="-6" y={PLOT_H - t * PLOT_H} class="ytick" text-anchor="end" dominant-baseline="middle">{Math.round(t * 100)}%</text>
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
</div>

<style>
	.tod-chart {
		display: grid;
		gap: 1.25rem;
	}
	.qualifier {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}

	h3 {
		font-family: var(--font-sans);
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-muted);
		margin: 0 0 0.35rem;
	}
	/* Axis chrome (.gridline/.baseline/.ytick/.xtick) comes from app.css, keyed
	   off .chart-palette — this chart is single-series (no watch legend), but
	   shares the same axis vocabulary as the multi-series charts. */
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
