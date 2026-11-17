<script lang="ts">
	import { DPO_PAIRS, DPO_SKETCH, SAFETY_EN, SAFETY_ZH, LATER_RUN_ID } from '~/courses/finetune/laterLabs';
	import { fetchPreferenceScores, type PreferenceScoreItem } from '~/courses/finetune/api';

	export let zh = true;
	export let runId: string | null = null;
	export let connected = false;

	let idx = 0;
	let beta = 0.1;
	let sketchStep = 0;
	let loading = false;
	let error = '';
	let source: 'live' | 'idle' = 'idle';
	let scores: PreferenceScoreItem[] = [];

	$: pair = DPO_PAIRS[idx];
	$: prompt = zh ? pair.promptZh : pair.promptEn;
	$: chosen = zh ? pair.chosenZh : pair.chosenEn;
	$: rejected = zh ? pair.rejectedZh : pair.rejectedEn;
	$: why = zh ? pair.whyZh : pair.whyEn;
	$: row = scores.find((s) => s.id === pair.id) || scores[idx];
	$: sketch = DPO_SKETCH[Math.min(sketchStep, DPO_SKETCH.length - 1)];
	$: implied =
		row && typeof row.tunedMargin === 'number' && typeof row.baseMargin === 'number'
			? beta * (row.tunedMargin - row.baseMargin)
			: null;

	const fmt = (n: number | null | undefined, d = 3) =>
		typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—';

	const score = async () => {
		if (loading) return;
		if (!connected) {
			error = zh ? '训练器未连接，不能做本机打分。' : 'The trainer is not connected, so live scoring cannot run.';
			return;
		}
		loading = true;
		error = '';
		try {
			const res = await fetchPreferenceScores(
				{
					runId: runId || LATER_RUN_ID,
					pairs: DPO_PAIRS.map((p) => ({
						id: p.id,
						prompt: zh ? p.promptZh : p.promptEn,
						chosen: zh ? p.chosenZh : p.chosenEn,
						rejected: zh ? p.rejectedZh : p.rejectedEn
					}))
				},
				180000
			);
			scores = res.items || [];
			source = 'live';
		} catch (err: any) {
			error = err?.message || String(err);
		} finally {
			loading = false;
		}
	};
</script>

