<script lang="ts">
	import { locale } from '~/i18n';
	import { blockIdx, attentionHeadIdx, tokens } from '~/store';
	import { loraContrast } from '~/courses/loraContrast';
	import Matrix from '~/components/common/Matrix.svelte';
	import * as d3 from 'd3';

	$: zh = $locale !== 'en';
	$: c = $loraContrast;
	$: show = c.active && !!c.base;
	$: key = `block_${$blockIdx}_attn_head_${$attentionHeadIdx}_attn_dropout`;
	$: baseMap = (c.base?.outputs?.[key]?.data || []) as (number | null)[][];
	$: tunedMap = (c.tuned?.outputs?.[key]?.data || []) as (number | null)[][];
	$: n = Math.max($tokens.length, baseMap.length, tunedMap.length, 1);

	const abs = (a: number | null | undefined, b: number | null | undefined) => {
		if (a == null && b == null) return -Infinity;
		return Math.abs((a ?? 0) - (b ?? 0));
	};

	$: diffData =
		c.base && c.tuned && baseMap.length && tunedMap.length
			? baseMap.map((row, i) => row.map((v, j) => abs(v, tunedMap[i]?.[j])))
			: [];
	$: maxDiff = diffData.reduce((m, row) => Math.max(m, ...row.filter((x) => Number.isFinite(x))), 0);
	$: shownMax = Math.max(maxDiff, c.meta?.maxAttnDelta ?? 0);
	$: cellSize = Math.min(14, Math.max((1 / n) * 16 * 6, 8));

	const diffScale = (d: number) => {
		if (!Number.isFinite(d) || shownMax <= 0) return '#f8fafc';
		return d3.interpolate('white', '#c2410c')(Math.min(1, d / shownMax));
	};

	const fmt = (v: number) => (v >= 0.001 ? v.toFixed(4) : v.toExponential(2));
</script>

{#if show}
	<aside class="lens" data-te-lora="attn-lens" data-te-lora-side={c.side} class:lora={c.side === 'lora'} class:base={c.side === 'base'}>
		<svg class="swatch" width="16" height="16" aria-hidden="true">
			<rect
				data-te-lora="attn-swatch"
				x="0"
				y="0"
				width="16"
				height="16"
				fill={c.side === 'lora' ? '#6d28d9' : '#334155'}
			></rect>
		</svg>
		<div class="copy">
			<p class="kicker" data-te-lora="attn-side-label">
				{c.side === 'lora'
					? zh
						? '桑基图正在看：装上这次 LoRA 之后'
						: 'The Sankey is showing: after this LoRA is attached'
					: zh
						? '桑基图正在看：微调前基线'
						: 'The Sankey is showing: the baseline before fine-tune'}
			</p>
			{#if c.tuned && shownMax > 0}
				<p class="note">
					{zh
						? `左边格子仍是这一侧的真实注意力。右边这张小图把「两边差了多少」按当前最大差 ${fmt(shownMax)} 拉开展示，方便看见变化落在哪一格；不是把真实差值放大去改权重。现在是第 ${$blockIdx + 1} 层、第 ${$attentionHeadIdx + 1} 个头。`
						: `The grid on the left still shows this side's real attention. The small map on the right stretches “how much the two sides differ” to the current max of ${fmt(shownMax)}, so you can see which cells moved — it does not amplify the values used as weights. You are on layer ${$blockIdx + 1}, head ${$attentionHeadIdx + 1}.`}
				</p>
			{/if}
		</div>
		{#if diffData.length}
			<div class="diff" data-te-lora="attn-diff">
				<Matrix
					className="lora-diff"
					data={diffData}
					showSize={false}
					cellHeight={cellSize}
					cellWidth={cellSize}
					rowGap={2}
					colGap={2}
					shape={'circle'}
					colorScale={diffScale}
				/>
				<p class="diff-label">{zh ? '两边差值' : 'Difference'}</p>
			</div>
		{/if}
	</aside>
{/if}

<style>
	.lens {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.45rem 0.7rem;
		margin: 0.35rem 0.5rem 0.15rem;
		padding: 0.4rem 0.55rem;
		border: 1px solid #e9d5ff;
		border-radius: 0.45rem;
		background: #faf5ff;
		max-width: 22rem;
		font-size: 0.72rem;
		line-height: 1.4;
		color: #4c1d95;
	}
	.lens.base {
		border-color: #cbd5e1;
		background: #f8fafc;
		color: #334155;
	}
	.swatch {
		flex: 0 0 auto;
		margin-top: 0.15rem;
		border-radius: 0.2rem;
		overflow: hidden;
	}
	.copy {
		flex: 1 1 10rem;
		min-width: 8rem;
	}
	.kicker {
		margin: 0;
		font-weight: 700;
	}
	.note,
	.diff-label {
		margin: 0.2rem 0 0;
		color: #6b7280;
		font-size: 0.68rem;
	}
	.diff {
		flex: 0 0 auto;
		text-align: center;
	}
</style>
