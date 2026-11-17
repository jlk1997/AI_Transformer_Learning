<script lang="ts">
	import { QLORA_SIZES, QLORA_VRAM_BUDGET_GB, SAFETY_EN, SAFETY_ZH } from '~/courses/finetune/laterLabs';

	export let zh = true;
	let sizeId = 'gpt2';
	$: size = QLORA_SIZES.find((s) => s.id === sizeId) || QLORA_SIZES[0];
	$: loraGb = size.loraMb / 1024;
	$: full = size.fp16Gb + loraGb;
	$: quant = size.int4Gb + loraGb;
	$: budget = QLORA_VRAM_BUDGET_GB;
	const pct = (gb: number) => Math.min(100, (gb / (budget * 1.4)) * 100);
</script>

<section class="qlora" data-te-qlora="ready">
	<p class="kicker">{zh ? 'QLoRA：同一套低秩增量，先把基座变瘦' : 'QLoRA: the same low-rank add-on, after slimming the base'}</p>
	<h4>{zh ? '本课 8GB 上的 GPT-2 其实用不到 QLoRA' : 'GPT-2 on this 8GB laptop does not actually need QLoRA'}</h4>
	<p class="later-see-first" data-te-later="see-first">
		{zh
			? '先看这张显存量级对照：同一件事，用完整精度、半精度，还是再压缩，大概会占多少。名字（QLoRA）是后起的。这台约 8GB 上的 GPT-2 用不到它，这里只帮助你建立量级感觉。'
			: 'First look at the memory-scale contrast: how much room the same job takes in full precision, half precision, or a tighter packing. The name (QLoRA) comes after. The GPT-2 on this ~8GB machine does not need it; this is only to build a sense of scale.'}
	</p>

	<p class="tiny">
		{zh
			? 'QLoRA 的想法很具体：先把大基座压到更低比特（常见是约 4bit）以省显存，再像本课一样只训练旁边的低秩增量。对照的仍然是「改哪些投影」，不是把整个模型换掉。下面是大约数，用来看见量级，不是这台机器上的精确实测。本课没有在课内用 4bit 训练大模型。'
			: 'QLoRA’s idea is specific: first compress a large base to lower bits (often about 4-bit) to save memory, then train only the low-rank add-on, as in this course. The contrast is still “which projections change,” not replacing the whole model. The numbers below are rounded magnitudes, not a precise measurement on this machine. This course does not train a large 4-bit model in class.'}
	</p>
	<p class="safety">{zh ? SAFETY_ZH : SAFETY_EN}</p>

	<div class="sizes" role="tablist">
		{#each QLORA_SIZES as s}
			<button type="button" class:on={sizeId === s.id} data-te-qlora-size={s.id} on:click={() => (sizeId = s.id)}>
				{s.name}
			</button>
		{/each}
	</div>

	<div class="board" data-te-qlora="board">
		<p class="tag">{size.name} · {zh ? '相对 8GB 预算（约数）' : 'versus an 8GB budget (approx.)'}</p>
		<div class="bar">
			<div class="fill full" style={`width:${pct(full)}%`} data-te-qlora="full"></div>
			<span class="cap">{zh ? '全精度 LoRA' : 'Full-precision LoRA'} · {full.toFixed(2)} GB</span>
		</div>
		<div class="bar">
			<div class="fill quant" style={`width:${pct(quant)}%`} data-te-qlora="quant"></div>
			<span class="cap">QLoRA · {quant.toFixed(2)} GB</span>
		</div>
		<div class="budget" style={`left:${pct(budget)}%`}><em>8GB</em></div>
		<ul>
			<li>{zh ? '基座 fp16 / 全精度约' : 'Base in fp16 / full precision ≈'} {size.fp16Gb} GB</li>
			<li>{zh ? '基座约 4bit 后约' : 'Base at about 4-bit ≈'} {size.int4Gb} GB</li>
			<li>{zh ? '同一类 LoRA 适配器约' : 'Same kind of LoRA adapter ≈'} {size.loraMb} MB</li>
		</ul>
		<p class="verdict" class:need={size.needQloraOn8gb} data-te-qlora="verdict">
			{size.needQloraOn8gb
				? (zh
					? `在这台 8GB 笔记本上，全精度基座（约 ${size.fp16Gb}GB）会装不下。量化后再贴 LoRA，才是「能训更大模型」的原因。`
					: `On this 8GB laptop, the full-precision base (about ${size.fp16Gb}GB) will not fit. Quantizing first, then attaching LoRA, is why a larger model can be trained at all.`)
				: (zh
					? `在这台 8GB 笔记本上，全精度 LoRA（约 ${full.toFixed(2)}GB）已经进得去。本课对照的就是这种未量化的 GPT-2 LoRA，不必假装已经做了 QLoRA。`
					: `On this 8GB laptop, full-precision LoRA (about ${full.toFixed(2)}GB) already fits. This course contrasts that unquantized GPT-2 LoRA; it does not pretend a QLoRA run already happened.`)}
		</p>
		<p class="tiny">{zh ? size.noteZh : size.noteEn}</p>
	</div>
</section>

<style>
	.qlora { margin: 0.2rem 0 0; color: #4c1d95; }
	.kicker { margin: 0; font-size: 0.75rem; font-weight: 700; color: #6d28d9; }
	h4 { margin: 0.2rem 0 0.35rem; font-size: 0.95rem; }
	.tiny, .safety { font-size: 0.82rem; line-height: 1.5; color: #4b5563; margin: 0.25rem 0 0.45rem; }
	.safety { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; border-radius: 0.4rem; padding: 0.35rem 0.5rem; }
	.sizes { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.4rem 0; }
	.sizes button { border-radius: 999px; border: 1px solid #ddd6fe; background: white; color: #5b21b6; padding: 0.2rem 0.7rem; cursor: pointer; font: inherit; font-weight: 600; }
	.sizes button.on { background: #7c3aed; color: white; border-color: #7c3aed; }
	.board { position: relative; border: 1px solid #ede9fe; border-radius: 0.5rem; padding: 0.6rem 0.7rem 0.75rem; background: white; }
	.tag { margin: 0 0 0.45rem; font-size: 0.75rem; font-weight: 700; }
	.bar { position: relative; height: 1.55rem; background: #f3f4f6; border-radius: 0.3rem; margin: 0 0 0.45rem; overflow: hidden; }
	.fill { height: 100%; border-radius: 0.3rem; }
	.fill.full { background: #c4b5fd; }
	.fill.quant { background: #6ee7b7; }
	.cap { position: absolute; inset: 0 0.4rem 0 0.45rem; display: flex; align-items: center; font-size: 0.75rem; font-weight: 600; color: #1f1633; }
	.budget { position: absolute; top: 1.6rem; bottom: 4.2rem; width: 0; border-left: 1px dashed #9a3412; pointer-events: none; }
	.budget em { position: absolute; top: -0.05rem; left: 0.25rem; font-style: normal; font-size: 0.68rem; color: #9a3412; font-weight: 700; }
	ul { margin: 0.35rem 0; padding-left: 1.1rem; font-size: 0.82rem; color: #4b5563; }
	.verdict { margin: 0.35rem 0 0; font-size: 0.86rem; font-weight: 600; color: #047857; }
	.verdict.need { color: #9a3412; }

	.later-see-first { margin: 0.35rem 0 0.8rem; font-size: 0.9rem; color: #374151; line-height: 1.55; }
</style>
