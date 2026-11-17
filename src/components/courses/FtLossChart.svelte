<script lang="ts">
	export let metrics: {
		step?: number;
		trainLoss?: number;
		valLoss?: number;
	}[] = [];
	export let zh = true;
	export let compact = false;

	const W = 480;
	$: H = compact ? (typeof window !== 'undefined' && window.innerHeight <= 740 ? 104 : 132) : 200;
	$: pad = compact ? { l: 36, r: 12, t: 16, b: 24 } : { l: 44, r: 16, t: 18, b: 32 };

	type Pt = { step: number; y: number };
	$: trainPts = points('trainLoss');
	$: valPts = points('valLoss');

	function points(key: 'trainLoss' | 'valLoss'): Pt[] {
		const out: Pt[] = [];
		metrics.forEach((m, i) => {
			const y = m[key];
			if (typeof y === 'number' && Number.isFinite(y)) {
				out.push({ step: typeof m.step === 'number' ? m.step : i, y });
			}
		});
		return out;
	}

	$: allY = [...trainPts, ...valPts].map((p) => p.y);
	$: yMin = allY.length ? Math.min(...allY) : 0;
	$: yMax = allY.length ? Math.max(...allY) : 1;
	$: ySpan = yMax - yMin || 1;
	$: yLo = Math.max(0, yMin - ySpan * 0.12);
	$: yHi = yMax + ySpan * 0.12;
	$: xMin = Math.min(...[...trainPts, ...valPts].map((p) => p.step), 0);
	$: xMax = Math.max(...[...trainPts, ...valPts].map((p) => p.step), 1);

	const xOf = (step: number) => pad.l + ((step - xMin) / (xMax - xMin || 1)) * (W - pad.l - pad.r);
	const yOf = (y: number) => pad.t + (1 - (y - yLo) / (yHi - yLo || 1)) * (H - pad.t - pad.b);

	const poly = (pts: Pt[]) => pts.map((p) => `${xOf(p.step)},${yOf(p.y)}`).join(' ');

	$: yTicks = [yLo, (yLo + yHi) / 2, yHi];
	$: xTicks = xMax <= 1 ? [0, 1] : [xMin, Math.round((xMin + xMax) / 2), xMax];

	$: lastTrain = trainPts.length ? trainPts[trainPts.length - 1] : null;
	$: lastVal = valPts.length ? valPts[valPts.length - 1] : null;

	function trendOf(pts: Pt[]): 'down' | 'jitter' | 'up' | 'flat' | 'none' {
		if (pts.length < 3) return pts.length ? 'flat' : 'none';
		const w = pts.slice(-4);
		const diffs = w.slice(1).map((p, i) => p.y - w[i].y);
		const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
		const energy = diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length;
		const signs = diffs.filter((d) => d !== 0).map((d) => (d > 0 ? 1 : -1));
		const flips = signs.filter((s, i) => i && s !== signs[i - 1]).length;
		if (energy > 0 && flips >= Math.max(1, signs.length - 2) && Math.abs(mean) < energy * 0.5) return 'jitter';
		if (mean < -energy * 0.15 || w[w.length - 1].y < w[0].y - (ySpan * 0.02 || 0.01)) return 'down';
		if (mean > energy * 0.15 || w[w.length - 1].y > w[0].y + (ySpan * 0.02 || 0.01)) return 'up';
		return 'flat';
	}

	$: trainTrend = trendOf(trainPts);
	$: valTrend = trendOf(valPts);

	$: overfitStep = (() => {
		if (valPts.length < 3) return null;
		let minI = 0;
		for (let i = 1; i < valPts.length; i++) if (valPts[i].y < valPts[minI].y) minI = i;
		const minP = valPts[minI];
		const last = valPts[valPts.length - 1];
		if (minI < valPts.length - 1 && last.y > minP.y * 1.03 && last.y - minP.y > 0.01) {
			return minP.step;
		}
		return null;
	})();

	$: bestValPt = valPts.length
		? valPts.reduce((a, b) => (b.y < a.y ? b : a), valPts[0])
		: null;

	$: annotation = (() => {
		if (!trainPts.length && !valPts.length) {
			return zh
				? '开训后，这里会画出有坐标的训练损失和验证损失。'
				: 'After a run starts, the training and validation losses will be drawn with axes.';
		}
		const bits: string[] = [];
		if (trainTrend === 'down') bits.push(zh ? '训练损失正在下降。' : 'Training loss is falling.');
		else if (trainTrend === 'jitter') bits.push(zh ? '训练损失在抖。步子可能偏大。' : 'Training loss is jittering. The step may be large.');
		else if (trainTrend === 'up') bits.push(zh ? '训练损失在往上走。' : 'Training loss is rising.');
		if (overfitStep != null) {
			bits.push(
				zh
					? `训练越来越好，验证开始变差。验证损失从第 ${overfitStep} 步附近开始抬头，这常常是过拟合。训练损失再低也不一定更好。建议留下验证最好的那一次。`
					: `Training gets better; validation starts to get worse. Validation loss starts rising around step ${overfitStep}. That is often overfitting. A lower training loss is not always better. Prefer the step with the best validation loss.`
			);
		} else if (bestValPt && valPts.length >= 2) {
			bits.push(
				zh
					? `验证最好的一步在第 ${bestValPt.step} 步（验证损失 ${bestValPt.y.toFixed(3)}），建议尽量留下这一次。`
					: `The best validation step is ${bestValPt.step} (val loss ${bestValPt.y.toFixed(3)}). Prefer to keep this one.`
			);
		} else if (valTrend === 'down') {
			bits.push(zh ? '验证损失也在往下，还没有明显抬头。' : 'Validation loss is also falling; no clear rise yet.');
		} else if (valTrend === 'up') {
			bits.push(zh ? '验证损失在变差。多训几轮不一定更好。' : 'Validation loss is getting worse. More passes are not automatically better.');
		}
		if (!bits.length) {
			bits.push(zh ? '点还不多，先看数字有没有在动。' : 'There are only a few points so far. Watch whether the numbers move.');
		}
		return bits.join(' ');
	})();

	const fmt = (n: number, d = 3) => n.toFixed(d);
