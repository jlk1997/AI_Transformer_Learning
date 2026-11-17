<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher<{ choose: 'lora' | 'freeze' | 'full' }>();

	export let zh = true;
	export let method: 'lora' | 'freeze' | 'full' = 'lora';
	export let layers = 12;
	export let unfreezeLast = 2;
	export let outputOnly = false;
	export let loraR = 16;
	export let modules: string[] = ['attn.c_attn', 'attn.c_proj'];
	export let showPicks = false;

	$: layerIds = Array.from({ length: layers }, (_, i) => i + 1);
	$: rScale = Math.max(0.35, Math.min(1.4, loraR / 16));
	$: hasAttn = method === 'lora' && modules.some((m) => m.includes('attn') && m.includes('c_attn'));
	$: hasProj = method === 'lora' && modules.some((m) => m.includes('c_proj'));
	$: hasMlp = method === 'lora' && modules.some((m) => m.includes('mlp') || m.includes('fc'));

	const lit = (i: number) => {
		if (method === 'full') return true;
		if (method === 'lora') return false;
		if (outputOnly) return false;
		return i > layers - unfreezeLast;
	};
	$: outputLit = method === 'full' || (method === 'freeze' && (outputOnly || true));
	$: embedLit = method === 'full';
	$: caption =
		method === 'full'
			? zh
				? '全量：注意力、前馈、残差两侧和层归一化几乎都亮，都会被更新。更容易跟上语料，也更吃显存。'
				: 'Full: attention, the feed-forward, residual sides, and layer norm almost all light up and will be updated. It follows the corpus more easily, and uses more memory.'
			: method === 'freeze'
				? outputOnly
					? zh
						? '冻结：块里的注意力和前馈保持灰色，只亮靠后的输出层。'
						: 'Freeze: attention and the feed-forward stay grey; only the later output layer lights up.'
					: zh
						? `冻结：只亮最后 ${unfreezeLast} 层和输出层。前面各层里的注意力、前馈、残差和层归一化都保持原样。`
						: `Freeze: only the last ${unfreezeLast} layers and the output light up. Attention, the feed-forward, residual, and layer norm in earlier layers stay as they were.`
				: zh
					? '旁边加一小块（LoRA）：文字课里见过的查询 Q、键 K、值 V 投影本身不动，亮着的是加在它们旁边的一小块。没合并前，基座原文件通常还在。'
					: 'A small add-on (LoRA): the query Q, key K, and value V projections you saw in the text course stay still. The lit pieces are the small add-ons beside them. Until you merge, the original base file usually stays unchanged.';


	const dimOf = (n: number) => (n >= 20 ? 1024 : 768);
	const loraCount = (r: number) => {
		const d = dimOf(layers);
		let per = 0;
		if (modules.some((m) => m.includes('c_attn'))) per += r * (d + d * 3);
		if (modules.some((m) => m.includes('c_proj'))) per += r * (d + d);
		if (modules.some((m) => m.includes('mlp') || m.includes('fc'))) per += r * (d + d * 4);
		if (per === 0) per = r * (d + d * 3) + r * (d + d);
		return per * layers;
	};
	const fullCount = () => {
		const d = dimOf(layers);
		let per = 0;
		if (modules.some((m) => m.includes('c_attn'))) per += d * (d * 3);
		if (modules.some((m) => m.includes('c_proj'))) per += d * d;
		if (modules.some((m) => m.includes('mlp') || m.includes('fc'))) per += d * (d * 4);
		if (per === 0) per = d * (d * 3) + d * d;
		return per * layers;
	};
	const approx = (n: number) => {
		if (n >= 10000) {
			const wan = Math.round(n / 10000);
			return zh ? `约 ${wan} 万` : `about ${wan * 10},000`;
		}
		return zh ? `约 ${n}` : `about ${n}`;
	};
	$: n4 = loraCount(4);
	$: n16 = loraCount(16);
	$: nFull = fullCount();
	const pick = (m: 'lora' | 'freeze' | 'full') => {
		dispatch('choose', m);
	};
</script>

