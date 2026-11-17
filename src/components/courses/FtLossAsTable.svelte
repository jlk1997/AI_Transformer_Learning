<script lang="ts">
	import { BRIDGE_SENTENCE_ZH } from '~/courses/bridge';
	import MathWalkCard from '~/components/MathWalkCard.svelte';
	import { fmt, type MathCardModel } from '~/courses/mathWalk';
	import { inlinedWalkRequest } from '~/tutor/store';
	import FtWeightMove from './FtWeightMove.svelte';

	export let zh = true;
	export let compact = false;
	export let showWalk = false;

	// Pedagogical sketch, not a live run. The true next chip is ranked low, so the loss is high.
	const prompt = '残差连接把前面的信号加到';
	const rows = [
		{ tok: '的', p: 0.22, trueTok: false },
		{ tok: '了', p: 0.18, trueTok: false },
		{ tok: '一', p: 0.11, trueTok: false },
		{ tok: '后', p: 0.04, trueTok: true }
	];
	const pTrue = 0.04;
	const inv = 1 / pTrue;
	const loss = Math.log(inv);
	const lossHalf = Math.log(2);

	$: walkCard = buildLossCard(zh);
	$: weightCard = buildWeightCard(zh);
	let weightOpen = false;
	$: if ($inlinedWalkRequest === 'weight') {
		weightOpen = true;
		inlinedWalkRequest.set(null);
		if (typeof document !== 'undefined') {
			requestAnimationFrame(() => {
				document.querySelector('[data-te-math="weight-walk"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			});
		}
	}

	function buildLossCard(isZh: boolean): MathCardModel {
		return {
			id: 'loss',
			title: isZh ? '损失是怎么从这张表算出来的' : 'How loss is calculated from this table',
			now: isZh
				? '现在算什么：正确的下一个词在这张表里太低，要把「没猜对的程度」写成一个越大越糟的数。'
				: 'What we are computing: the correct next word is too low on this table, so we write “how wrong the guess is” as a number that gets larger when the guess is worse.',
			steps: [
				{
					talk: isZh
						? `看到「${prompt}」时，真正该出现的下一个字是「后」。可是在这张示意表里，「后」只有 ${pTrue.toFixed(2)}，也就是 4%，排在后面。`
						: `After “${prompt}”, the true next character is “后”. On this sketch table, “后” only has ${pTrue.toFixed(2)}, which is 4%, and it is ranked low.`,
					expr: isZh ? '「后」的概率 = 0.04 = 4%' : 'probability of “后” = 0.04 = 4%'
				},
				{
					talk: isZh
						? '训练要做的，是让「后」在表上往上走。先把这个偏低的数，改写成一个「越没猜对越大」的账。'
						: 'Training tries to move “后” up the table. First we rewrite this low number as a tally that gets larger the more wrong the guess is.',
					expr: isZh ? '4% 太低 → 没猜对的程度应该比较大' : '4% is too low → the “how wrong” number should be fairly large'
				},
				{
					talk: isZh
						? `把 0.04 写成 1/25。再问：哪一个数 x，让 e^x 大约等于 25？大约是 ${fmt(loss)}。正确词只占 4% 时，这笔账就是 ${fmt(loss)}。`
						: `Write 0.04 as 1/25. Then ask: which number x makes e^x about 25? It is about ${fmt(loss)}. When the correct word only has 4%, this tally is ${fmt(loss)}.`,
					expr: `1 ÷ 0.04 = 25，  e^${fmt(loss)} ≈ 25`
				},
				{
					talk: isZh
						? `如果「后」有一半机会（0.50），这个数大约只有 ${fmt(lossHalf)}，小很多。越没猜对，这个数越大。它有个名字，叫交叉熵损失。`
						: `If “后” had a 50% chance (0.50), this number would be only about ${fmt(lossHalf)} — much smaller. The worse the guess, the larger the number. Its name is cross-entropy loss.`,
					expr: isZh
						? `4% → ${fmt(loss)}（偏高）　50% → ${fmt(lossHalf)}（小很多）`
						: `4% → ${fmt(loss)} (high)　50% → ${fmt(lossHalf)} (much smaller)`
				}
			],
			pointsTo: isZh
				? '得到画面上哪一块：上面这张示意概率表里高亮的「后」，以及四拍「训练的一步」里看损失的那一拍。还不要先去拧学习率。'
				: 'Where it shows up: the highlighted “后” on the sketch table above, and the “look at the loss” beat in the four-beat “one training step” figure. Do not go to the learning rate yet.',
			myth: isZh
				? '常见误解：损失不是作文分，也不是「好不好听」。它只是在问：正确的下一个词，在右边这类表里够不够高。'
				: 'A common mix-up: loss is not an essay score, and it is not “how nice it sounds”. It only asks whether the correct next word is high enough on a table like this.',
			source: 'sketch',
			sourceNote: isZh
				? '这张表和算出的 3.2 都是示意，用来把计算走完。真正训练时会对语料里每一个位置这样算，再平均。'
				: 'The table and the 3.2 are a sketch, so the arithmetic can be walked through. In real training this is computed at every position in the corpus, then averaged.',
			highlightSel: '[data-te-bridge="loss-table"], [data-te-math="loss-walk"], .ft-loop'
		};
	}

	function buildWeightCard(isZh: boolean): MathCardModel {
		return {
			id: 'weight',
			title: isZh ? '这个数怎么让一条权重动' : 'How this number nudges a weight',
			now: isZh
				? '现在看什么：损失偏高之后，示意里有一条通向「后」的权重被轻轻推了一下。先看见这一推，再给它起名字。'
				: 'What to watch: after the loss is high, a sketch weight toward “后” is nudged a little. See that move first, then name it.',
			steps: [
				{
					talk: isZh
						? '先看上面这张示意表：「后」只有 4%，也就是 1/25，这笔账大约是 3.2，偏高。这些数是示意，不是训练曲线上的实时平均。'
						: 'First look at the sketch table above: “后” has only 4%, which is 1/25, and the tally is about 3.2 — too high. These numbers are a sketch, not a live average from a training curve.',
					expr: isZh ? '「后」4% → 示意损失 ≈ 3.2（偏高）' : '“后” 4% → sketch loss ≈ 3.2 (high)'
				},
				{
					talk: isZh
						? '因为正确词的份额太低，示意里那条通向「后」的权重被轻轻推高了一点。先只看这条短条变长了一截，以及上面的小刻度。'
						: 'Because the true token’s share was too low, the sketch weight toward “后” is nudged up a little. Just watch the short bar grow, and the tick that moves with it.',
					expr: isZh ? '份额太低 → 示意权重往「后」那边推高一点' : 'share too low → sketch weight nudges toward “后”'
				},
				{
					talk: isZh
						? '这一推的方向和大小，名字叫梯度。把这笔账往回传到权重的过程，叫反向传播。先看见动，再记这两个名字。'
						: 'The direction and size of that nudge is called the gradient. Sending the tally back to the weight is called backpropagation. See the move first, then keep these two names.',
					expr: isZh ? '先看见一推 → 再叫它「梯度 / 反向传播」' : 'see the nudge first → then name it “gradient / backprop”'
				},
				{
					talk: isZh
						? '这还是示意，不是刚才那次训练的实时平均，也不会在这里启动一次自动求导或开训。冻结的 ONNX GPT-2 不会在这一课被拿去训练。'
						: 'This is still a sketch, not the live average of the run you just did, and it does not start autograd or a training run. The frozen ONNX GPT-2 is not being trained in this lesson.',
					expr: isZh ? '示意 → 不是实时平均，也不开训' : 'sketch → not a live average, and no train starts'
				}
			],
			pointsTo: isZh
				? '得到画面上哪一块：上面这张示意表，以及表下「一条权重被推了一下」的短条和小刻度。四拍图里「回看：权重动了一点」那一拍也会亮。'
				: 'Where it shows up: the sketch table above, and the short bar and tick under it. The “look back: a weight nudges” beat of the four-beat figure also lights up.',
			myth: isZh
				? '常见误解：看见权重动，不等于已经在自动求导，也不等于正在改 GPT-2 的真实权重。这里只把「数偏高 → 权重点了一下」看清楚。'
				: 'A common mix-up: seeing a weight nudge is not autograd, and it is not a live edit of GPT-2’s real weights. This only makes “the number was too high, so a weight moved a little” visible.',
			source: 'sketch',
			sourceNote: isZh
				? '短条的前后长度和 3.2 一样，都是示意，用来把「损失之后权重会动」看完。真正训练时会对许多位置这样算，再平均、再更新。'
				: 'The before/after length of the bar, like 3.2, is a sketch so you can see that a weight moves after the loss. In real training this is computed at many positions, then averaged, then applied.',
			highlightSel: '[data-te-ft="weight-move"], [data-te-math="weight-walk"], [data-te-bridge="loss-table"]'
		};
	}
</script>

<div class="ft-loss-table" class:compact class:walking={showWalk} data-te-bridge="loss-table">
	<p class="kicker">{zh ? '损失，就是文字课右边那张概率表的训练读法' : 'Loss is the training reading of the probability table on the right of the text course'}</p>
	<p class="prompt">
		{zh ? '示意：看到' : 'Sketch: after'}
		「{prompt}」
		{zh ? '时，真正该出现的下一个字是「后」。' : ', the true next character is “后”.'}
	</p>
	<ol>
		{#each rows as row, i}
			<li class:trueTok={row.trueTok}>
				<span class="rank">{i + 1}</span>
				<span class="tok">{row.tok}</span>
				<span class="bar" style="--p:{row.p}"></span>
				<span class="p">{row.p.toFixed(2)}</span>
				{#if row.trueTok}
					<em>{zh ? '真正该出现的词，却排在后面' : 'The true next token, ranked low'}</em>
				{/if}
			</li>
		{/each}
	</ol>
	<p class="cap">
		{zh
			? '排得越低、给的概率越小，损失就越高。训练要做的，就是让「后」往上走。这还是在猜下一个词，只是权重可以动了。'
			: 'The lower it ranks and the smaller its probability, the higher the loss. Training tries to move “后” up the table. This is still next-token prediction — the weights are just allowed to move.'}
	</p>
	<p class="src tiny">{zh ? '贯穿例句：' : 'Shared sentence: '}「{BRIDGE_SENTENCE_ZH}」</p>
	{#if showWalk}
		<div class="loss-walk" data-te-math="loss-walk">
			<MathWalkCard card={walkCard} {zh} open />
		</div>
		<FtWeightMove {zh} />
		<div class="weight-walk" data-te-math="weight-walk">
			<MathWalkCard card={weightCard} {zh} bind:open={weightOpen} />
		</div>
	{/if}
</div>

<style>
	.ft-loss-table {
		border: 1px solid #ede9fe;
		border-radius: 0.5rem;
		padding: 0.55rem 0.7rem 0.5rem;
		background: #faf8ff;
		max-height: calc(100vh - var(--te-topbar-h, 9.5rem) - var(--te-guide-h, 10rem) - 5.5rem);
		overflow: auto;
		scroll-margin-top: 4.25rem;
		scroll-margin-bottom: var(--te-guide-h, 8rem);
		box-sizing: border-box;
		margin: 0.45rem 0 0;
	}
	.kicker {
		margin: 0 0 0.3rem;
		font-size: 0.75rem;
		color: #6d28d9;
		font-weight: 700;
	}
	.prompt, .cap, .src {
		margin: 0 0 0.35rem;
		font-size: 0.8rem;
		color: #4b5563;
		line-height: 1.45;
	}
	ol {
		list-style: none;
		margin: 0 0 0.4rem;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.15rem 0;
		font-size: 0.8rem;
		color: #374151;
	}
	li.trueTok {
		background: #fef3c7;
		border-radius: 0.3rem;
		padding: 0.2rem 0.35rem;
	}
	.rank {
		flex: 0 0 1.1rem;
		color: #6b7280;
		font-weight: 700;
		font-size: 0.72rem;
	}
	.tok {
		flex: 0 0 1.4rem;
		font-weight: 700;
		color: #4c1d95;
	}
	.bar {
		flex: 1 1 auto;
		height: 0.45rem;
		background: #ede9fe;
		border-radius: 99px;
		position: relative;
		max-width: 8rem;
	}
	.bar::after {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: calc(var(--p) * 100%);
		background: #7c3aed;
		border-radius: 99px;
	}
	li.trueTok .bar::after {
		background: #d97706;
	}
	.p {
		flex: 0 0 2.2rem;
		font-variant-numeric: tabular-nums;
		color: #6b7280;
		font-size: 0.75rem;
	}
	em {
		font-style: normal;
		font-size: 0.72rem;
		color: #92400e;
		font-weight: 600;
	}
	.tiny { font-size: 0.75rem; color: #6b7280; margin: 0; }
	.compact { padding: 0.4rem 0.5rem; margin: 0.3rem 0 0; }
	.compact .cap { margin-bottom: 0; }
	.compact .src { display: none; }
	.loss-walk { margin-top: 0.55rem; }
	.weight-walk { margin-top: 0.45rem; }
</style>
