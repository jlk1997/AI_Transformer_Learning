<script lang="ts">
	import FtProbBars from './FtProbBars.svelte';
	import type { EvalKind } from '~/courses/finetune/presets';
	import type { TokenProb } from '~/courses/finetune/api';

	export let zh = true;
	export let valLoss: number | null = null;
	export let testLoss: number | null = null;
	export let bestValLoss: number | null = null;
	export let bestValStep: number | null = null;
	export let leakVal = false;
	export let reading = '';
	export let filling = false;
	export let items: {
		id: string;
		kind: EvalKind;
		prompt: string;
		base?: string;
		tuned?: string;
		baseProbs?: TokenProb[] | null;
		tunedProbs?: TokenProb[] | null;
	}[] = [];
	export let onFill: (() => void) | null = null;

	const kindLabel = (k: EvalKind) => {
		if (k === 'in') return zh ? '语料内' : 'In-corpus';
		if (k === 'out') return zh ? '语料外' : 'Out-of-corpus';
		if (k === 'forget') return zh ? '另一类（遗忘观察）' : 'Other genre (forgetting)';
		return zh ? '问答格式' : 'Q/A format';
	};

	const fmt = (n: number | null) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(3) : '—');
</script>

<section class="ft-eval card-inner">
	<h3>{zh ? '课内评测卡' : 'In-course eval card'}</h3>
	<p class="tiny">
		{zh
			? '不能只用训练损失和两段续写「像不像」。这里同时看：固定提示词（语料内 + 语料外）、验证损失、并排概率条与续写。若语料内更像笔记、语料外却变差，就是「像语料但泛化变差」。这是课内评测卡，不是通用评测平台。'
			: 'Do not judge only by training loss or whether two snippets “look alike.” This card shows a fixed prompt set (in-corpus and out-of-corpus), validation loss, and side-by-side probability bars plus continuations. If in-corpus looks like the notes but out-of-corpus gets worse, that is “looks like the corpus, but generalizes worse.” This is an in-course card, not a general eval platform.'}
	</p>
	<div class="nums">
		<p><span>{zh ? '验证损失' : 'Val loss'}</span> <strong>{fmt(valLoss)}</strong></p>
		<p><span>{zh ? '测试损失' : 'Test loss'}</span> <strong>{fmt(testLoss)}</strong></p>
		<p>
			<span>{zh ? '验证最好的一步' : 'Best val step'}</span>
			<strong>{bestValStep != null ? (zh ? `第 ${bestValStep} 步` : `step ${bestValStep}`) : '—'} · {fmt(bestValLoss)}</strong>
		</p>
	</div>
	{#if leakVal}
		<p class="warn tiny">
			{zh
				? '验证集漏进了训练，验证读数可能假好，不能单独拿它下结论。'
				: 'The validation set leaked into training, so the val score may look falsely good and should not be trusted on its own.'}
		</p>
	{/if}
	<p class="tiny ft-forget-note">
		{zh
			? '遗忘观察：微调后更像笔记了，但换一类本来会写的提示（短诗、故事开头）可能变差，或也开始往笔记上靠。请对比下面标成「另一类」的提示。'
			: 'Forgetting check: after fine-tuning, writing may look more like the notes, while a different kind of prompt the base model could handle (a short verse, a story opening) may get worse, or also drift toward the notes. Compare the prompts marked “other genre.”'}
	</p>
	{#if onFill}
		<button type="button" class="primary ft-eval-fill" disabled={filling} on:click={() => onFill && onFill()}>
			{filling ? (zh ? '正在填写评测卡…' : 'Filling the eval card…') : (zh ? '用固定提示填写评测卡' : 'Fill the card with the fixed prompts')}
		</button>
	{/if}
	<ul class="prompts">
		{#each items as it}
			<li class="prompt-card" data-kind={it.kind}>
				<p class="kind">{kindLabel(it.kind)}</p>
				<pre class="prompt">{it.prompt}</pre>
				{#if it.baseProbs && it.baseProbs.length}
					<FtProbBars baseProbs={it.baseProbs || []} tunedProbs={it.tunedProbs || []} hasTuned={!!(it.tunedProbs && it.tunedProbs.length)} {zh} />
				{/if}
				<div class="two">
					<div>
						<p class="lbl">{zh ? '微调前' : 'Before'}</p>
						<p class="snip">{it.base || (zh ? '还没填写' : 'Not filled yet')}</p>
					</div>
					<div>
						<p class="lbl">{zh ? '微调后' : 'After'}</p>
						<p class="snip">{it.tuned || (zh ? '还没填写（先做一次能通的训练）' : 'Not filled yet (run a short training first)')}</p>
					</div>
				</div>
			</li>
		{/each}
	</ul>
	{#if reading}
		<p class="reading">{reading}</p>
	{/if}
</section>

<style>
	.ft-eval { margin: 0.6rem 0 0; }
	h3 { margin: 0 0 0.3rem; font-size: 1rem; }
	.tiny { font-size: 0.82rem; color: #4b5563; line-height: 1.55; margin: 0.2rem 0 0.45rem; }
	.warn { color: #9a3412; background: #fff7ed; border: 1px solid #fdba74; padding: 0.4rem 0.55rem; border-radius: 0.4rem; }
	.nums { display: flex; flex-wrap: wrap; gap: 0.6rem 1.2rem; margin: 0.4rem 0; }
	.nums p { margin: 0; font-size: 0.85rem; color: #374151; display: flex; flex-direction: column; }
	.nums strong { font-size: 1rem; color: #111827; }
	.prompts { list-style: none; padding: 0; margin: 0.4rem 0; display: grid; gap: 0.7rem; }
	.prompt-card { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.55rem 0.7rem; background: #fff; }
	.prompt-card[data-kind='out'],
	.prompt-card[data-kind='forget'] { border-color: #fdba74; background: #fffbeb; }
	.prompt-card[data-kind='sft'] { border-color: #c4b5fd; background: #f5f3ff; }
	.kind { margin: 0 0 0.2rem; font-size: 0.75rem; font-weight: 700; color: #6d28d9; letter-spacing: 0.02em; }
	.prompt { margin: 0 0 0.4rem; white-space: pre-wrap; font-size: 0.86rem; font-family: inherit; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.lbl { margin: 0; font-size: 0.75rem; color: #6b7280; }
	.snip { margin: 0.15rem 0 0; font-size: 0.84rem; line-height: 1.5; white-space: pre-wrap; }
	.reading { background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 0.45rem; padding: 0.55rem 0.7rem; font-size: 0.88rem; line-height: 1.55; color: #065f46; }
	@media (max-width: 720px) {
		.two { grid-template-columns: 1fr; }
	}
</style>
