<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import FtLossChart from './FtLossChart.svelte';
	import FtEvalCard from './FtEvalCard.svelte';
	import FtProbBars from './FtProbBars.svelte';
	import { DEMO_OVERFIT_METRICS, DEMO_FORGET_ITEMS, type EvalKind } from '~/courses/finetune/presets';
	import { BRIDGE_SENTENCE_ZH, goToTextCourseWithSentence, goToTextCourseWithLora } from '~/courses/bridge';
	import type { TokenProb } from '~/courses/finetune/api';
	import FtHorizon from './FtHorizon.svelte';

	export let zh = true;
	export let useBest = true;
	export let liveMetrics: { step?: number; trainLoss?: number; valLoss?: number }[] = [];
	export let bestValStep: number | null = null;
	export let bestValLoss: number | null = null;
	export let lastValLoss: number | null = null;
	export let lastStep: number | null = null;
	export let sftMode = false;
	export let sftSample = '';
	export let evalItems: {
		id: string;
		kind: EvalKind;
		prompt: string;
		base?: string;
		tuned?: string;
		baseProbs?: TokenProb[] | null;
		tunedProbs?: TokenProb[] | null;
	}[] = [];
	export let evalReading = '';
	export let evalFilling = false;
	export let valLoss: number | null = null;
	export let testLoss: number | null = null;
	export let leakVal = false;
	export let connected = false;
	export let runId: string | null = null;
	export let later: 'map' | 'dpo' | 'qlora' | null = null;
	export let walkedIn = false;

	const dispatch = createEventDispatcher<{
		toggleBest: boolean;
		loadSft: void;
		fillEval: void;
		openBook: string;
	}>();

	export type DepthId = 'overfit' | 'ckpt' | 'forget' | 'eval' | 'sft';
	export let stop: DepthId = 'overfit';

	const STOPS: { id: DepthId; zh: string; en: string }[] = [
		{ id: 'overfit', zh: '看过拟合', en: 'Overfitting' },
		{ id: 'ckpt', zh: '选检查点', en: 'Checkpoint' },
		{ id: 'forget', zh: '看遗忘', en: 'Forgetting' },
		{ id: 'eval', zh: '看评测卡', en: 'Eval card' },
		{ id: 'sft', zh: '试问答格式', en: 'Q/A format' }
	];

	type LabId = DepthId | 'dpo' | 'qlora' | 'map';
	const WALK_IN = new Set<LabId>(['overfit', 'ckpt', 'forget', 'eval', 'sft']);
	const FEATURED = new Set<LabId>(['overfit', 'ckpt', 'forget']);

	const LAB_DIR: {
		id: LabId;
		zh: string;
		en: string;
		hintZh: string;
		hintEn: string;
		featured?: boolean;
	}[] = [
		{ id: 'overfit', zh: '看过拟合', en: 'Overfitting', hintZh: '训练变好、验证抬头', hintEn: 'Training improves, validation rises', featured: true },
		{ id: 'ckpt', zh: '选检查点', en: 'Checkpoint', hintZh: '留下验证最好的一次', hintEn: 'Keep the best-validation step', featured: true },
		{ id: 'forget', zh: '看遗忘', en: 'Forgetting', hintZh: '一类变好，另一类变差', hintEn: 'One kind improves, another worsens', featured: true },
		{ id: 'eval', zh: '看评测卡', en: 'Eval card', hintZh: '课内对照，不是通用平台', hintEn: 'In-course contrast, not a general platform' },
		{ id: 'sft', zh: '试问答格式', en: 'Q/A format', hintZh: '怎么训就怎么问', hintEn: 'Ask the way you trained' },
		{ id: 'dpo', zh: 'DPO / RLHF', en: 'DPO / RLHF', hintZh: '看偏好对，最小实验', hintEn: 'Preference pairs, a minimum lab' },
		{ id: 'qlora', zh: 'QLoRA', en: 'QLoRA', hintZh: '对照显存，本课用不到', hintEn: 'Memory contrast; not needed here' },
		{ id: 'map', zh: '从本课到真实模型', en: 'From this course to a real model', hintZh: '已经看见什么，还差什么', hintEn: 'What you have seen, and what is still missing' }
	];

	let shortH = false;
	onMount(() => {
		const measure = () => {
			shortH = typeof window !== 'undefined' && window.innerHeight <= 800;
		};
		measure();
		window.addEventListener('resize', measure);
		return () => window.removeEventListener('resize', measure);
	});

	const scrollLab = (id: string) => {
		if (typeof document === 'undefined') return;
		requestAnimationFrame(() => {
			const sel = walkedIn ? '[data-te-explore-walk]' : `#ft-depth-${id}`;
			document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	};

	const go = (id: DepthId) => {
		stop = id;
		if (WALK_IN.has(id)) walkedIn = true;
		scrollLab(id);
	};

	const openLab = (id: LabId) => {
		if (id === 'dpo' || id === 'qlora' || id === 'map') {
			walkedIn = false;
			later = id;
			if (typeof document === 'undefined') return;
			requestAnimationFrame(() => {
				document.getElementById('ft-horizon-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
			return;
		}
		later = null;
		go(id);
	};

	const backToDir = () => {
		walkedIn = false;
		later = null;
		if (typeof document === 'undefined') return;
		requestAnimationFrame(() => {
			document.querySelector('[data-te-ft="explore-labs"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	};

	$: liveHasValRise = (() => {
		const pts = liveMetrics.filter((m) => typeof m.valLoss === 'number') as { step?: number; valLoss: number }[];
		if (pts.length < 3) return false;
		let minI = 0;
		for (let i = 1; i < pts.length; i++) if (pts[i].valLoss < pts[minI].valLoss) minI = i;
		const last = pts[pts.length - 1];
		return minI < pts.length - 1 && last.valLoss > pts[minI].valLoss * 1.03;
	})();

	// Prefer a real curve when it already shows a rise; otherwise use the labeled sketch.
	$: chartMetrics = liveHasValRise ? liveMetrics : DEMO_OVERFIT_METRICS;
	$: usingSketch = !liveHasValRise;

	$: sketchBest = DEMO_OVERFIT_METRICS.reduce((a, b) => (b.valLoss < a.valLoss ? b : a));
	$: sketchLast = DEMO_OVERFIT_METRICS[DEMO_OVERFIT_METRICS.length - 1];
	$: showBestStep = usingSketch ? sketchBest.step : bestValStep ?? sketchBest.step;
	$: showBestLoss = usingSketch ? sketchBest.valLoss : bestValLoss ?? sketchBest.valLoss;
	$: showLastStep = usingSketch ? sketchLast.step : lastStep ?? sketchLast.step;
	$: showLastLoss = usingSketch ? sketchLast.valLoss : lastValLoss ?? sketchLast.valLoss;
	$: showLastTrain = (() => {
		const last = chartMetrics[chartMetrics.length - 1];
		return last && typeof last.trainLoss === 'number' ? last.trainLoss : sketchLast.trainLoss;
	})();

	let mismatch = false;
	$: matchedAsk = zh ? '问：残差连接是干什么的？\n答：' : 'Q: What does a residual connection do?\nA:';
	$: looseAsk = zh ? '残差连接是干什么的？' : 'What does a residual connection do?';
	$: matchedOut = zh
		? '它把前面的信号直接加到后面，让训练更容易走通。'
		: 'It adds the earlier signal to the later one, which makes training easier to get through.';
	$: looseOut = zh
		? '今天把这一章记下：残差连接负责把前面的信号加到后面。我自己的记法是……'
		: 'I finished the chapter today, and I wrote down: residual connections are for adding the earlier signal later. My own way of remembering it is…';

	const pickBest = () => {
		dispatch('toggleBest', true);
	};

	$: filledEval = evalItems.some((it) => it.base || it.tuned);
	$: shownEval = filledEval
		? evalItems
		: DEMO_FORGET_ITEMS.map((it) => ({
				...it,
				prompt: zh ? it.promptZh : it.promptEn,
				base: zh ? it.baseZh : it.baseEn,
				tuned: zh ? it.tunedZh : it.tunedEn
			}));
	$: forgetShown = (() => {
		const ins = shownEval.filter((it) => it.kind === 'in');
		const others = shownEval.filter((it) => it.kind === 'forget');
		const outs = shownEval.filter((it) => it.kind === 'out');
		return [ins[0], others[0] || outs[0]].filter(Boolean);
	})();
	$: evalSketch = !filledEval;
</script>

<section class="ft-depth" class:walked={walkedIn} data-te-depth="ready">
	{#if !walkedIn}
	<div class="lab-dir" data-te-ft="explore-labs" data-te-depth="lab-dir">
		<p class="kicker">{zh ? '本课壳子里已有的实验室' : 'Labs already in this course shell'}</p>
		<p class="tiny lab-dir-lead">
			{zh
				? '点一项就能走进去。「看过拟合」「选检查点」「看遗忘」会直接露出预置示意里的现象。这些都在这一课里，不是另开的工业平台，也不会开训。'
				: 'Open one to walk in. Overfitting, checkpoints, and forgetting open onto a visible preset sketch. These labs already live in this course; they are not a separate industrial platform, and they do not start training.'}
		</p>
		<ul>
			{#each LAB_DIR as item}
				<li>
					<button
						type="button"
						data-te-explore-lab={item.id}
						data-te-explore-walkable={FEATURED.has(item.id) ? '1' : '0'}
						on:click={() => openLab(item.id)}
					>
						<strong>{zh ? item.zh : item.en}</strong>
						{#if FEATURED.has(item.id)}
							<em class="walk-tag">{zh ? '可走进去看' : 'Walk in and see'}</em>
						{/if}
						<span>{zh ? item.hintZh : item.hintEn}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<slot name="after-labs" />

	<details class="depth-intro" data-te-depth="intro">
		<summary>{zh ? '看见差别之后：每一站都先看图或对照，再给现象起名字' : 'After you see the change: look first, then name the phenomenon'}</summary>
		<p class="kicker">{zh ? '看见差别之后，再看这些对照' : 'After you see the change, look at these contrasts'}</p>
		<h3>{zh ? '差别从哪里来' : 'Where the difference comes from'}</h3>
		<p class="later-see-first" data-te-later="see-first">
			{zh
				? '每一站都先看图或对照，再给现象起名字。打开某一站时，不必先背定义。'
				: 'At every stop, look at the figure or contrast first, then name the phenomenon. You do not need to memorize a definition when a stop opens.'}
		</p>
		<p class="lead">
			{zh
				? '下面五件事在主线上就能看、能动手。先看图和对照，不必自己翻工作室里的标签。示意用预置曲线和例句，不会开训。'
				: 'These five stops are on the main path — you can see and try them here, without digging through workshop tabs. The sketches use preset curves and examples, and they do not start training.'}
		</p>
	</details>
	{/if}

	{#if walkedIn}
	<div class="lab-walk" data-te-explore-walk={stop} data-te-explore-open={stop}>
		<div class="walk-bar">
			<button type="button" class="ghost" data-te-explore-back on:click={backToDir}>
				{zh ? '回到实验室清单' : 'Back to the lab list'}
			</button>
			<nav class="walk-sibs" aria-label={zh ? '可走的实验室' : 'Walkable labs'}>
				{#each STOPS as s}
					<button type="button" class:on={stop === s.id} data-te-explore-sib={s.id} on:click={() => openLab(s.id)}>
						{zh ? s.zh : s.en}
					</button>
				{/each}
			</nav>
			<p class="bound" data-te-explore-bound>
				{zh
					? '这是预置教学示意，不是正在跑的完整训练，也不是工业平台或通用评测套件。'
					: 'This is a preset teaching sketch, not a live full training run, and not an industrial platform or a general eval suite.'}
			</p>
		</div>

	{#if stop === 'overfit'}
	<article id="ft-depth-overfit" class="card" class:on={stop === 'overfit'} data-te-depth="overfit">
		<p class="kicker">{zh ? '看过拟合' : 'Overfitting'}</p>
		<h4>{zh ? '训练越来越好，验证开始变差' : 'Training gets better; validation starts to get worse'}</h4>
		<p class="tiny">
			{zh
				? (usingSketch
					? '这是预置示意曲线，不是正在跑的完整训练。训练损失一直往下，验证损失在最低点之后抬头——多训几轮不一定更好。'
					: '这是这次跑的真实曲线。验证损失已经开始抬头：训练越来越好，并不等于整体更好。')
				: (usingSketch
					? 'This is a preset sketch, not a live full run. Training loss keeps falling, but validation rises after its best point — more passes are not automatically better.'
					: 'This is the real curve from this run. Validation has started to rise: a better training loss is not the same as a better model.')}
		</p>
		<div class="phenom-pair" data-te-explore-phenomenon="overfit">
			<div class="choice good">
				<p class="tag">{zh ? '验证最好的一次' : 'Best validation'}</p>
				<p class="big">{zh ? `第 ${showBestStep} 步` : `Step ${showBestStep}`}</p>
				<p>{zh ? '验证损失' : 'Val loss'} {showBestLoss.toFixed(2)}</p>
			</div>
			<div class="choice bad">
				<p class="tag">{zh ? '再往下训' : 'Train further'}</p>
				<p class="big">{zh ? `第 ${showLastStep} 步` : `Step ${showLastStep}`}</p>
				<p>
					{zh
						? `训练损失 ${showLastTrain.toFixed(2)}（更低），验证损失 ${showLastLoss.toFixed(2)}（升高）`
						: `Train ${showLastTrain.toFixed(2)} (lower), val ${showLastLoss.toFixed(2)} (higher)`}
				</p>
			</div>
		</div>
		<FtLossChart metrics={chartMetrics} {zh} compact={true} />
	</article>
	{/if}

	{#if stop === 'ckpt'}
	<article id="ft-depth-ckpt" class="card" class:on={stop === 'ckpt'} data-te-depth="ckpt">
		<p class="kicker">{zh ? '选检查点' : 'Pick a checkpoint'}</p>
		<h4>{zh ? '该留下的是验证损失最好的那一次，不是最后一步' : 'Keep the step with the best validation loss, not the last step'}</h4>
		<div class="ckpt-pair" data-te-explore-phenomenon="ckpt">
			<div class="choice bad">
				<p class="tag">{zh ? '最后一步' : 'Last step'}</p>
				<p class="big">{zh ? `第 ${showLastStep} 步` : `Step ${showLastStep}`}</p>
				<p>{zh ? '验证损失' : 'Val loss'} {showLastLoss.toFixed(2)}</p>
				<p class="why">{zh ? '往往已经过了最好的时候，这时再留下，验证可能已经变差。' : 'This is often past the best point, so the validation may already be worse.'}</p>
			</div>
			<div class="choice good" class:picked={useBest}>
				<p class="tag">{zh ? '验证最好的一次' : 'Best validation'}</p>
				<p class="big">{zh ? `第 ${showBestStep} 步` : `Step ${showBestStep}`}</p>
				<p>{zh ? '验证损失' : 'Val loss'} {showBestLoss.toFixed(2)}</p>
				<p class="why">{zh ? '验证读数最好的时候，通常更该留下来对照和导出。' : 'The moment validation is best is usually the one to keep for compare and export.'}</p>
			</div>
		</div>
		<button type="button" class="primary" data-te-depth="keep-best" on:click={pickBest} disabled={useBest}>
			{useBest
				? (zh ? `已留下验证最好的一次（第 ${showBestStep} 步）` : `Keeping the best-validation step (step ${showBestStep})`)
				: (zh ? '留下验证最好的那一次' : 'Keep the best-validation checkpoint')}
		</button>
		<p class="tiny">
			{zh
				? (usingSketch
					? '对照数字来自同一条预置示意曲线，不是正在跑的完整训练。结束后尽量用验证最好的检查点，而不是默默留下最后一步。'
					: '这是一个明确选择：结束后尽量用验证最好的检查点，而不是默默留下最后一步。导出旁边加的一小块时，也尽量用这一次。')
				: (usingSketch
					? 'These numbers come from the same preset sketch, not a live full run. When the run finishes, prefer the best-validation checkpoint, instead of quietly keeping the last step.'
					: 'This is a definite choice: when the run finishes, prefer the best-validation checkpoint, instead of quietly keeping the last step. Export of the small add-on should also prefer this one.')}
		</p>
	</article>
	{/if}

	{#if stop === 'forget'}
	<article id="ft-depth-forget" class="card" class:on={stop === 'forget'} data-te-depth="forget">
		<p class="kicker">{zh ? '看遗忘' : 'Forgetting'}</p>
		<h4>{zh ? '更像语料的提示变好，换一类原来会写的提示变差' : 'Prompts like the corpus get better; a different kind the model used to handle gets worse'}</h4>
		<p class="tiny">
			{zh
				? (evalSketch
					? '下面是示意对照，方便你先看清差别从哪里来。填写评测卡之后，会换成这次跑的真实续写。'
					: '下面是这次评测卡里的对照：一类更像手头语料，一类是原来会写的另一种开头。')
				: (evalSketch
					? 'This is a sketch, so you can first see where the difference comes from. After you fill the eval card, these become the real continuations from this run.'
					: 'These contrasts come from the eval card: one prompt is like the corpus at hand, the other is a different opening the base model could already write.')}
		</p>
		<div class="forget-grid" data-te-explore-phenomenon="forget">
			{#each forgetShown as it}
				<div class="forget-col" data-kind={it.kind}>
					<p class="tag">{it.kind === 'in' ? (zh ? '语料内：更像笔记的提示' : 'In-corpus: a prompt like the notes') : (zh ? '另一类：原来会写的提示' : 'Other genre: a prompt it used to handle')}</p>
					<pre class="prompt">{it.prompt}</pre>
					{#if it.baseProbs && it.baseProbs.length && false}
						<FtProbBars baseProbs={it.baseProbs || []} tunedProbs={it.tunedProbs || []} hasTuned={!!(it.tunedProbs && it.tunedProbs.length)} {zh} />
					{/if}
					<div class="two">
						<div>
							<p class="lbl">{zh ? '微调前' : 'Before'}</p>
							<p class="snip">{it.base}</p>
						</div>
						<div>
							<p class="lbl">{zh ? '微调后' : 'After'}</p>
							<p class="snip {it.kind === 'in' ? 'better' : 'worse'}">{it.tuned}</p>
						</div>
					</div>
					<p class="cap">
						{it.kind === 'in'
							? (zh ? '这一边更像手头的语料了。' : 'This side looks more like the corpus at hand.')
							: (zh ? '换一类提示后，原来会写的内容变差，或也开始往笔记上靠。' : 'On a different kind of prompt, what it used to write gets worse, or also drifts toward the notes.')}
					</p>
				</div>
			{/each}
		</div>
	</article>
	{/if}

	{#if stop === 'eval'}
	<article id="ft-depth-eval" class="card" class:on={stop === 'eval'} data-te-depth="eval" data-te-eval-source={evalSketch ? 'sketch' : 'live'} data-te-explore-phenomenon="eval">
		<p class="kicker">{zh ? '看评测卡' : 'The eval card'}</p>
		<p class="tag-src">{evalSketch ? (zh ? '当前是示意对照，点填写后换成这次跑的真实续写。' : 'This is a sketch. Fill the card to use real continuations from this run.') : (zh ? '当前是这次跑次的真实续写（本机真跑）。' : 'These are real continuations from this run (live local).')}</p>
		<p class="tiny">
			{zh
				? '评测卡就在这条主线上：固定提示（语料内 + 语料外 + 另一类）、验证损失、并排概率条和续写。不能只靠两段话像不像。这是课内评测卡，不是通用评测平台。'
				: 'The eval card sits on this path: a fixed prompt set (in-corpus, out-of-corpus, and another genre), validation loss, and side-by-side probability bars plus continuations. Do not judge only by whether two snippets look alike.'}
		</p>
		<FtEvalCard
			{zh}
			{valLoss}
			{testLoss}
			bestValLoss={showBestLoss}
			bestValStep={showBestStep}
			{leakVal}
			reading={evalReading || (zh
				? '示意读法：语料内更像笔记，另一类提示却变差或也开始像笔记。这是「像语料但泛化变差」，也是遗忘的苗头。这是课内评测卡，不是通用评测平台。'
				: 'Sketch reading: in-corpus looks more like the notes, while another genre gets worse or also starts to sound like the notes. That is “looks like the corpus, but generalizes worse,” and a sign of forgetting. This is an in-course card, not a general eval platform.')}
			filling={evalFilling}
			items={shownEval}
			onFill={connected ? () => dispatch('fillEval') : null}
		/>
	</article>
	{/if}

	{#if stop === 'sft'}
	<article id="ft-depth-sft" class="card" class:on={stop === 'sft'} data-te-depth="sft" data-te-explore-phenomenon="sft">
		<p class="kicker">{zh ? '试最小问答格式' : 'Try a minimal Q/A format'}</p>
		<h4>{zh ? '怎么训就怎么问。格式不一致，续写就会跑偏。' : 'Ask the way you trained. If the format does not match, the continuation drifts.'}</h4>
		<p class="tiny">
			{zh
				? '这是最小演示，不是完整指令微调平台。训练语料若是「问：… / 答：…」，推理时也要用同一格式提问。不要拿去骚扰别人。'
				: 'This is a minimal demo, not a full instruction-tuning platform. If the training text is “Q: … / A: …”, ask in the same format at inference. Do not use this to bother other people.'}
		</p>
		<pre class="sft-sample">{sftSample || (zh ? '问：残差连接是干什么的？\n答：它把前面的信号直接加到后面，让训练更容易走通。' : 'Q: What does a residual connection do?\nA: It adds the earlier signal to the later one, which makes training easier to get through.')}</pre>
		<div class="row">
			<button type="button" class="primary" data-te-depth="load-sft" on:click={() => dispatch('loadSft')}>
				{sftMode ? (zh ? '已载入问答模板（可再点一次换回同一批）' : 'Q/A template loaded (click again to reload the same set)') : (zh ? '载入最小问答模板（演示，不开训）' : 'Load the minimal Q/A template (demo, no training)')}
			</button>
		</div>
		{#if sftMode}
			<p class="ok">{zh ? '当前语料已换成问答模板。下面先看格式对不对会怎样。' : 'The corpus is now the Q/A template. See below what happens when the format matches — or does not.'}</p>
		{/if}
		<div class="ask-pair" data-te-depth="sft-demo">
			<div class="ask" class:on={!mismatch}>
				<button type="button" on:click={() => (mismatch = false)}>{zh ? '用训练时的格式来问' : 'Ask in the training format'}</button>
				<pre class="prompt">{matchedAsk}</pre>
				<p class="lbl">{zh ? '示意续写' : 'Sketch continuation'}</p>
				<p class="snip better">{matchedOut}</p>
			</div>
			<div class="ask" class:on={mismatch}>
				<button type="button" on:click={() => (mismatch = true)}>{zh ? '随口问、不写成问/答' : 'Ask loosely, without Q/A'}</button>
				<pre class="prompt">{looseAsk}</pre>
				<p class="lbl">{zh ? '示意续写' : 'Sketch continuation'}</p>
				<p class="snip worse">{looseOut}</p>
			</div>
		</div>
		<p class="tiny cap">
			{mismatch
				? (zh ? '格式对不上时，模型更容易滑回语料里的笔记口吻，而不是先给出「答：」后面那句。' : 'When the format does not match, the model is more likely to slip back into the note-taking voice, instead of answering after “A:”.')
				: (zh ? '格式对齐时，它更像在填「答：」后面那一格。怎么训就怎么问。' : 'When the format matches, it is more like filling the slot after “A:”. Ask the way you trained.')}
		</p>
	</article>
	{/if}

		<p class="tiny book">
			<button type="button" class="ghost" on:click={() => dispatch('openBook', 'read-curves')}>{zh ? '需要时打开教材：看曲线 / 过拟合、评测、检查点、问答格式' : 'Open the textbook when you need it: curves / overfitting, eval, checkpoints, Q/A format'}</button>
		</p>
	</div>
	{/if}

	{#if !walkedIn}
	<p class="bridge" data-te-bridge="depth-to-text">
		<span>{zh ? '贯穿例句：' : 'Shared sentence: '}「{BRIDGE_SENTENCE_ZH}」</span>
		<button type="button" class="ghost" data-te-bridge="to-text" on:click={goToTextCourseWithSentence}>{zh ? '去文字课看这一句怎么算下一个词' : 'See how this sentence predicts the next word in the text course'}</button>
		<button type="button" class="ghost" data-te-bridge="to-text-lora" on:click={() => goToTextCourseWithLora(runId)}>{zh ? '带上这次 LoRA，去文字课对照桑基图' : 'Take this LoRA to the text course and contrast it on the Sankey'}</button>
	</p>
	<p class="tiny book">
		<button type="button" class="ghost" on:click={() => dispatch('openBook', 'read-curves')}>{zh ? '需要时打开教材：看曲线 / 过拟合、评测、检查点、问答格式' : 'Open the textbook when you need it: curves / overfitting, eval, checkpoints, Q/A format'}</button>
	</p>
	<FtHorizon {zh} bind:open={later} {runId} {connected} onJump={(hash) => {
		if (hash === '#ft-eval') {
			stop = 'eval';
			walkedIn = true;
		}
	}} />
	{/if}
</section>

<style>
	.ft-depth { margin: 0 0 1rem; }
	.kicker { margin: 0 0 0.25rem; font-size: 0.75rem; color: #6d28d9; font-weight: 700; }
	.tag-src { margin: 0 0 0.4rem; font-size: 0.78rem; color: #6b7280; }
	h3 { margin: 0 0 0.35rem; font-size: 1.05rem; color: #4c1d95; }
	h4 { margin: 0 0 0.35rem; font-size: 0.95rem; color: #4c1d95; }
	.lead, .tiny { font-size: 0.84rem; color: #4b5563; line-height: 1.5; margin: 0 0 0.55rem; }
	.bridge { display: flex; flex-wrap: wrap; gap: 0.4rem 0.7rem; align-items: center; margin: 0 0 0.6rem; font-size: 0.82rem; color: #4c1d95; }
	.bridge .ghost { color: #5b21b6; border-color: #ddd6fe; }
	.card { background: white; border: 1px solid #ede9fe; border-radius: 0.6rem; padding: 0.75rem 0.85rem 0.9rem; margin: 0 0 0.7rem; scroll-margin-top: 8.5rem; }
	.card.on { box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.16); }
	.ckpt-pair, .forget-grid, .ask-pair, .phenom-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin: 0.4rem 0 0.55rem; }
	.choice, .forget-col, .ask { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.65rem; background: #f9fafb; }
	.choice.bad { border-color: #fed7aa; background: #fff7ed; }
	.choice.good { border-color: #a7f3d0; background: #ecfdf5; }
	.choice.good.picked { box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.25); }
	.choice .big { margin: 0.1rem 0; font-size: 1.15rem; font-weight: 700; color: #111827; }
	.tag { margin: 0 0 0.2rem; font-size: 0.72rem; font-weight: 700; color: #6d28d9; }
	.choice.bad .tag { color: #9a3412; }
	.choice.good .tag { color: #047857; }
	.why, .cap { margin: 0.25rem 0 0; font-size: 0.78rem; color: #4b5563; line-height: 1.45; }
	.primary, .ghost { border-radius: 0.4rem; padding: 0.35rem 0.7rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
	.primary { background: #7c3aed; color: white; border: none; }
	.primary:disabled { opacity: 0.85; cursor: default; background: #059669; }
	.ghost { background: white; border: 1px solid #e5e7eb; color: #374151; }
	.row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.35rem 0; }
	pre.prompt, pre.sft-sample { margin: 0 0 0.4rem; white-space: pre-wrap; font-size: 0.86rem; font-family: inherit; background: #f5f3ff; border-radius: 0.35rem; padding: 0.35rem 0.45rem; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
	.lbl { margin: 0; font-size: 0.72rem; color: #6b7280; }
	.snip { margin: 0.15rem 0 0; font-size: 0.84rem; line-height: 1.45; white-space: pre-wrap; }
	.snip.better { color: #047857; font-weight: 600; }
	.snip.worse { color: #9a3412; font-weight: 600; }
	.forget-col[data-kind='in'] { border-color: #c4b5fd; background: #faf8ff; }
	.forget-col[data-kind='forget'], .forget-col[data-kind='out'] { border-color: #fed7aa; background: #fffbeb; }
	.ask button { width: 100%; text-align: left; border: 1px solid #ddd6fe; background: white; border-radius: 0.35rem; padding: 0.3rem 0.45rem; cursor: pointer; font-weight: 700; color: #5b21b6; font-size: 0.8rem; margin-bottom: 0.35rem; }
	.ask.on { border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.14); }
	.ok { color: #065f46; font-size: 0.86rem; margin: 0.25rem 0 0.45rem; }
	.book { margin: 0.4rem 0 0; }
	#ft-depth-overfit, #ft-depth-ckpt, #ft-depth-forget, #ft-depth-eval, #ft-depth-sft { scroll-margin-top: 8.5rem; scroll-margin-bottom: var(--te-guide-h, 8rem); }
	@media (max-width: 720px) {
		.ckpt-pair, .forget-grid, .ask-pair, .two, .phenom-pair { grid-template-columns: 1fr; }
	}

	.later-see-first { margin: 0.35rem 0 0.8rem; font-size: 0.9rem; color: #374151; line-height: 1.55; }
	.lab-dir { margin: 0 0 0.45rem; padding: 0.4rem 0.55rem 0.45rem; border: 1px solid #ddd6fe; border-radius: 0.55rem; background: #faf8ff; scroll-margin-top: 8.5rem; }
	.lab-dir .kicker { margin: 0 0 0.12rem; }
	.lab-dir-lead { margin: 0 0 0.3rem; }
	.lab-dir ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 0.3rem; }
	.lab-dir li { min-width: 0; }
	.lab-dir button { width: 100%; text-align: left; border: 1px solid #ddd6fe; background: white; border-radius: 0.4rem; padding: 0.28rem 0.45rem; cursor: pointer; color: #4c1d95; font: inherit; }
	.lab-dir button:hover, .lab-dir button:focus-visible { border-color: #7c3aed; background: #ede9fe; }
	.lab-dir button[data-te-explore-walkable='1'] { border-color: #c4b5fd; background: #f5f3ff; }
	.lab-dir strong { display: block; font-size: 0.82rem; line-height: 1.3; }
	.lab-dir span { display: block; margin-top: 0.08rem; font-size: 0.7rem; color: #6d28d9; line-height: 1.3; }
	.lab-dir .walk-tag { display: block; margin: 0.08rem 0 0; font-size: 0.66rem; font-style: normal; font-weight: 700; color: #047857; line-height: 1.25; }
	.depth-intro { margin: 0 0 0.65rem; padding: 0.15rem 0 0; }
	.depth-intro summary { cursor: pointer; font-size: 0.82rem; font-weight: 600; color: #5b21b6; line-height: 1.4; }
	.depth-intro[open] summary { margin-bottom: 0.35rem; }

	.lab-walk { scroll-margin-top: 8.5rem; scroll-margin-bottom: var(--te-guide-h, 8rem); }
	.walk-bar { margin: 0 0 0.45rem; padding: 0.35rem 0.55rem 0.4rem; border: 1px solid #ddd6fe; border-radius: 0.5rem; background: #faf8ff; }
	.walk-bar .ghost { margin: 0 0 0.3rem; }
	.walk-sibs { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0 0 0.3rem; }
	.walk-sibs button { border: 1px solid #ddd6fe; background: white; color: #5b21b6; border-radius: 999px; padding: 0.12rem 0.5rem; cursor: pointer; font-size: 0.74rem; font-weight: 600; }
	.walk-sibs button.on { background: #7c3aed; color: white; border-color: #7c3aed; }
	.bound { margin: 0; font-size: 0.8rem; line-height: 1.45; color: #4b5563; }

	@media (max-height: 740px) {
		.lab-dir { padding: 0.18rem 0.4rem 0.2rem; margin-bottom: 0.3rem; }
		.lab-dir .kicker { margin-bottom: 0.08rem; font-size: 0.72rem; }
		.lab-dir-lead { margin: 0 0 0.18rem; font-size: 0.72rem; line-height: 1.35; }
		.lab-dir ul { gap: 0.22rem; }
		.lab-dir button { padding: 0.18rem 0.28rem; }
		.lab-dir strong { font-size: 0.74rem; line-height: 1.25; }
		.lab-dir span { display: none; }
		.lab-dir .walk-tag { display: block; font-size: 0.62rem; }
		.walk-bar { padding: 0.22rem 0.4rem 0.25rem; margin-bottom: 0.3rem; }
		.walk-bar .ghost { padding: 0.2rem 0.5rem; font-size: 0.78rem; margin-bottom: 0.2rem; }
		.walk-sibs { margin-bottom: 0.18rem; }
		.bound { font-size: 0.74rem; }
		.card { padding: 0.5rem 0.65rem 0.6rem; margin-bottom: 0.45rem; }
		h4 { font-size: 0.9rem; margin-bottom: 0.2rem; }
		.phenom-pair, .ckpt-pair, .forget-grid { margin: 0.25rem 0 0.35rem; gap: 0.4rem; }
		.choice, .forget-col { padding: 0.35rem 0.5rem; }
		.choice .big { font-size: 1.02rem; }
		.book { margin-top: 0.2rem; }
	}
	@media (max-width: 900px) {
		.lab-dir ul { grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); }
	}

	/* Phase 4: keep the phenomenon above the coach on 1366x768 / 1280x720 */
	.lab-walk { padding-left: 2.75rem; padding-bottom: 0.6rem; }
	.walk-bar { padding: 0.18rem 0.45rem 0.2rem; margin-bottom: 0.25rem; }
	.walk-bar .ghost { padding: 0.12rem 0.45rem; font-size: 0.76rem; margin: 0 0.35rem 0.15rem 0; }
	.walk-sibs { display: inline-flex; margin: 0 0 0.12rem; }
	.bound { font-size: 0.74rem; line-height: 1.35; }
	.lab-walk .card { padding: 0.4rem 0.55rem 0.45rem; margin: 0 0 0.3rem; }
	.lab-walk h4 { font-size: 0.88rem; margin-bottom: 0.15rem; }
	.lab-walk .tiny { font-size: 0.76rem; margin-bottom: 0.3rem; line-height: 1.35; }
	.lab-walk .kicker { margin-bottom: 0.08rem; }
	.lab-walk .phenom-pair, .lab-walk .ckpt-pair, .lab-walk .forget-grid { margin: 0.15rem 0 0.25rem; gap: 0.35rem; }
	.lab-walk .choice, .lab-walk .forget-col { padding: 0.3rem 0.45rem; }
	.lab-walk .choice .big { font-size: 1rem; }
	.lab-walk .why, .lab-walk .cap { font-size: 0.72rem; }
	@media (max-height: 800px) {
		.lab-walk .tiny { display: none; }
		.lab-walk .cap, .lab-walk .why { display: none; }
		.lab-walk .book { display: none; }
		.lab-walk { padding-bottom: 0.85rem; }
		.lab-walk .card { margin-bottom: 0.55rem; }
	}
</style>
