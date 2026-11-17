<script lang="ts">
	import { onMount } from 'svelte';
	import { locale } from '~/i18n';
	import { inputText, selectedExampleIdx, temperature, sampling, blockIdx, attentionHeadIdx, predictedToken } from '~/store';
	import { goToFinetuneFromText, isBridgeSentence, BRIDGE_SENTENCE_ZH, BRIDGE_EXAMPLE_IDX } from '~/courses/bridge';
	import { TOKEN_CUT_NOTE_ZH, TOKEN_CUT_NOTE_EN } from '~/utils/gpt2Tokens';
	import {
		loraContrast,
		applyLoraSide,
		refreshLoraContrast,
		exitLoraContrast,
		textTokenizer,
		PREFERRED_LORA_RUN,
		type LoraSide
	} from '~/courses/loraContrast';
	import { finetuneRunId } from '~/courses/finetune/store';
	import { textPathDone } from '~/store/beginnerPath';
	let getProbabilities: ((args: any) => { probabilities: any[] }) | null = null;
	void import('~/utils/data').then((m) => {
		getProbabilities = m.getProbabilities;
	});

	$: zh = $locale !== 'en';
	$: c = $loraContrast;
	$: onBridge = isBridgeSentence($inputText);
	// After the short path, do not auto-lay down the contrast bar — even on
	// the shared bridge sentence / 「换上这句中文」. The learner opens (and
	// can close) this door themselves. Coming from the fine-tune course with
	// an already-active contrast, or a #lora-contrast hash, still shows the bar.
	$: show = c.active;
	$: offerDoor = !c.active && $textPathDone && (onBridge || $selectedExampleIdx === 5);
	$: modules = c.meta?.actualModules?.length ? c.meta.actualModules : c.meta?.recipeModules || [];
	$: hasAttn = modules.some((m) => m.includes('c_attn'));
	$: hasAttnProj = modules.some((m) => m.includes('attn.c_proj'));
	$: hasMlpProj = modules.some((m) => m.includes('mlp.c_proj'));
	$: hasMlpFc = modules.some((m) => m.includes('mlp.c_fc'));
	$: recipeOnlyAttn =
		(c.meta?.recipeModules || []).every((m) => m.includes('attn')) &&
		(c.meta?.recipeModules || []).length > 0 &&
		hasMlpProj;
	$: runLabel = c.meta?.resolvedRunId || c.runId || $finetuneRunId || PREFERRED_LORA_RUN;
	$: smallMove =
		!!c.meta && (typeof c.meta.maxAttnDelta === 'number' ? c.meta.maxAttnDelta < 0.01 : false);
	$: ready = c.active && !!c.base && !c.loading && !c.error;

	const pick = (side: LoraSide) => {
		if (c.loading) return;
		if (!c.active || !c.base) {
			void start();
			return;
		}
		applyLoraSide(side);
	};

	onMount(() => {
		if ($loraContrast.active && !$loraContrast.base && !$loraContrast.loading) {
			void start();
		}
	});

	$: contrastText = (c.text || '').trim();
	$: currentText = ($inputText || '').trim();
	$: mismatched = !!(c.active && contrastText && currentText && currentText !== contrastText);

	const pinTo = async (text: string) => {
		selectedExampleIdx.set(BRIDGE_EXAMPLE_IDX);
		try {
			predictedToken.set({ token: '', tokenId: -1, probability: 0, rank: -1 } as any);
		} catch {
			/* ignore */
		}
		inputText.set(text);
		await refreshLoraContrast(text, c.runId || $finetuneRunId || PREFERRED_LORA_RUN);
	};

	const start = async () => {
		const raw = ($inputText || '').trim();
		const continuedBridge = !!raw && isBridgeSentence(raw) && raw !== BRIDGE_SENTENCE_ZH;
		const text = !raw || continuedBridge ? BRIDGE_SENTENCE_ZH : raw;
		if (text !== raw) {
			selectedExampleIdx.set(BRIDGE_EXAMPLE_IDX);
			try {
				predictedToken.set({ token: '', tokenId: -1, probability: 0, rank: -1 } as any);
			} catch {
				/* ignore */
			}
			inputText.set(text);
		}
		await refreshLoraContrast(text, c.runId || $finetuneRunId || PREFERRED_LORA_RUN);
	};


	$: baseRows =
		getProbabilities && c.base && $textTokenizer
			? getProbabilities({
					tokenizer: $textTokenizer,
					logits: c.base.logits,
					temperature: $temperature,
					sampling: $sampling
				}).probabilities.slice(0, 5)
			: [];
	$: loraRows =
		getProbabilities && c.tuned && $textTokenizer
			? getProbabilities({
					tokenizer: $textTokenizer,
					logits: c.tuned.logits,
					temperature: $temperature,
					sampling: $sampling
				}).probabilities.slice(0, 5)
			: [];
	$: focusLayer = (c.meta?.suggestBlock ?? 0) + 1;
	$: focusHead = (c.meta?.suggestHead ?? 0) + 1;

	const pct = (v: number | undefined) => (typeof v === 'number' ? (v * 100).toFixed(2) + '%' : '—');
	const delta = (a?: number, b?: number) => {
		if (typeof a !== 'number' || typeof b !== 'number') return '—';
		const d = (b - a) * 100;
		return (d >= 0 ? '+' : '') + d.toFixed(3) + ' pt';
	};

	const backToOnnx = () => {
		exitLoraContrast();
		// Retrigger the text-course ONNX / cache path on the same sentence.
		inputText.update((t) => `${t}`);
	};
