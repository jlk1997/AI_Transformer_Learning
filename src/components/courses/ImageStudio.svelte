<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { locale, messages } from '~/i18n';
	import { courseContrastOpen } from '~/store/course';
	import { IMAGE_PROMPTS } from '~/courses/image/prompts';
	import {
		imageArCount,
		imageCfg,
		imageMode,
		imagePlaying,
		imagePromptIdx,
		imageScheduler,
		imageSeed,
		imageStep,
		imageSteps
	} from '~/courses/image/store';
	import { describeStepChange, renderFrame, renderNoisePreview } from '~/courses/image/render';
	import { AR_GRID, drawArCanvas, nextPatchProbs, pickPatch, type PatchTok } from '~/courses/image/ar';
	import ImageExplore from '~/components/courses/ImageExplore.svelte';
	import { researchDoorOpen, bootResearchDoorHooks } from '~/courses/researchDoor';
	import { imageKnobsUnlocked } from '~/store/beginnerPath';
	import { bootLabSignals } from '~/courses/labSignals';
	bootLabSignals();
	bootResearchDoorHooks();

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $locale !== 'en';
	$: prompt = IMAGE_PROMPTS[$imagePromptIdx] ?? IMAGE_PROMPTS[0];

	let mainEl: HTMLCanvasElement;
	let noiseEl: HTMLCanvasElement;
	let vaeEl: HTMLCanvasElement;
	let cmp1: HTMLCanvasElement;
	let cmp7: HTMLCanvasElement;
	let cmp15: HTMLCanvasElement;
	let arEl: HTMLCanvasElement;
	let fwdEls: (HTMLCanvasElement | undefined)[] = [];

	let arFilled: { tok: PatchTok }[] = [];
	let arProbs: ReturnType<typeof nextPatchProbs> = [];

	const SIZE = 192;

	const paint = (el: HTMLCanvasElement | undefined, data: ImageData) => {
		if (!el) return;
		if (el.width !== data.width) {
			el.width = data.width;
			el.height = data.height;
		}
		el.getContext('2d')!.putImageData(data, 0, 0);
	};

	const common = () => ({
		promptId: prompt.id,
		seed: $imageSeed,
		cfg: $imageCfg,
		step: $imageStep,
		totalSteps: $imageSteps,
		scheduler: $imageScheduler,
		width: SIZE,
		height: SIZE
	});

	const redraw = () => {
		if ($imageMode === 'ar') {
			arProbs = nextPatchProbs(prompt.id, $imageArCount, $imageSeed);
			if (arEl) {
				arEl.width = SIZE;
				arEl.height = SIZE;
				drawArCanvas(arEl.getContext('2d')!, SIZE, SIZE, arFilled);
			}
			return;
		}
		const p = common();
		paint(mainEl, renderFrame(p));
		paint(noiseEl, renderNoisePreview(p));
		// VAE-ish: a slightly softer / smaller-looking decode vs "latent" (same image, last step, less grain vs current)
		paint(vaeEl, renderFrame({ ...p, step: $imageSteps, totalSteps: Math.max($imageSteps, 50) }));
		paint(cmp1, renderFrame({ ...p, cfg: 1 }));
		paint(cmp7, renderFrame({ ...p, cfg: 7 }));
		paint(cmp15, renderFrame({ ...p, cfg: 15 }));
		fwdSteps.forEach((s, i) => {
			if (fwdEls[i]) paint(fwdEls[i], renderFrame({ ...p, step: s }));
		});
	};

	$: $imagePromptIdx, $imageSeed, $imageCfg, $imageSteps, $imageStep, $imageScheduler, $imageMode, $imageArCount, prompt.id;
	$: {
		// rebuild AR sequence when seed/prompt reset
		void $imagePromptIdx;
		void $imageSeed;
		arFilled = [];
		for (let i = 0; i < $imageArCount; i++) {
			const probs = nextPatchProbs(prompt.id, i, $imageSeed);
			arFilled = [...arFilled, { tok: pickPatch(probs, $imageSeed, i) }];
		}
	}

	$: {
		void $imagePromptIdx;
		void $imageSeed;
		void $imageCfg;
		void $imageSteps;
		void $imageStep;
		void $imageScheduler;
		void $imageMode;
		void $imageArCount;
		tick().then(redraw);
	}

	$: hint =
		$imageMode === 'ar'
			? zh
				? `已填 ${$imageArCount}/${AR_GRID * AR_GRID} 块。右边是「下一块更可能是什么」。这和「再去噪一步改整张图」不是同一条路。`
				: `Filled ${$imageArCount}/${AR_GRID * AR_GRID} patches. The right side is the next-patch distribution — unlike denoise, which edits the whole latent.`
			: describeStepChange(
					{
						...common(),
						step: $imageStep,
						totalSteps: $imageSteps,
						cfg: $imageCfg,
						seed: $imageSeed,
						promptId: prompt.id,
						scheduler: $imageScheduler
					},
					zh ? 'zh-CN' : 'en'
				);

	let playTimer: ReturnType<typeof setInterval> | null = null;
	const stopPlay = () => {
		if (playTimer) clearInterval(playTimer);
		playTimer = null;
	};
	$: if ($imagePlaying) {
		stopPlay();
		playTimer = setInterval(() => {
			if ($imageStep >= $imageSteps) {
				imagePlaying.set(false);
				stopPlay();
				return;
			}
			imageStep.update((n) => n + 1);
		}, 280);
	} else {
		stopPlay();
	}
	onDestroy(stopPlay);

	$: schedule = Array.from({ length: $imageSteps + 1 }, (_, i) => i);
	$: fwdSteps = (() => {
		const cur = Math.max(0, $imageStep);
		const mid = Math.max(0, Math.round(cur / 2));
		const uniq: number[] = [];
		for (const s of [cur, mid, 0]) if (!uniq.includes(s)) uniq.push(s);
		return uniq;
	})();
	$: condVec = Array.from({ length: 24 }, (_, i) => ((i * 17 + $imagePromptIdx * 9 + $imageSeed) % 10) / 10);
	$: uncondVec = Array.from({ length: 24 }, (_, i) => ((i * 5 + 3) % 10) / 10);
