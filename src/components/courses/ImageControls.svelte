<script lang="ts">
	import { coachLessonIdx, messages, locale } from '~/i18n';
	import { imageKnobsOpen, imageKnobsUnlocked, requestShowImageKnobs } from '~/store/beginnerPath';
	import { noteTutorAction } from '~/tutor/store';
	import {
		imageCfg,
		imageMode,
		imagePlaying,
		imagePromptIdx,
		imageScheduler,
		imageSeed,
		imageStep,
		imageSteps,
		imageArCount,
		imageStationMark
	} from '~/courses/image/store';
	import { IMAGE_PROMPTS, IMAGE_SEEDS, IMAGE_STEP_PRESETS, type ImageScheduler } from '~/courses/image/prompts';
	import { imagePages } from '~/courses/image/textbookPages';

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $locale !== 'en';

	const bump = (pageId: string) => imagePages.find((p) => p.id === pageId)?.complete();
	$: knobsVisible = $imageKnobsUnlocked && $imageKnobsOpen;
	$: playAllReady = $imageMode === 'diffusion' && $imageStep > 0;
	$: imageLessons = ((($messages as any).imageCoach?.lessons ?? []) as { id?: string }[]);
	$: imageLessonId =
		imageLessons[Math.min(Math.max($coachLessonIdx, 0), Math.max(imageLessons.length - 1, 0))]?.id ?? '';
	$: denoiseNow = imageLessonId === 'map' || imageLessonId === 'step' || imageLessonId === 'again';
	$: imageProgress = $imageMode === 'ar' ? $imageArCount : $imageStep;
	// Only the now-do door stays solid. After this station's denoise is seen,
	// the button yields to 「推进一步」. Knobs / invite keep it as an outline.
	$: denoiseHeld =
		!denoiseNow ||
		($coachLessonIdx === 0 && imageProgress > 0) ||
		($coachLessonIdx > 0 && denoiseNow && imageProgress > $imageStationMark);
	let knobLockedMsg = '';
	const onShowKnobs = () => {
		const r = requestShowImageKnobs();
		knobLockedMsg =
			r === 'locked'
				? (zh ? '先点「再去噪一步」，看图变清一点。走到「怎么听提示词」再来拧这些旋钮。' : 'First click “Denoise one step” and watch the picture clear. These knobs unlock on the guidance step.')
				: '';
	};

	const stepOnce = () => {
		if ($imageMode === 'ar') {
			if ($imageArCount < 16) imageArCount.update((n) => n + 1);
			return;
		}
		if ($imageStep < $imageSteps) imageStep.update((n) => n + 1);
		imagePlaying.set(false);
		noteTutorAction('denoise', '再去噪一步');
		bump('denoise-one-step');
	};

	const stepBack = () => {
		if ($imageMode === 'ar') {
			if ($imageArCount > 0) imageArCount.update((n) => n - 1);
			return;
		}
		if ($imageStep > 0) imageStep.update((n) => n - 1);
		imagePlaying.set(false);
	};

	const togglePlay = () => {
		if ($imageMode === 'ar') return;
		imagePlaying.update((v) => !v);
		bump('denoise-one-step');
	};

	const onPrompt = (i: number) => {
		imagePromptIdx.set(i);
		imageStep.set(0);
		imageArCount.set(0);
		imagePlaying.set(false);
	};

	const onCfg = (v: number) => {
		imageCfg.set(v);
		bump('cfg');
	};

	const onSteps = (v: number) => {
		imageSteps.set(v);
		imageStep.set(Math.min($imageStep, v));
		bump('experiment-steps');
	};
</script>