</script>

{#if show}
	<section class="lora-bar" data-te-lora="bar" class:on={c.active} class:loading={c.loading} class:ready={ready} data-te-lora-ready={ready ? "1" : "0"}>
		<div class="row head">
			<p class="kicker">{zh ? '对照：基线 GPT-2 和这次 LoRA' : 'Contrast: baseline GPT-2 and this LoRA'}</p>
			<span
				class="phase"
				class:loading={c.loading}
				class:fail={!!c.error}
				class:ok={c.active && c.base && c.tuned && !c.loading && !c.error}
				data-te-lora="phase"
			>
				{#if c.loading}{zh ? '载入中' : 'Loading'}
				{:else if c.error}{zh ? '对照失败' : 'Contrast failed'}
				{:else if c.active && c.base && c.tuned}{zh ? (smallMove ? '已对照（改动很小）' : '已对照') : (smallMove ? 'Contrasted (small shift)' : 'Contrasted')}
				{:else if c.active && c.base}{zh ? '只看到基线' : 'Baseline only'}
				{:else}{zh ? '尚未对照' : 'Not contrasted yet'}{/if}
			</span>
			{#if c.meta?.hasTuned || c.runId}
				<p class="run" data-te-lora="run">{zh ? '用的适配器：' : 'Adapter: '}{runLabel}{#if c.meta?.r} · r={c.meta.r}{/if}{#if c.meta?.alpha} · α={c.meta.alpha}{/if}</p>
			{/if}
		</div>

		<div class="row switches" role="tablist" aria-label={zh ? '对照切换' : 'Contrast switch'}>
			<button
				type="button"
				class="side"
				class:on={c.active && c.side === 'base'}
				data-te-lora="side-base"
				disabled={c.loading}
				on:click={() => pick('base')}
			>
				{zh ? '微调前基线' : 'Baseline before fine-tune'}
			</button>
			<button
				type="button"
				class="side lora"
				class:on={c.active && c.side === 'lora'}
				data-te-lora="side-lora"
				disabled={c.loading || (c.active && !c.tuned)}
				on:click={() => pick('lora')}
			>
				{zh ? '装上这次 LoRA 之后' : 'After this LoRA is attached'}
			</button>
			{#if !c.active || (c.active && !c.base && !c.loading && !c.error)}
				<button type="button" class="start" data-te-lora="start" on:click={start}>
					{zh ? '在这张桑基图上对照' : 'Contrast on this Sankey'}
				</button>
			{/if}
			{#if c.active}
				<button type="button" class="ghost" data-te-lora="close" data-te-lora-onnx="1" on:click={backToOnnx}>
					{zh ? '关闭对照，回到课堂默认图' : 'Close contrast and return to the classroom drawing'}
				</button>
			{/if}
		</div>

		{#if mismatched}
			<p class="mismatch" data-te-lora="mismatch">
				{zh
					? '右侧主表跟的是当前输入框，对照条跟的是对照那一句。两套数字对不齐时，请先对齐再读。'
					: 'The right-hand table follows the current input box; the contrast strip follows the contrasted sentence. If the two sets of numbers disagree, align them before reading.'}
				<button type="button" class="align" data-te-lora="align-bridge" on:click={() => pinTo(BRIDGE_SENTENCE_ZH)}>
					{zh ? '一键用贯穿句对齐' : 'Align to the shared sentence'}
				</button>
				<button type="button" class="align" data-te-lora="align-current" on:click={() => pinTo(currentText || BRIDGE_SENTENCE_ZH)}>
					{zh ? '用当前输入重新对照' : 'Re-contrast the current input'}
				</button>
			</p>
		{/if}

		{#if c.loading}
			<p class="status" data-te-lora="status">
				{zh
					? '正在让本机训练器用同一份 PyTorch GPT-2 做一次前向（先基线，再贴上 LoRA）。第一次装模型可能要几十秒，之后会快很多。不是在开训，也没有往浏览器再塞一份大模型。'
					: 'The local trainer is running one forward pass of the same PyTorch GPT-2 — first the baseline, then with this LoRA attached. The first load may take a few dozen seconds; later ones are much faster. This is not training, and it does not load another large model in the browser.'}
			</p>
		{:else if c.error && c.error === 'NO_TUNED'}
			<p class="status warn" data-te-lora="status">
				{zh
					? '训练器载入了基线，但这次跑次没有可装的适配器。下面只显示微调前基线。'
					: 'The trainer loaded the baseline, but this run has no loadable adapter. Only the pre-fine-tune baseline is shown.'}
			</p>
		{:else if c.error}
			<p class="status warn" data-te-lora="status">
				{zh ? '对照没能完成：' : 'The contrast could not finish: '}
				{c.error === 'TIMEOUT'
					? zh
						? '训练器响应超时。请确认 8787 训练器在运行，然后重试。'
						: 'The trainer timed out. Make sure the trainer on port 8787 is running, then retry.'
					: c.error}
				<button type="button" class="ghost" on:click={start}>{zh ? '重试' : 'Retry'}</button>
			</p>
		{/if}

		{#if c.active && c.base && c.tuned && (baseRows.length || loraRows.length)}
			<div class="cmp" data-te-lora="prob-cmp">
				<p class="cmp-lead">
					{zh
						? `这次短跑对这一句的下一个词只挪了一点点（两边首位仍是同一个词片）。桑基图已转到显示图上相对变化最大的第 ${focusLayer} 层、第 ${focusHead} 个头（最大格子差 ${c.meta?.maxAttnDelta ?? '—'}）。改动可能很小，对照条里的百分点更细，点上面两个按钮就能换一侧的图和右侧概率表。`
						: `On this sentence, this short run only nudges the next-token probabilities a little (the top piece is still the same). The Sankey jumped to the layer and head with the largest shift on the displayed map (layer ${focusLayer}, head ${focusHead}, largest cell change ${c.meta?.maxAttnDelta ?? '—'}). The shift may be small; the comparison strip uses finer percentage points. Click the two buttons above to switch the diagram and the right-hand table.`}
				</p>
				<table>
					<thead>
						<tr>
							<th>{zh ? '词片' : 'Token'}</th>
							<th>{zh ? '微调前' : 'Baseline'}</th>
							<th>{zh ? '装上 LoRA 后' : 'After LoRA'}</th>
							<th>{zh ? '差值' : 'Δ'}</th>
						</tr>
					</thead>
					<tbody>
						{#each baseRows as row, i}
							{@const other = loraRows.find((r) => r.tokenId === row.tokenId) || loraRows[i]}
							<tr class:on={c.side === 'lora' ? false : true} data-te-lora-cmp={row.tokenId}>
								<td class="tok">{row.token}</td>
								<td data-te-lora="p-base">{pct(row.probability)}</td>
								<td data-te-lora="p-lora">{pct(other?.probability)}</td>
								<td data-te-lora="p-delta">{delta(row.probability, other?.probability)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="note">{zh ? `当前桑基图正在看第 ${$blockIdx + 1} 层、第 ${$attentionHeadIdx + 1} 个头。` : `The Sankey is now on layer ${$blockIdx + 1}, head ${$attentionHeadIdx + 1}.`}</p>
				<p class="note" data-te-tok="cut-note">{zh ? TOKEN_CUT_NOTE_ZH : TOKEN_CUT_NOTE_EN}</p>
			</div>
		{/if}

		{#if c.active && c.base}
			<details class="more" data-te-lora="details">
			<summary>{zh ? '这块是怎么对照的，以及请读的限制' : 'How this contrast works, and the limits to read'}</summary>
			<div class="explain" data-te-lora="explain">
				<p>
					{zh
						? 'LoRA 没有把整个 GPT-2 换掉，也不是在浏览器那份冰结 ONNX 里开训。它只在若干投影旁边加了低秩增量。和微调课方法结构图对齐：'
						: 'LoRA does not replace all of GPT-2, and it is not training inside the frozen ONNX in the browser. It only adds a low-rank increment beside some projections. Aligned with the fine-tune method diagram:'}
				</p>
				<ul class="mods">
					<li class:on={hasAttn} data-te-lora="mod-attn">
						<strong>Q / K / V</strong>
						<span>{zh ? '（注意力 c_attn）' : ' (attention c_attn)'}</span>
						{#if hasAttn}<em>{zh ? '这份适配器改了' : 'changed in this adapter'}</em>{/if}
					</li>
					<li class:on={hasAttnProj} data-te-lora="mod-attn-proj">
						<strong>{zh ? '注意力输出投影' : 'Attention output projection'}</strong>
						<span> (attn.c_proj)</span>
						{#if hasAttnProj}<em>{zh ? '这份适配器改了' : 'changed in this adapter'}</em>{/if}
					</li>
					<li class:on={hasMlpProj} data-te-lora="mod-mlp-proj">
						<strong>{zh ? 'FFN 输出投影' : 'FFN output projection'}</strong>
						<span> (mlp.c_proj)</span>
						{#if hasMlpProj}<em>{zh ? '这份适配器实际也改了' : 'also changed in this saved adapter'}</em>{:else}<em class="off">{zh ? '这份没改' : 'not changed here'}</em>{/if}
					</li>
					<li class:on={hasMlpFc} data-te-lora="mod-mlp-fc">
						<strong>{zh ? 'FFN 向上投影' : 'FFN up-projection'}</strong>
						<span> (mlp.c_fc)</span>
						{#if hasMlpFc}<em>{zh ? '这份适配器改了' : 'changed in this adapter'}</em>{:else}<em class="off">{zh ? '这份没改' : 'not changed here'}</em>{/if}
					</li>
				</ul>
				{#if recipeOnlyAttn}
					<p class="note" data-te-lora="module-note">
						{zh
							? '配方写的是只改注意力的 c_attn 和 c_proj。保存下来的适配器里，短名字 c_proj 也对上了 FFN 的输出投影，所以 mlp.c_proj 实际也被训练了。上边按文件里真正有的模块标注，不按配方口头承诺。'
							: 'The recipe asked only for attention c_attn and c_proj. In the saved adapter, the short name c_proj also matched the FFN output projection, so mlp.c_proj was trained too. The labels above follow what is actually in the file, not just the recipe wording.'}
					</p>
				{/if}
				{#if smallMove}
					<p class="note" data-te-lora="small-move">
						{zh
							? '这次短跑对这一句的改动很小：右边概率表用了更细的百分点，桑基图会跳到改动相对最大的那一层和头。数字来自本机 PyTorch GPT-2，不能和浏览里的冰结 ONNX 逐格对。'
							: 'This short run only moves this sentence a little: the probability table uses finer percentage points, and the Sankey jumps to the layer and head with the largest relative shift. Numbers come from the local PyTorch GPT-2 and will not match the frozen ONNX in the browser cell by cell.'}
					</p>
				{/if}
				<p class="note" data-te-lora="limit">
					{zh
						? '限制请看清楚：对照的两边都来自本机训练器的同一份 PyTorch GPT-2，差别只来自是否贴上这次 LoRA。课堂默认图仍是浏览器里的冰结 ONNX GPT-2，两套引擎的数字不会完全一样。注意矩阵的五步按 Q·K 公式重建（评估时 dropout 等于 softmax）。桑基图的通道形状是结构示意；注意格子和右侧「下一个词」概率表是这次前向的真实数。点上面两个按钮，格子和右侧表都会变。'
						: 'Please read the limits: both sides of this contrast come from the same PyTorch GPT-2 on the local trainer — the only difference is whether this LoRA is attached. The classroom default drawing is still the frozen ONNX GPT-2 in the browser, so the numbers will not match exactly across engines. The five attention maps are rebuilt from the Q·K formula (dropout equals softmax at eval). The Sankey channel shapes are a structural sketch; the attention cells and the right-hand next-token table are real numbers from this forward pass. Click the two buttons above — both the grid and the table will change.'}
				</p>
			</div>
			</details>
		{:else if !c.active}
			<p class="hint">
				{zh
					? '点「在这张桑基图上对照」，同一句会在训练器上跑一遍基线和贴上 LoRA 之后的结果。你可以在同一张图里来回切换。'
					: 'Click “Contrast on this Sankey” to run this same sentence on the trainer, once as the baseline and once with this LoRA attached. You can switch back and forth on the same drawing.'}
			</p>
		{/if}

		<p class="back">
			<button type="button" class="link" data-te-lora="to-finetune" on:click={goToFinetuneFromText}>
				{zh ? '回微调课看这次 LoRA 是怎么练出来的' : 'Back to the fine-tune course to see how this LoRA was trained'}
			</button>
		</p>
	</section>
{:else if offerDoor}
	<div class="lora-door" data-te-lora="door">
		<p class="door-copy">
			{zh
				? '选做：可以把基线 GPT-2 和一次 LoRA 对照着看。不会自动打开，也不抢「现在做这件事」。'
				: 'Optional: you can contrast baseline GPT-2 with a LoRA. This does not open by itself, and it does not fight “Do this now”.'}
		</p>
		<button type="button" class="door-open" data-te-lora="open" on:click={start}>
			{zh ? '打开 LoRA 对照' : 'Open LoRA contrast'}
		</button>
	</div>
{/if}

<style>
	.lora-door {
		flex: 1 0 100%;
		margin: 0.15rem 0 0.2rem;
		padding: 0.45rem 0.7rem;
		border: 1px dashed #ddd6fe;
		border-radius: 0.55rem;
		background: #fcfcff;
		color: #5b21b6;
		font-size: 0.8rem;
		line-height: 1.45;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem 0.75rem;
	}
	.door-copy {
		margin: 0;
		flex: 1 1 16rem;
		color: #6b21a8;
	}
	.door-open {
		border: 1px solid #c4b5fd;
		background: white;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.door-open:hover {
		background: #f5f3ff;
	}
	.lora-bar {
		flex: 1 0 100%;
		margin: 0.15rem 0 0.2rem;
		padding: 0.65rem 0.8rem 0.7rem;
		border: 1px solid #ddd6fe;
		border-radius: 0.55rem;
		background: #faf5ff;
		color: #4c1d95;
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.lora-bar.on {
		background: #f5f3ff;
		border-color: #c4b5fd;
	}
	.row.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem 0.85rem;
		margin-bottom: 0.35rem;
	}
	.kicker {
		margin: 0;
		font-weight: 700;
		color: #5b21b6;
	}
	.phase {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-size: 0.72rem;
		font-weight: 700;
		background: #e5e7eb;
		color: #374151;
	}
	.phase.loading {
		background: #fef3c7;
		color: #92400e;
	}
	.phase.fail {
		background: #fee2e2;
		color: #9a3412;
	}
	.phase.ok {
		background: #dcfce7;
		color: #166534;
	}
	.run {
		margin: 0;
		color: #6d28d9;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.74rem;
	}
	.switches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
	button.side,
	button.start {
		border: 1px solid #c4b5fd;
		background: white;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.28rem 0.75rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	button.side.on {
		background: #5b21b6;
		color: white;
		border-color: #5b21b6;
	}
	button.side.lora.on {
		background: #6d28d9;
		border-color: #6d28d9;
	}
	button.side:disabled,
	button.start:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	button.start {
		background: #6d28d9;
		color: white;
		border-color: #6d28d9;
	}
	button.ghost,
	button.link {
		border: none;
		background: transparent;
		padding: 0.15rem 0.2rem;
		color: #6d28d9;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	.status {
		margin: 0.45rem 0 0;
	}
	.status.warn {
		color: #9a3412;
	}
	.explain {
		margin: 0.5rem 0 0;
	}
	.explain p {
		margin: 0 0 0.3rem;
	}
	.mods {
		list-style: none;
		padding: 0;
		margin: 0 0 0.4rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.mods li {
		border: 1px dashed #d1d5db;
		background: #f3f4f6;
		color: #6b7280;
		border-radius: 0.4rem;
		padding: 0.2rem 0.5rem;
	}
	.mods li.on {
		border-style: solid;
		border-color: #7c3aed;
		background: #ede9fe;
		color: #4c1d95;
	}
	.mods em {
		font-style: normal;
		margin-left: 0.3rem;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.mods em.off {
		font-weight: 500;
		color: #6b7280;
	}
	.note,
	.hint {
		margin: 0.25rem 0 0;
		color: #6b7280;
		font-size: 0.75rem;
	}
	.back {
		margin: 0.4rem 0 0;
	}
	.cmp {
		margin: 0.5rem 0 0.2rem;
	}
	.cmp-lead {
		margin: 0 0 0.35rem;
	}
	.mismatch {
		margin: 0.45rem 0 0;
		padding: 0.4rem 0.55rem;
		border: 1px solid #fdba74;
		background: #fff7ed;
		color: #9a3412;
		border-radius: 0.4rem;
	}
	button.align {
		display: inline-block;
		margin: 0.25rem 0.45rem 0 0;
		border: 1px solid #c4b5fd;
		background: white;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.15rem 0.65rem;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.cmp table {
		border-collapse: collapse;
		width: auto;
		min-width: 18rem;
		font-variant-numeric: tabular-nums;
	}
	.cmp th,
	.cmp td {
		border-bottom: 1px solid #e9d5ff;
		padding: 0.12rem 0.55rem 0.12rem 0;
		text-align: right;
	}
	.cmp th:first-child,
	.cmp td:first-child {
		text-align: left;
	}
	.cmp .tok {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		max-width: 8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more {
		margin: 0.45rem 0 0;
	}
	.more summary {
		cursor: pointer;
		color: #6b7280;
		font-size: 0.78rem;
		list-style: none;
	}
	.more summary::-webkit-details-marker { display: none; }
	.more summary::before {
		content: '▸ ';
		color: #7c3aed;
	}
	.more[open] summary::before { content: '▾ '; }
	.lora-bar {
		max-height: none;
	}
</style>