</script>

<div class="image-studio">
	{#if $researchDoorOpen}
		<ImageExplore />
	{/if}
	<p class="disclaimer">
		{m.disclaimer ??
			(zh
				? '这是预先设计的示例轨迹（按提示词、听话程度、步数和起点编号实时重放），用来把流程看懂。不是浏览器里跑的大模型。'
				: 'These are designed example trajectories, replayed from the prompt, CFG, steps, and seed so you can see the process — not a live large model in the browser.')}
	</p>
	<div
		class="mode-switch"
		class:curtain-blocked={$courseContrastOpen}
		data-te-image="mode-switch"
		inert={$courseContrastOpen ? true : undefined}
		aria-hidden={$courseContrastOpen ? 'true' : undefined}
	>
		<button type="button" class:on={$imageMode === 'diffusion'} on:click={() => imageMode.set('diffusion')}>
			{m.modeDiff ?? (zh ? '潜在扩散（主路）' : 'Latent diffusion')}
		</button>
		<button type="button" class:on={$imageMode === 'ar'} on:click={() => imageMode.set('ar')}>
			{m.modeAr ?? (zh ? '图像 token 自回归（对照）' : 'Autoregressive image tokens')}
		</button>
	</div>

	<div class="cols">
		<section class="col left">
			<h3>{m.leftTitle ?? (zh ? '条件 / 输入' : 'Condition / input')}</h3>
			<p class="prompt-line image-prompt">
				<strong>{zh ? prompt.labelZh : prompt.labelEn}</strong>
				<span class="mono">{prompt.prompt}</span>
			</p>
			<p class="tiny">{zh ? prompt.hintZh : prompt.hintEn}</p>
			<div class="clip-condition">
				<div class="vec-lab">{zh ? '有条件文本向量（示意）' : 'Conditional text vector (schematic)'}</div>
				<div class="vec">
					{#each condVec as v}
						<i style="background:hsl(262 70% {40 + v * 40}%);opacity:{0.4 + v * 0.6}"></i>
					{/each}
				</div>
				<div class="vec-lab">{zh ? '无条件（空提示）向量' : 'Unconditional (empty prompt)'}</div>
				<div class="vec">
					{#each uncondVec as v}
						<i style="background:hsl(220 10% {40 + v * 40}%);opacity:{0.4 + v * 0.6}"></i>
					{/each}
				</div>
				<p class="tiny">
					{zh
						? ($imageKnobsUnlocked
							? '去噪时会同时看这两路，再用「听话程度」把它们拉开。'
							: '去噪时会同时看这两路。先看它们长得不一样，名字后面再起。')
						: ($imageKnobsUnlocked
							? 'Denoising looks at both paths, then CFG pulls them apart.'
							: 'Denoising looks at both paths. See that they differ first; the name comes later.')}
				</p>
			</div>
		</section>

		<section class="col mid">
			<h3>{m.midTitle ?? (zh ? '本步计算' : 'This step')}</h3>
			{#if $imageMode === 'diffusion'}
				<div class="image-step" data-te-image="step" data-te-image-step={String($imageStep)}>
				<canvas bind:this={mainEl} class="image-canvas" width={SIZE} height={SIZE} data-te-image="canvas"></canvas>
				<div class="image-timeline">
					{#each schedule as s}
						<button
							type="button"
							class="tick"
							class:on={s === $imageStep}
							on:click={() => imageStep.set(s)}
							title={`${s}/${$imageSteps}`}>{s === $imageStep ? s : ''}</button
						>
					{/each}
				</div>
				</div>
			{:else}
				<canvas bind:this={arEl} class="ar-canvas image-canvas" width={SIZE} height={SIZE}></canvas>
			{/if}
			<p class="step-hint" data-te-image="step-hint">{hint}</p>
			{#if $imageMode === 'diffusion' && $imageStep > 0}
				<div class="forward-strip" data-te-image="forward">
					<div class="vec-lab">{zh ? '同一条示例轨迹反过来看：越往前走，图越吵（示意）' : 'The same example trajectory, read the other way: earlier steps are noisier (a sketch)'}</div>
					<div class="fwd-thumbs">
						{#each fwdSteps as s, i}
							<figure>
								<canvas
									bind:this={fwdEls[i]}
									width={SIZE}
									height={SIZE}
								></canvas>
								<figcaption>{zh ? `第 ${s} 步` : `step ${s}`}</figcaption>
							</figure>
						{/each}
					</div>
					<p class="tiny">{zh ? '这不是新的主按钮。主路仍是「再去噪一步」。这些小图来自同一条预先设计的示例轨迹。' : 'This is not a new main button. The main path is still “Denoise one step.” These thumbnails come from the same pre-designed example trajectory.'}</p>
				</div>
			{/if}
		</section>

		<section class="col right">
			<h3>{m.rightTitle ?? (zh ? '输出与对照' : 'Output / contrast')}</h3>
			{#if $imageMode === 'diffusion'}
				<div class="noise-pred">
					<div class="vec-lab">{zh ? '本步预测的噪声（示意）' : 'Predicted noise this step (schematic)'}</div>
					<canvas bind:this={noiseEl} width={SIZE} height={SIZE}></canvas>
				</div>
				<div class="vae-panel">
					<div class="vec-lab">{zh ? 'VAE 解码后的清晰成品（走完全部步）' : 'VAE decode of a fully denoised latent'}</div>
					<canvas bind:this={vaeEl} width={SIZE} height={SIZE}></canvas>
				</div>
				<div class="cfg-compare" data-te-image="cfg">
					<div class="vec-lab">{zh
						? ($imageKnobsUnlocked
							? '同一提示词、同一种子，不同听话程度'
							: '同一提示词、同一种子，三种走法')
						: ($imageKnobsUnlocked
							? 'Same prompt and seed, different CFG'
							: 'Same prompt and seed, three ways of going')}</div>
					<div class="thumbs">
						<figure>
							<canvas bind:this={cmp1} width={SIZE} height={SIZE}></canvas>
							<figcaption>{$imageKnobsUnlocked ? 'CFG 1' : (zh ? '走法一' : 'Way 1')}</figcaption>
						</figure>
						<figure>
							<canvas bind:this={cmp7} width={SIZE} height={SIZE}></canvas>
							<figcaption>{$imageKnobsUnlocked ? 'CFG 7' : (zh ? '走法二' : 'Way 2')}</figcaption>
						</figure>
						<figure>
							<canvas bind:this={cmp15} width={SIZE} height={SIZE}></canvas>
							<figcaption>{$imageKnobsUnlocked ? 'CFG 15' : (zh ? '走法三' : 'Way 3')}</figcaption>
						</figure>
					</div>
				</div>
			{:else}
				<div class="ar-probs">
					<div class="vec-lab">
						{zh ? `下一块（第 ${Math.min($imageArCount + 1, 16)} 格）的概率` : `Next patch (#${Math.min($imageArCount + 1, 16)}) probabilities`}
					</div>
					{#each arProbs as p}
						<div class="bar-row">
							<span>{zh ? p.tok.labelZh : p.tok.labelEn}</span>
							<div class="bar"><i style="width:{Math.round(p.prob * 100)}%;background:rgb({p.tok.color.join(',')})"></i></div>
							<em>{(p.prob * 100).toFixed(0)}%</em>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>

<style lang="scss">
	.image-studio {
		height: 100%;
		width: 100%;
		padding: 0.6rem 1rem 1.25rem;
		overflow: auto;
		box-sizing: border-box;
	}
	.disclaimer {
		margin: 0 0 0.45rem;
		font-size: var(--te-fs-caption, 0.75rem);
		color: #6b7280;
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 0;
		line-height: 1.45;
	}
	.mode-switch {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.mode-switch button {
		border: 1px solid #e5e7eb;
		background: white;
		border-radius: 999px;
		padding: 0.25rem 0.7rem;
		cursor: pointer;
		font-size: 0.82rem;
	}
	.mode-switch button.on {
		background: #f5f3ff;
		color: #5b21b6;
		border-color: #c4b5fd;
		font-weight: 600;
	}
	.cols {
		display: grid;
		grid-template-columns: 1.1fr 1.3fr 1.2fr;
		gap: 0.8rem;
		min-height: 0;
	}
	.col {
		background: white;
		border: 1px solid #eee;
		border-radius: 0.7rem;
		padding: 0.55rem 0.7rem 0.7rem;
		min-width: 0;
	}
	.col.right {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 0.5rem;
		row-gap: 0.3rem;
		align-content: start;
	}
	.col.right h3,
	.col.right .cfg-compare {
		grid-column: 1 / -1;
	}
	.col.right canvas {
		max-width: 100%;
	}
	h3 {
		margin: 0 0 0.5rem;
		font-size: 0.92rem;
		color: #5b21b6;
	}
	canvas {
		width: 100%;
		max-width: 220px;
		aspect-ratio: 1;
		background: #e5e7eb;
		border-radius: 0.4rem;
		image-rendering: pixelated;
		display: block;
	}
	.mid canvas {
		max-width: 240px;
		margin: 0 auto;
	}
	.prompt-line {
		margin: 0 0 0.3rem;
		font-size: 0.9rem;
	}
	.mono {
		display: block;
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: #6b7280;
		margin-top: 0.15rem;
	}
	.tiny {
		font-size: 0.78rem;
		color: #6b7280;
		margin: 0.25rem 0;
	}
	.vec-lab {
		font-size: 0.75rem;
		color: #4b5563;
		margin: 0.45rem 0 0.2rem;
	}
	.vec {
		display: flex;
		height: 1.1rem;
		border-radius: 0.2rem;
		overflow: hidden;
		border: 1px solid #eee;
	}
	.vec i {
		flex: 1;
		display: block;
	}
	.image-timeline {
		display: flex;
		gap: 2px;
		margin: 0.5rem 0 0.3rem;
		flex-wrap: nowrap;
		overflow-x: auto;
	}
	.tick {
		flex: 1;
		min-width: 6px;
		height: 14px;
		border: none;
		background: #ede9fe;
		padding: 0;
		cursor: pointer;
		font-size: 0.55rem;
		color: white;
	}
	.tick.on {
		background: #6d28d9;
	}
	.step-hint {
		margin: 0.45rem 0 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: #1f2937;
		background: #faf5ff;
		border-radius: 0.4rem;
		padding: 0.4rem 0.5rem;
	}
	.forward-strip {
		margin: 0.55rem 0 0;
		padding: 0.4rem 0.45rem 0.35rem;
		background: #faf5ff;
		border-radius: 0.4rem;
	}
	.fwd-thumbs {
		display: flex;
		gap: 0.35rem;
		margin: 0.25rem 0 0.15rem;
	}
	.fwd-thumbs figure {
		margin: 0;
		flex: 1;
	}
	.fwd-thumbs canvas {
		max-width: 100%;
		height: auto;
		display: block;
		border-radius: 0.25rem;
	}
	.fwd-thumbs figcaption {
		font-size: 0.7rem;
		color: #6b7280;
		text-align: center;
		margin: 0.15rem 0 0;
	}
	.thumbs {
		display: flex;
		gap: 0.35rem;
	}
	.thumbs figure {
		margin: 0;
		flex: 1;
	}
	.thumbs canvas {
		max-width: 100%;
	}
	figcaption {
		text-align: center;
		font-size: 0.72rem;
		color: #6b7280;
	}
	.bar-row {
		display: grid;
		grid-template-columns: 3.5rem 1fr 2.2rem;
		gap: 0.3rem;
		align-items: center;
		font-size: 0.78rem;
		margin: 0.2rem 0;
	}
	.bar {
		background: #f3f4f6;
		height: 0.55rem;
		border-radius: 99px;
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
	}
	@media (max-width: 1100px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
	.mode-switch.curtain-blocked {
		pointer-events: none;
	}
</style>
