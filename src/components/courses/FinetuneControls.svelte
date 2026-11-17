<script lang="ts">
	import { locale, messages } from '~/i18n';
	import { FT_TRAIN_LOOP } from '~/courses/finetune/presets';
	import {
		FT_SPINE_STOPS,
		advanceFinetuneMain,
		canAdvanceFinetuneMain,
		canRewindFinetuneMain,
		finetuneBaselineSaved,
		finetuneComparedAfter,
		finetuneExplainStep,
		finetuneRuns,
		finetuneTokenPreview,
		finetuneSpineView,
		finetuneStatus,
		isFinetuneBeatsLevel,
		stepExplain
	} from '~/courses/finetune/store';
	import { finetunePages } from '~/courses/finetune/textbookPages';

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $locale !== 'en';
	$: n = FT_TRAIN_LOOP.length;
	$: beats = isFinetuneBeatsLevel($finetuneSpineView);
	$: _pathDeps = [$finetuneSpineView, $finetuneExplainStep, $finetuneBaselineSaved, $finetuneStatus, $finetuneRuns, $finetuneComparedAfter, $finetuneTokenPreview];
	$: holdFirst =
		$finetuneSpineView === 'see' ||
		($finetuneSpineView === 'preview' && $finetuneTokenPreview.length === 0);
	$: canFwd = holdFirst ? false : beats ? $finetuneExplainStep < n - 1 : canAdvanceFinetuneMain();
	$: canBack = beats ? ($finetuneExplainStep > 0 || canRewindFinetuneMain()) : canRewindFinetuneMain();
	$: beat = FT_TRAIN_LOOP[$finetuneExplainStep] ?? FT_TRAIN_LOOP[0];
	$: stop =
		FT_SPINE_STOPS.find((s) => s.id === ($finetuneSpineView === 'watching' ? 'train' : $finetuneSpineView)) ??
		FT_SPINE_STOPS[0];

	const bump = () => finetunePages.find((p) => p.id === 'infer-vs-train')?.complete();

	const next = () => {
		if (beats) {
			stepExplain(1);
			bump();
			return;
		}
		// Pushes the same line as「现在做这件事」、the spine, and the coach.
		// Never starts a train.
		advanceFinetuneMain(1);
	};
	const back = () => {
		if (beats && $finetuneExplainStep > 0) {
			stepExplain(-1);
			return;
		}
		advanceFinetuneMain(-1);
	};
</script>

<div class="ft-controls">
	<button type="button" class="ft-step-btn" class:primary={!holdFirst} class:ghost={holdFirst} data-te-ft="step" data-te-path-door={holdFirst ? 'held' : 'ready'} on:click={next} disabled={!canFwd}>
		{m.finetuneStep ?? (zh ? '推进一步' : 'Take one step')}
	</button>
	<button type="button" class="ghost" data-te-ft="step-back" on:click={back} disabled={!canBack}>
		{m.finetuneStepBack ?? (zh ? '回退一步' : 'Step back')}
	</button>
	<div class="meta">
		<p class="hint">{zh ? '只讲解，不开训' : 'Explains only — does not train'}</p>
		{#if beats}
			<span class="prog" data-te-ft="explain-prog">
				{zh ? '讲解' : 'Beat'}
				<strong>{$finetuneExplainStep + 1}</strong>
				/ {n}
				· {zh ? beat.titleZh : beat.titleEn}
			</span>
		{:else}
			<span class="prog" data-te-ft="path-prog">{zh ? stop.zh : stop.en}</span>
		{/if}
	</div>
</div>

<style>
	.ft-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem 0.7rem;
		width: 100%;
	}
	.primary,
	.ghost {
		border-radius: 0.4rem;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
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
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 10rem;
	}
	.hint {
		margin: 0;
		font-size: 0.72rem;
		color: #6d28d9;
		font-weight: 700;
		letter-spacing: 0.01em;
	}
	.prog {
		font-size: 0.78rem;
		color: #6b7280;
	}
	.prog strong {
		color: #5b21b6;
	}
</style>