</script>

<div class="ft-loss">
	<svg viewBox="0 0 {W} {H}" width="100%" height={H} role="img" aria-label={zh ? '损失曲线' : 'Loss curves'}>
		<rect x="0" y="0" width={W} height={H} fill="#fafafa" />
		<!-- axes -->
		<line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#9ca3af" />
		<line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#9ca3af" />
		{#each yTicks as yt}
			<line x1={pad.l - 4} y1={yOf(yt)} x2={W - pad.r} y2={yOf(yt)} stroke="#eee" />
			<text x={pad.l - 6} y={yOf(yt) + 3} text-anchor="end" class="tick">{fmt(yt)}</text>
		{/each}
		{#each xTicks as xt}
			<text x={xOf(xt)} y={H - 10} text-anchor="middle" class="tick">{xt}</text>
		{/each}
		<text x={pad.l} y="12" class="axis-name">{zh ? '损失' : 'Loss'}</text>
		<text x={W / 2} y={H - 1} text-anchor="middle" class="axis-name">{zh ? '步数' : 'Step'}</text>
		{#if trainPts.length}
			<polyline fill="none" stroke="#7c3aed" stroke-width="2" points={poly(trainPts)} />
		{/if}
		{#if valPts.length}
			<polyline fill="none" stroke="#ea580c" stroke-width="2" points={poly(valPts)} />
		{/if}
		{#if bestValPt && !compact}
			<line
				x1={xOf(bestValPt.step)}
				y1={pad.t}
				x2={xOf(bestValPt.step)}
				y2={H - pad.b}
				stroke="#0f766e"
				stroke-dasharray="2 3"
			/>
			<circle cx={xOf(bestValPt.step)} cy={yOf(bestValPt.y)} r="4" fill="#0f766e" />
			<text x={xOf(bestValPt.step) + 4} y={pad.t + (overfitStep != null ? 22 : 10)} class="best">{zh ? '验证最好的一步' : 'Best val step'}</text>
		{/if}
		{#if overfitStep != null}
			<line
				x1={xOf(overfitStep)}
				y1={pad.t}
				x2={xOf(overfitStep)}
				y2={H - pad.b}
				stroke="#ea580c"
				stroke-dasharray="4 3"
			/>
			<text x={xOf(overfitStep) + 4} y={pad.t + 10} class="over">{zh ? '验证开始抬头' : 'Val starts rising'}</text>
		{/if}
		{#if lastTrain}
			<circle cx={xOf(lastTrain.step)} cy={yOf(lastTrain.y)} r="3.5" fill="#7c3aed" />
			<text x={xOf(lastTrain.step) - 6} y={yOf(lastTrain.y) - 6} text-anchor="end" class="cur t">{fmt(lastTrain.y)}</text>
		{/if}
		{#if lastVal}
			<circle cx={xOf(lastVal.step)} cy={yOf(lastVal.y)} r="3.5" fill="#ea580c" />
			<text x={xOf(lastVal.step) + 6} y={yOf(lastVal.y) - 6} class="cur v">{fmt(lastVal.y)}</text>
		{/if}
	</svg>
	<p class="legend">
		<span class="dot train"></span>
		{zh ? '训练损失（手头数据）' : 'Training loss (data at hand)'}
		{#if lastTrain}<strong>{fmt(lastTrain.y)}</strong>{/if}
		<span class="dot val"></span>
		{zh ? '验证损失（留下来检查的）' : 'Validation loss (held out)'}
		{#if lastVal}<strong>{fmt(lastVal.y)}</strong>{/if}
	</p>
	<p class="note">{annotation}</p>
</div>

<style>
	.ft-loss { margin: 0.3rem 0 0.5rem; }
	svg { display: block; background: #fafafa; border: 1px solid #ede9fe; border-radius: 0.45rem; }
	:global(.ft-loss .tick),
	:global(.ft-loss .axis-name),
	:global(.ft-loss .cur),
	:global(.ft-loss .best),
	:global(.ft-loss .over) {
		font-size: 10px;
		fill: #6b7280;
	}
	:global(.ft-loss .cur.t) { fill: #6d28d9; font-weight: 700; }
	:global(.ft-loss .cur.v) { fill: #c2410c; font-weight: 700; }
	:global(.ft-loss .over) { fill: #c2410c; font-size: 10px; }
	:global(.ft-loss .best) { fill: #0f766e; font-size: 10px; font-weight: 600; }
	.legend { font-size: 0.8rem; color: #4b5563; margin: 0.35rem 0 0.15rem; display: flex; flex-wrap: wrap; gap: 0.35rem 0.7rem; align-items: center; }
	.legend strong { color: #1f2937; }
	.dot { width: 0.6rem; height: 0.6rem; border-radius: 99px; display: inline-block; }
	.dot.train { background: #7c3aed; }
	.dot.val { background: #ea580c; }
	.note { font-size: 0.8rem; color: #6b7280; line-height: 1.5; margin: 0; }
</style>