<div class="img-controls" data-click="image-controls">
	<label class="image-prompt">
		<span class="lbl">{m.examples ?? (zh ? '示例提示词' : 'Example prompts')}</span>
		<select class="ctrl" on:change={(e) => onPrompt(+e.currentTarget.value)} value={$imagePromptIdx}>
			{#each IMAGE_PROMPTS as p, i}
				<option value={i}>{zh ? p.labelZh : p.labelEn}</option>
			{/each}
		</select>
	</label>
	<button type="button" class="denoise-button" class:primary={!denoiseHeld} class:ghost={denoiseHeld} data-te-image="denoise" data-te-path="denoise" on:click={stepOnce} disabled={$imageMode === 'diffusion' ? $imageStep >= $imageSteps : $imageArCount >= 16}>
		{m.imageStep ?? (zh ? '再去噪一步' : 'Denoise one step')}
	</button>
	<button type="button" class="ghost" on:click={stepBack} disabled={$imageMode === 'diffusion' ? $imageStep <= 0 : $imageArCount <= 0}>
		{m.stepBack ?? (zh ? '回退一步' : 'Step back')}
	</button>
	{#if $imageMode === 'diffusion' && playAllReady}
		<button type="button" class="play-all-button ghost" data-te-image="play-all" on:click={togglePlay}>
			{$imagePlaying ? (m.pause ?? (zh ? '暂停' : 'Pause')) : (m.playAll ?? (zh ? '一次播完全部步骤' : 'Play all steps'))}
		</button>
	{/if}
	{#if knobsVisible}
	<label class="cfg-control" data-te-image="knobs" title={m.cfgHover ?? (zh ? '听话程度：越高越贴提示词，太高可能把图毁掉。' : 'How closely the image follows the prompt. Too high can wreck it.')}>
		<span class="lbl">{m.cfg ?? (zh ? '听话程度 CFG' : 'Guidance CFG')}</span>
		<input
			type="range"
			min="1"
			max="15"
			step="1"
			value={$imageCfg}
			on:input={(e) => onCfg(+e.currentTarget.value)}
		/>
		<strong>{$imageCfg}</strong>
	</label>
	<label class="steps-control">
		<span class="lbl">{m.steps ?? (zh ? '总步数' : 'Steps')}</span>
		<select class="ctrl" value={$imageSteps} on:change={(e) => onSteps(+e.currentTarget.value)}>
			{#each IMAGE_STEP_PRESETS as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	</label>
	<label class="seed-control" title={m.seedHover ?? (zh ? '起点编号：相同则画面相同。' : 'Same seed, same picture.')}>
		<span class="lbl">{m.seed ?? (zh ? '起点编号' : 'Seed')}</span>
		<select
			class="ctrl"
			value={$imageSeed}
			on:change={(e) => {
				imageSeed.set(+e.currentTarget.value);
				imageStep.set(0);
				imageArCount.set(0);
			}}
		>
			{#each IMAGE_SEEDS as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	</label>
	<label class="scheduler-control">
		<span class="lbl">{m.scheduler ?? (zh ? '调度器' : 'Scheduler')}</span>
		<select class="ctrl" value={$imageScheduler} on:change={(e) => imageScheduler.set(e.currentTarget.value as ImageScheduler)}>
			<option value="euler">Euler</option>
			<option value="ddim">DDIM</option>
		</select>
	</label>
	<button type="button" class="ghost show-knobs" data-te-image="hide-knobs" on:click={() => imageKnobsOpen.set(false)}>
		{zh ? '收起旋钮' : 'Hide knobs'}
	</button>
	{:else}
	<button type="button" class="ghost show-knobs" data-te-image="show-knobs" on:click={onShowKnobs}>
		{zh ? '显示去噪旋钮' : 'Show denoise knobs'}
	</button>
	{#if knobLockedMsg}<span class="knob-locked">{knobLockedMsg}</span>{/if}
	{/if}
</div>

<style>
	.img-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem 0.75rem;
		width: 100%;
	}
	.lbl {
		display: block;
		font-size: 0.7rem;
		color: #6b7280;
		line-height: 1.1;
		margin-bottom: 0.1rem;
	}
	.ctrl {
		border: 1px solid #e5e7eb;
		border-radius: 0.35rem;
		padding: 0.2rem 0.35rem;
		font-size: 0.82rem;
		background: white;
		max-width: 13rem;
	}
	.primary,
	.ghost {
		border-radius: 0.4rem;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 600;
		margin-top: 0;
	}
	.primary {
		background: #7c3aed;
		color: white;
		border: none;
	}
	.primary:disabled,
	.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.ghost {
		background: white;
		border: 1px solid #e5e7eb;
		color: #374151;
	}
	.cfg-control,
	.steps-control,
	.seed-control,
	.scheduler-control,
	.image-prompt {
		display: flex;
		flex-direction: column;
	}
	.cfg-control input {
		width: 7rem;
	}
	.cfg-control strong {
		font-size: 0.8rem;
		color: #5b21b6;
	}
	.knob-locked {
		font-size: 0.75rem;
		color: #6b7280;
		max-width: 16rem;
	}
</style>