<section class="dpo" data-te-dpo="ready">
	<p class="kicker">{zh ? 'DPO / RLHF：最小对照实验' : 'DPO / RLHF: a minimal contrast lab'}</p>
	<h4>{zh ? '不是下一个词对错，而是更喜欢哪一句' : 'Not whether the next token is right — which completion we prefer'}</h4>
	<p class="later-see-first" data-te-later="see-first">
		{zh
			? '先看下面的对照：同一句话，更想要的续写和不太想要的续写，差在哪。名字（DPO）是后起的。β 这种参数先收在下面，看懂对照再展开。'
			: 'First look at the contrast below: for the same prompt, how the preferred continuation differs from the one we do not want. The name (DPO) comes after. Parameters like β stay folded until you have seen the contrast.'}
	</p>

	<p class="tiny">
		{zh
			? '监督微调先让模型「像这样写」。DPO 和 RLHF 再拿两条回答比一比，把模型往更受欢迎的那边推。下面三对都是笔记、短诗或技术小段子。打分是本机 GPT-2 的一次前向；下面的损失曲线是预计算示意，不会在这里开完整对齐训练。'
			: 'Supervised fine-tuning first teaches the model to write “like this.” DPO and RLHF then compare two answers and push toward the preferred one. The three pairs below are notes, short verse, or technical snippets. Scoring is one local GPT-2 forward pass; the loss curve is a precomputed sketch. This is not a full alignment run.'}
	</p>
	<p class="safety">{zh ? SAFETY_ZH : SAFETY_EN}</p>

	<div class="pairs" role="tablist">
		{#each DPO_PAIRS as p, i}
			<button type="button" class:on={idx === i} data-te-dpo-pair={p.id} on:click={() => (idx = i)}>
				{zh ? (p.kind === 'note' ? '笔记' : p.kind === 'qa' ? '问答' : '短诗') : p.kind === 'note' ? 'Notes' : p.kind === 'qa' ? 'Q/A' : 'Verse'}
			</button>
		{/each}
	</div>

	<pre class="prompt">{prompt}</pre>
	<div class="two">
		<article class="choice good" data-te-dpo="chosen">
			<p class="tag">{zh ? '更喜欢（chosen）' : 'Preferred (chosen)'}</p>
			<p class="snip">{chosen}</p>
		</article>
		<article class="choice bad" data-te-dpo="rejected">
			<p class="tag">{zh ? '不太喜欢（rejected）' : 'Less preferred (rejected)'}</p>
			<p class="snip">{rejected}</p>
		</article>
	</div>
	<p class="tiny why">{why}</p>

	<div class="row">
		<button type="button" class="primary" data-te-dpo="score" disabled={loading || !connected} on:click={score}>
			{loading
				? (zh ? '正在用本机模型打分…' : 'Scoring with the local model…')
				: (zh ? '用这次 LoRA 给这几对打分（本机真跑，不开训）' : 'Score these pairs with this LoRA (live local pass, no training)')}
		</button>
	</div>
	{#if !connected}
		<p class="tiny muted">{zh ? '训练器未连接时，不能做本机打分，但仍可看偏好对和下面的示意曲线。' : 'Without the trainer, live scoring is unavailable, but you can still read the pairs and the sketch below.'}</p>
	{/if}
	{#if error}
		<p class="warn" data-te-dpo="error">{zh ? '打分没能完成：' : 'Scoring could not finish: '}{error}</p>
	{/if}

	{#if row}
		<div class="nums" data-te-dpo="scores" data-te-dpo-source={source}>
			<p><span>{zh ? '来源' : 'Source'}</span><strong>{zh ? '本机真跑（前向打分，不开训）' : 'Live local scoring, no training'}</strong></p>
			<p><span>{zh ? '基线边际（chosen − rejected）' : 'Baseline margin (chosen − rejected)'}</span><strong>{fmt(row.baseMargin)}</strong></p>
			<p><span>{zh ? '装上 LoRA 后的边际' : 'Margin after this LoRA'}</span><strong>{fmt(row.tunedMargin)}</strong></p>
			<p><span>{zh ? '相对参考模型的偏好差（示意）' : 'Preference gap vs. the reference (sketch)'}</span><strong>{fmt(implied)}</strong></p>
		</div>
		<p class="tiny">
			{zh
				? `读数是完成句的平均对数概率之差。DPO 会把「更喜欢的一句」相对参考模型再推高。当前 β = ${beta}。这次短跑 LoRA 是按笔记监督微调的，不一定已经拉开这三对的偏好，数字小或方向反了都很正常，不必夸大。`
				: `The reading is the difference in mean log-probability of the two completions. DPO would push the preferred one up relative to the reference. Current β = ${beta}. This short-run LoRA was trained as supervised notes, so it may not widen these three margins — a small or even reversed number is normal, and should not be oversold.`}
		</p>
	{/if}

	<details class="beta-fold" data-te-later="beta-fold">
		<summary>{zh ? '看完对照后，再看 β 这个参数（默认收起）' : 'After the contrast, look at the β parameter (folded by default)'}</summary>
		<label class="beta">
			<span>β = {beta.toFixed(2)}</span>
			<input type="range" min="0.05" max="0.5" step="0.05" bind:value={beta} data-te-dpo="beta" />
			<small>{zh ? '推荐 0.10。β 更大，同样的边际在公式里更被看重；这里只改读数，不开训。' : 'Recommended 0.10. A larger β weighs the same margin more in the formula. This only changes the reading; it does not start training.'}</small>
		</label>
		<div class="beta-walk" data-te-math="dpo-beta">
			<p class="kicker">{zh ? '这一步怎么算的' : 'How this step is calculated'}</p>
			{#if row && implied != null}
				<ol>
					<li>{zh ? `第 1 步：更喜欢的一句相对不太喜欢的一句，有一个分数差（边际）。微调前是 ${fmt(row.baseMargin)}，装上这次 LoRA 后是 ${fmt(row.tunedMargin)}。` : `Step 1: the preferred sentence has a score margin over the less preferred one. It is ${fmt(row.baseMargin)} before fine-tuning, and ${fmt(row.tunedMargin)} after this LoRA.`}</li>
					<li>{zh ? `第 2 步：β 把「相对参考模型又拉开了多少」放大。当前 β = ${beta.toFixed(2)}，差别是 ${fmt(row.tunedMargin - row.baseMargin)}，相乘得到 ${fmt(implied)}。` : `Step 2: β scales how much further the pair has been pulled apart relative to the reference. β is now ${beta.toFixed(2)}, the gap is ${fmt(row.tunedMargin - row.baseMargin)}, and the product is ${fmt(implied)}.`}</li>
					<li>{zh ? '第 3 步：把 β 拧大，同样的差别在读数里更被看重。这里只改读数，不开训。' : 'Step 3: turn β up, and the same gap counts for more in the reading. This only changes the reading; it does not start training.'}</li>
				</ol>
				<p class="src">{zh ? '数字来自上面这组本机打分（真数），再乘你选的 β。' : 'The numbers come from the live scores above (real values), then multiplied by the β you chose.'}</p>
			{:else}
				<ol>
					<li>{zh ? '第 1 步：先看一对示意分数。更喜欢的一句比不太喜欢的一句高 0.60 分。' : 'Step 1: start with a sketch pair. The preferred sentence is 0.60 higher than the less preferred one.'}</li>
					<li>{zh ? `第 2 步：β 把这个差别放大。β = ${beta.toFixed(2)} 时，${beta.toFixed(2)} × 0.60 = ${(beta * 0.6).toFixed(2)}。` : `Step 2: β scales that gap. When β = ${beta.toFixed(2)}, ${beta.toFixed(2)} × 0.60 = ${(beta * 0.6).toFixed(2)}.`}</li>
					<li>{zh ? '第 3 步：把 β 拧到 0.50，同样 0.60 的差别会变成 0.30，对照被看得更重。先看懂对照，再记住这个参数叫 β。这里只改读数，不开训。' : 'Step 3: turn β to 0.50, and the same 0.60 gap becomes 0.30 — the contrast is weighed more heavily. Understand the contrast first, then the name of this parameter is β. This only changes the reading; it does not start training.'}</li>
				</ol>
				<p class="src">{zh ? '上面 0.60 是示意。点「打分」之后，会改用这几对的真数。' : 'The 0.60 above is a sketch. After you click “Score”, these steps use the real numbers from the pairs.'}</p>
			{/if}
		</div>
	</details>

	<div class="sketch" data-te-dpo="sketch">
		<p class="tag">{zh ? '预计算示意：假设做了几步很小的 DPO' : 'Precomputed sketch: a few tiny hypothetical DPO steps'}</p>
		<div class="bars" style={`--n:${DPO_SKETCH.length}`}>
			{#each DPO_SKETCH as pt, i}
				<button type="button" class:on={sketchStep === i} data-te-dpo-step={pt.step} on:click={() => (sketchStep = i)} title={`step ${pt.step}`}>
					<span class="loss" style={`height:${Math.max(8, (1.1 - pt.loss) * 70)}%`}></span>
					<span class="mar" style={`height:${Math.max(8, pt.margin * 70)}%`}></span>
					<em>{pt.step}</em>
				</button>
			{/each}
		</div>

		<div class="pair-walk" data-te-dpo="pair-walk">
			<p class="tag">{zh ? '先看这一对的示意分数' : 'First look at this pair’s sketch scores'}</p>
			<ol>
				<li>
					{zh
						? `第 0 步（示意）：损失 0.693，偏好边际 0.08。更喜欢的那句只比另一句高出一点点。`
						: `Sketch step 0: loss 0.693, preferred margin 0.08. The preferred reply is only a little higher than the other.`}
				</li>
				<li>
					{zh
						? `第 4 步（示意）：损失 0.31，偏好边际 0.74。更喜欢的那句相对另一句被抬高了。当前正在看示意第 ${sketch.step} 步：损失 ${sketch.loss.toFixed(2)}，边际 ${sketch.margin.toFixed(2)}。`
						: `Sketch step 4: loss 0.31, preferred margin 0.74. The preferred reply has been lifted relative to the other. You are now on sketch step ${sketch.step}: loss ${sketch.loss.toFixed(2)}, margin ${sketch.margin.toFixed(2)}.`}
				</li>
				<li>
					{zh
						? '这是预计算示意，假设做了几步很小的对照，不是一次完整对齐训练，也不会在这里开训。'
						: 'This is a precomputed sketch of a few tiny hypothetical steps, not a full alignment training run, and it will not start a train here.'}
				</li>
			</ol>
		</div>
		<p class="tiny">
			{zh
				? `第 ${sketch.step} 步（示意）：损失 ${sketch.loss.toFixed(2)}，偏好边际 ${sketch.margin.toFixed(2)}。这不是正在开训，只用来看见「损失往下、更喜欢的那句相对抬高」。主按钮「推进一步」只讲解，不开训。`
				: `Sketch step ${sketch.step}: loss ${sketch.loss.toFixed(2)}, preferred margin ${sketch.margin.toFixed(2)}. This is not live training — it only shows loss falling and the preferred margin rising. The main “Take one step” button still explains; it does not train.`}
		</p>
	</div>
</section>

<style>
	.dpo { margin: 0.2rem 0 0; color: #4c1d95; }
	.kicker { margin: 0; font-size: 0.75rem; font-weight: 700; color: #6d28d9; }
	h4 { margin: 0.2rem 0 0.35rem; font-size: 0.95rem; }
	.tiny, .why, .safety { font-size: 0.82rem; line-height: 1.5; color: #4b5563; margin: 0.25rem 0 0.45rem; }
	.safety { background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; border-radius: 0.4rem; padding: 0.35rem 0.5rem; }
	.pairs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.35rem 0; }
	.pairs button, .primary { border-radius: 999px; border: 1px solid #ddd6fe; background: white; color: #5b21b6; padding: 0.2rem 0.7rem; cursor: pointer; font: inherit; font-weight: 600; }
	.pairs button.on { background: #7c3aed; color: white; border-color: #7c3aed; }
	.primary { border-radius: 0.4rem; background: #7c3aed; color: white; border: none; padding: 0.35rem 0.75rem; }
	.primary:disabled { opacity: 0.6; cursor: default; }
	.prompt { margin: 0.3rem 0; white-space: pre-wrap; font-family: inherit; background: #f5f3ff; border-radius: 0.35rem; padding: 0.35rem 0.5rem; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.choice { border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.45rem 0.55rem; background: #f9fafb; }
	.choice.good { border-color: #a7f3d0; background: #ecfdf5; }
	.choice.bad { border-color: #fed7aa; background: #fff7ed; }
	.tag { margin: 0 0 0.2rem; font-size: 0.72rem; font-weight: 700; }
	.choice.good .tag { color: #047857; }
	.choice.bad .tag { color: #9a3412; }
	.snip { margin: 0; font-size: 0.86rem; line-height: 1.45; }
	.nums { display: flex; flex-wrap: wrap; gap: 0.55rem 1.1rem; margin: 0.45rem 0; }
	.nums p { margin: 0; display: flex; flex-direction: column; font-size: 0.8rem; color: #4b5563; }
	.nums strong { color: #111827; font-size: 0.95rem; }
	.beta { display: flex; flex-direction: column; gap: 0.2rem; margin: 0.5rem 0; font-size: 0.82rem; }
	.beta input { max-width: 16rem; }
	.warn { color: #9a3412; }
	.muted { color: #6b7280; }
	.sketch { margin-top: 0.7rem; border-top: 1px dashed #ddd6fe; padding-top: 0.55rem; }
	.bars { display: flex; gap: 0.35rem; align-items: end; height: 5.5rem; margin: 0.4rem 0; }
	.bars button { flex: 1; height: 100%; border: 1px solid #ddd6fe; background: white; border-radius: 0.35rem; display: flex; align-items: end; justify-content: center; gap: 0.15rem; padding: 0.2rem 0.15rem 1.1rem; cursor: pointer; position: relative; }
	.bars button.on { border-color: #7c3aed; background: #f5f3ff; }
	.bars .loss, .bars .mar { display: block; width: 0.45rem; border-radius: 0.15rem 0.15rem 0 0; }
	.bars .loss { background: #c4b5fd; }
	.bars .mar { background: #059669; }
	.bars em { position: absolute; bottom: 0.15rem; font-size: 0.7rem; font-style: normal; color: #6d28d9; }
	@media (max-width: 720px) { .two { grid-template-columns: 1fr; } }

	.pair-walk { margin: 0.45rem 0 0.35rem; padding: 0.4rem 0.5rem; background: #faf8ff; border: 1px solid #ede9fe; border-radius: 0.4rem; }
	.pair-walk ol { margin: 0.25rem 0 0; padding-left: 1.1rem; font-size: 0.8rem; color: #374151; line-height: 1.45; }
	.pair-walk li { margin: 0.25rem 0; }
	.later-see-first { margin: 0.35rem 0 0.8rem; font-size: 0.9rem; color: #374151; line-height: 1.55; }
	.beta-fold { margin: 0.7rem 0; font-size: 0.86rem; color: #374151; }
	.beta-fold summary { cursor: pointer; color: #5b21b6; font-weight: 600; }
	.beta-walk { margin: 0.55rem 0 0.2rem; padding: 0.45rem 0.55rem; background: #faf8ff; border: 1px solid #ede9fe; border-radius: 0.4rem; }
	.beta-walk .kicker { margin: 0 0 0.3rem; font-size: 0.72rem; color: #6d28d9; font-weight: 700; }
	.beta-walk ol { margin: 0; padding-left: 1.1rem; font-size: 0.8rem; color: #374151; line-height: 1.45; }
	.beta-walk li { margin: 0.25rem 0; }
	.beta-walk .src { margin: 0.35rem 0 0; font-size: 0.72rem; color: #6b7280; }
</style>