<div class="ft-method-viz" data-te-bridge="method">
	<p class="kicker">{zh ? '三种方法画在同一套块结构上' : 'The three methods, drawn on the same blocks'}</p>
	{#if showPicks}
		<div class="pills" role="tablist">
			<button type="button" class:on={method === 'lora'} on:click={() => pick('lora')}>{zh ? '旁边加一小块（LoRA）' : 'A small add-on (LoRA)'}</button>
			<button type="button" class:on={method === 'freeze'} on:click={() => pick('freeze')}>{zh ? '只改最后几层（冻结）' : 'Only the last layers (freeze)'}</button>
			<button type="button" class:on={method === 'full'} on:click={() => pick('full')}>{zh ? '几乎全部改（全量）' : 'Almost all weights (full)'}</button>
		</div>
	{/if}

	<div class="block-card">
		<p class="blk-title">{zh ? '一层里的块（和文字课同一套名字）' : 'The blocks inside one layer (the same names as the text course)'}</p>
		<div class="attn" class:on={method === 'full'} class:frozen={method === 'freeze'}>
			<span class="lab">{zh ? '注意力' : 'Attention'}</span>
			<div class="qkv">
				<div class="proj">
					<strong>Q</strong>
					<em>{zh ? '查询' : 'Query'}</em>
					{#if hasAttn}<i class="adapter" style="--r:{rScale}" title="LoRA"></i>{/if}
				</div>
				<div class="proj">
					<strong>K</strong>
					<em>{zh ? '键' : 'Key'}</em>
					{#if hasAttn}<i class="adapter" style="--r:{rScale}"></i>{/if}
				</div>
				<div class="proj">
					<strong>V</strong>
					<em>{zh ? '值' : 'Value'}</em>
					{#if hasAttn}<i class="adapter" style="--r:{rScale}"></i>{/if}
				</div>
				<div class="proj outp">
					<strong>{zh ? '输出投影' : 'Out proj.'}</strong>
					{#if hasProj}<i class="adapter" style="--r:{rScale}"></i>{/if}
				</div>
			</div>
		</div>
		<div class="row-blocks">
			<div class="mini ffn" class:on={method === 'full'} class:lora-on={hasMlp}>
				<span>{zh ? '前馈' : 'Feed-forward'}</span>
				{#if hasMlp}<i class="adapter" style="--r:{rScale}"></i>{/if}
			</div>
			<div class="mini res" class:on={method === 'full'}>
				<span>{zh ? '残差' : 'Residual'}</span>
			</div>
			<div class="mini ln" class:on={method === 'full'}>
				<span>{zh ? '层归一化' : 'Layer norm'}</span>
			</div>
		</div>
	</div>

	<div class="stack">
		<div class="blk embed" class:on={embedLit}>
			<span>{zh ? '词嵌入' : 'Embed'}</span>
		</div>
		<div class="layers">
			{#each layerIds as n}
				<div class="blk layer" class:on={lit(n)} class:lora={method === 'lora'} title={zh ? `第 ${n} 层` : `Layer ${n}`}>
					<span>{n}</span>
					{#if method === 'lora'}
						<i class="adapter" style="--r:{rScale}"></i>
					{/if}
				</div>
			{/each}
		</div>
		<div class="blk out" class:on={outputLit}>
			<span>{zh ? '输出层' : 'Output'}</span>
		</div>
	</div>
	<p class="cap">{caption}</p>
	{#if method === 'lora'}
		<p class="legend">
			<span class="swatch base"></span>{zh ? '原权重（不动）' : 'Original weights (still)'}
			<span class="swatch add"></span>{zh ? '加在 Q / K / V 旁边的一小块（在训练）' : 'The small add-on beside Q / K / V (training)'}
		</p>
	{:else}
		<p class="legend">
			<span class="swatch on"></span>{zh ? '正在更新的块' : 'Blocks being updated'}
			<span class="swatch off"></span>{zh ? '冻结、不动的块' : 'Frozen blocks'}
		</p>
	{/if}

	{#if method === 'lora'}
		<div class="rank-contrast" data-te-lora="rank">
			<p class="rank-kicker">{zh ? '先看这一小块有多宽：r=4 和 r=16 要训多少个数' : 'First see how wide this add-on is: how many numbers r=4 vs r=16 train'}</p>
			<div class="rank-row">
				<div class="rank-col">
					<span class="rank-lab">r=4</span>
					<i class="adapter demo" style="--r:{Math.max(0.35, Math.min(1.4, 4 / 16))}"></i>
					<strong>{approx(n4)}</strong>
				</div>
				<div class="rank-col">
					<span class="rank-lab">r=16</span>
					<i class="adapter demo" style="--r:{Math.max(0.35, Math.min(1.4, 16 / 16))}"></i>
					<strong>{approx(n16)}</strong>
				</div>
			</div>
			<p class="rank-note">
				{zh
					? `r=16 大约是 r=4 的 4 倍个数。这两类原权重本身大约是 ${approx(nFull)}，所以旁边这一小块远远更省显存。以上是按本课 GPT-2、默认加在注意力投影旁、${layers} 层估算的示意约数，不是训练器现场读数，也不会在这里开训。当前图上的小块宽度是 r=${loraR}。`
					: `r=16 trains about 4× as many numbers as r=4. Those original matrices themselves are ${approx(nFull)}, so the small add-on uses far less memory. These are sketch estimates for this lesson’s GPT-2, with the default add-on beside the attention projections, over ${layers} layers — not a live trainer readout, and this will not start a train. The add-on on the diagram right now is r=${loraR}.`}
			</p>
			<details class="alpha-fold">
				<summary>{zh ? '看清 r 的差别之后，再看 α' : 'After the r contrast, look at α'}</summary>
				<p>
					{zh
						? 'α 只调节这一小块混进去的力度，不改「有多少个数在训练」。先看宽度 r，再谈 α。这里只讲解，不开训。'
						: 'α only scales how strongly the add-on is mixed in. It does not change how many numbers are being trained. See width r first, then α. This only explains; it does not start a train.'}
				</p>
			</details>
		</div>
	{/if}
</div>

<style>
	.ft-method-viz { border: 1px solid #ede9fe; border-radius: 0.5rem; padding: 0.6rem 0.7rem 0.55rem; background: #faf8ff; margin: 0 0 0.7rem; }
	.kicker { margin: 0 0 0.4rem; font-size: 0.75rem; color: #6d28d9; font-weight: 700; }
	.pills { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0 0 0.5rem; }
	.pills button { border: 1px solid #ddd6fe; background: white; color: #5b21b6; border-radius: 999px; padding: 0.2rem 0.6rem; cursor: pointer; font-size: 0.75rem; font-weight: 600; }
	.pills button.on { background: #7c3aed; color: white; border-color: #7c3aed; }
	.block-card { border: 1px dashed #ddd6fe; border-radius: 0.45rem; padding: 0.45rem 0.5rem 0.5rem; margin: 0 0 0.5rem; background: white; }
	.blk-title { margin: 0 0 0.35rem; font-size: 0.72rem; color: #6b7280; font-weight: 600; }
	.attn { border: 1px solid #e5e7eb; border-radius: 0.4rem; padding: 0.35rem 0.4rem; background: #f3f4f6; color: #6b7280; transition: background 0.35s, border-color 0.35s, color 0.35s; }
	.attn.on { background: #ede9fe; border-color: #c4b5fd; color: #4c1d95; }
	.attn .lab { display: block; font-size: 0.72rem; font-weight: 700; margin-bottom: 0.3rem; }
	.qkv { display: flex; flex-wrap: wrap; gap: 0.35rem; }
	.proj { position: relative; min-width: 3.2rem; border: 1px solid #e5e7eb; border-radius: 0.3rem; padding: 0.2rem 0.45rem 0.2rem 0.3rem; background: #e5e7eb; display: flex; flex-direction: column; transition: background 0.35s, border-color 0.35s; }
	.attn.on .proj { background: #7c3aed; border-color: #6d28d9; color: white; }
	.proj strong { font-size: 0.85rem; line-height: 1.1; }
	.proj em { font-style: normal; font-size: 0.65rem; opacity: 0.85; }
	.row-blocks { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
	.mini { position: relative; flex: 1 1 5rem; min-height: 2rem; border-radius: 0.35rem; background: #e5e7eb; color: #6b7280; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.4rem; transition: background 0.35s, color 0.35s, box-shadow 0.35s; }
	.mini.on { background: #7c3aed; color: white; box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2); }
	.stack { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
	.layers { display: flex; flex-wrap: wrap; gap: 0.3rem; }
	.blk { position: relative; min-width: 2rem; min-height: 2.2rem; border-radius: 0.35rem; background: #e5e7eb; color: #6b7280; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.35rem; transition: background 0.35s, color 0.35s, box-shadow 0.35s; }
	.blk.on { background: #7c3aed; color: white; box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2); }
	.blk.lora { background: #e5e7eb; color: #6b7280; box-shadow: none; }
	.embed, .out { min-width: 3.2rem; }
	.adapter { position: absolute; right: -0.28rem; top: 50%; transform: translateY(-50%); width: calc(0.42rem * var(--r, 1)); height: calc(1.15rem * var(--r, 1)); max-height: 1.6rem; background: #7c3aed; border-radius: 0.12rem; box-shadow: 0 0 0 1px #ddd6fe; transition: width 0.35s, height 0.35s, opacity 0.35s; }
	.cap { margin: 0.5rem 0 0.2rem; font-size: 0.8rem; color: #374151; line-height: 1.5; }
	.legend { margin: 0.15rem 0 0; font-size: 0.72rem; color: #6b7280; display: flex; gap: 0.7rem; align-items: center; flex-wrap: wrap; }
	.swatch { width: 0.7rem; height: 0.7rem; border-radius: 0.15rem; display: inline-block; }
	.swatch.base, .swatch.off { background: #e5e7eb; }
	.swatch.add, .swatch.on { background: #7c3aed; }
	.rank-contrast { margin: 0.55rem 0 0; padding: 0.45rem 0.5rem 0.4rem; background: white; border: 1px dashed #ddd6fe; border-radius: 0.4rem; }
	.rank-kicker { margin: 0 0 0.35rem; font-size: 0.75rem; font-weight: 700; color: #6d28d9; }
	.rank-row { display: flex; gap: 0.8rem; align-items: end; }
	.rank-col { display: flex; flex-direction: column; gap: 0.25rem; min-width: 6rem; }
	.rank-col .adapter.demo { position: static; transform: none; display: block; }
	.rank-lab { font-size: 0.72rem; color: #6b7280; font-weight: 700; }
	.rank-col strong { font-size: 0.9rem; color: #4c1d95; }
	.rank-note { margin: 0.4rem 0 0.2rem; font-size: 0.78rem; color: #374151; line-height: 1.5; }
	.alpha-fold { margin: 0.25rem 0 0; font-size: 0.78rem; color: #4b5563; }
	.alpha-fold summary { cursor: pointer; color: #5b21b6; font-weight: 600; }
	.alpha-fold p { margin: 0.3rem 0 0; line-height: 1.45; }
</style>
