<script lang="ts">
	import { onDestroy } from 'svelte';
	import { locale, coachLessonIdx, coachVisible, mathWalkExpanded } from '~/i18n';
	import { modelData, tokens, attentionHeadIdx, blockIdx, highlightedToken, temperature, isFetchingModel, sampling, inputScoreStale, inputText, scoredInputText, textHasDrawnWord, textLastDrawnWord } from '~/store';
	import { course, courseContrastOpen } from '~/store/course';
	import {
		imageKnobsUnlocked,
		musicKnobsUnlocked,
		samplingUnlocked,
		textPathDone
	} from '~/store/beginnerPath';
	import { imageStep, imageSteps } from '~/courses/image/store';
	import { MUSIC_EXAMPLES } from '~/courses/music/melodies';
	import { nextDistributions, pitchName } from '~/courses/music/model';
	import { isBridgeSentence } from '~/courses/bridge';
	import {
		musicExampleIdx,
		musicModeOverride,
		musicNotes,
		musicSampling,
		musicTemp
	} from '~/courses/music/store';
	import MathWalkCard from './MathWalkCard.svelte';
	import { mathWalkRequest, tutorPanelOpen } from '~/tutor/store';
	import {
		buildAttnCard,
		buildLayersCard,
		buildMaskCard,
		buildCfgCard,
		buildCutCard,
		buildDenoiseCard,
		buildForwardCard,
		buildNextWordCard,
		buildMusicProbCard,
		buildCutoffCard,
		buildLmHeadCard,
		buildProbCard,
		buildResidualCard,
		buildTempCard,
		defaultImageMathId,
		defaultMusicMathId,
		defaultTextMathId,
		musicTempWalkUnlocked,
		textMathUnlocked,
		textTempWalkUnlocked,
		type MathCardId,
		type MathCardModel
	} from '~/courses/mathWalk';

	$: zh = $locale !== 'en';
	$: c = $course;

	$: musicEx = MUSIC_EXAMPLES[$musicExampleIdx] ?? MUSIC_EXAMPLES[0];
	$: musicDist = c === 'music' ? nextDistributions(musicEx, $musicNotes, $musicTemp, $musicSampling, $musicModeOverride ?? undefined) : null;
	$: musicGenerated = c === 'music' && ($musicNotes?.length || 0) > (musicEx?.notes?.length || 0);
	$: lastMusicNote = musicGenerated && $musicNotes?.length
		? pitchName($musicNotes[$musicNotes.length - 1]?.pitch)
		: '';
	$: textOpts = {
		hasDrawnWord: !!$textHasDrawnWord,
		chineseCut: c === 'text' && isBridgeSentence($inputText)
	};

	// If the percentage walk opened while scores were unreadable, keep that
	// walk until the station changes. Do not auto-swap in full softmax mid-read
	// when the 600MB model later becomes ready.
	let pendingPinKey = '';
	let pendingPinCard: MathCardModel | null = null;
	let pendingWalk: string | null = null;
	let holdForTutor = false;
	$: stationPinKey = `${c}-${$coachLessonIdx}`;
	let pendingAttnPin: MathCardModel | null = null;
	let layerBaseBlock = 0;
	let layerBaseHead = 0;
	let cardOpen = false;
	$: if (stationPinKey !== pendingPinKey) {
		pendingPinKey = stationPinKey;
		pendingPinCard = null;
		pendingAttnPin = null;
		layerBaseBlock = $blockIdx ?? 0;
		layerBaseHead = $attentionHeadIdx ?? 0;
		holdForTutor = false;
		pendingWalk = null;
		// A walk the student opened on the previous station must not stay
		// covering 「换层和头」, residual, or the sampling knobs.
		cardOpen = false;
	}

	// List store reads in this statement so the card list updates when the path, course, or numbers change.
	$: scoreStale = $inputScoreStale;
	$: cards = collectCards(
		zh,
		c,
		$coachLessonIdx,
		$textPathDone,
		$modelData,
		$tokens,
		$blockIdx,
		$attentionHeadIdx,
		$highlightedToken,
		$samplingUnlocked,
		$temperature,
		$imageStep,
		$imageSteps,
		$imageKnobsUnlocked,
		$musicNotes,
		$musicTemp,
		$musicSampling,
		$musicModeOverride,
		$musicExampleIdx,
		$musicKnobsUnlocked,
		$isFetchingModel,
		$sampling,
		scoreStale,
		$textHasDrawnWord,
		$textLastDrawnWord,
		$inputText,
		$scoredInputText,
		lastMusicNote
	);

	function collectCards(_isZh: boolean, ..._deps: any[]): MathCardModel[] {
		const isZh = zh;
		const out: MathCardModel[] = [];
		if (c === 'text') {
			const idx = $coachLessonIdx;
			const done = $textPathDone;
			const stale = !!scoreStale;
			const opts = textOpts;
			if (textMathUnlocked('nextWord', idx, done, opts)) {
				out.push(
					buildNextWordCard($tokens || [], {
						zh: isZh,
						stale,
						word: $textLastDrawnWord || undefined,
						live: $inputText,
						scored: $scoredInputText
					})
				);
			}
			if (textMathUnlocked('cut', idx, done, opts)) {
				out.push(buildCutCard($tokens || [], { zh: isZh, stale }));
			}
			if (textMathUnlocked('prob', idx, done, opts)) {
				const p = buildProbCard(($modelData as any)?.probabilities || [], {
					zh: isZh,
					knobsOn: $samplingUnlocked,
					temperature: $temperature,
					stale
				});
				if (p) {
					// Pin only unreadable-score walks, never a stale-sentence walk.
					if (!stale && p.scale === 'pending') pendingPinCard = p;
					out.push(!stale && pendingPinCard && pendingPinCard.scale === 'pending' ? pendingPinCard : p);
				}
			}
			if (textMathUnlocked('lmhead', idx, done, opts)) {
				const lcard = buildLmHeadCard(($modelData as any)?.probabilities || [], { zh: isZh, stale });
				if (lcard) out.push(lcard);
			}
			if (textMathUnlocked('attn', idx, done, opts)) {
				const b = $blockIdx ?? 0;
				const h = $attentionHeadIdx ?? 0;
				const data = $modelData as any;
				const fetching = $isFetchingModel;
				const matrix =
					data?.outputs?.[`block_${b}_attn_head_${h}_attn_dropout`]?.data ||
					data?.outputs?.[`block_${b}_attn_head_${h}_attn`]?.data;
				const ht = $highlightedToken as any;
				const last = ($tokens?.length || 1) - 1;
				const q =
					typeof ht?.index === 'number'
						? ht.index
						: typeof ht?.idx === 'number'
							? ht.idx
							: last;
				// If the model is still downloading and this row has no usable weights, pass no matrix
				// so the walk stays honest and does not invent percentages.
				const row = Array.isArray(matrix?.[q]) ? matrix[q] : [];
				const sumReal = (row || []).slice(0, q + 1).reduce((a: number, x: number) => a + (Number(x) > 0 ? Number(x) : 0), 0);
				const usable = Boolean(matrix) && sumReal > 0.5;
				const a = buildAttnCard($tokens || [], stale ? undefined : usable ? matrix : undefined, {
					zh: isZh,
					queryIndex: q,
					block: b,
					head: h,
					stale
				});
				if (a) {
					if (!stale && a.scale === 'pending') pendingAttnPin = a;
					out.push(!stale && pendingAttnPin && pendingAttnPin.scale === 'pending' ? pendingAttnPin : a);
				}
				void fetching;
				if (textMathUnlocked('mask', idx, done, opts)) {
					const mcard = buildMaskCard($tokens || [], stale ? undefined : usable ? matrix : undefined, {
						zh: isZh,
						queryIndex: q,
						block: b,
						head: h,
						stale
					});
					if (mcard) out.push(mcard);
				}
				if (textMathUnlocked('layers', idx, done, opts)) {
					const lcard = buildLayersCard($tokens || [], stale ? undefined : usable ? matrix : undefined, {
						zh: isZh,
						queryIndex: q,
						block: b,
						head: h,
						fromBlock: layerBaseBlock,
						fromHead: layerBaseHead,
						stale
					});
					if (lcard) out.push(lcard);
				}
			}
			if (textMathUnlocked('residual', idx, done, opts)) out.push(buildResidualCard(isZh));
			if (textTempWalkUnlocked(idx, done, $samplingUnlocked)) {
				const tcard = buildTempCard(($modelData as any)?.probabilities || [], {
					zh: isZh,
					temperature: $temperature,
					domain: 'text',
					stale
				});
				if (tcard) out.push(tcard);
				const kept = (($modelData as any)?.probabilities || []).filter((r: any) => Number(r?.probability) > 0).length;
				const ccard = buildCutoffCard(($modelData as any)?.probabilities || [], {
					zh: isZh,
					domain: 'text',
					samplingType: $sampling?.type,
					samplingValue: $sampling?.value,
					keptCount: kept,
					stale
				});
				if (ccard) out.push(ccard);
			}
		} else if (c === 'image') {
			if ($imageStep > 0) out.push(buildDenoiseCard(isZh, $imageStep));
			if ($imageStep > 0) {
				const fcard = buildForwardCard(isZh, $imageStep, $imageSteps);
				if (fcard) out.push(fcard);
			}
			if ($imageKnobsUnlocked && $imageStep > 0) out.push(buildCfgCard(isZh));
		} else if (c === 'music' && (musicGenerated || $coachLessonIdx >= 2 || $musicKnobsUnlocked)) {
			const m = buildMusicProbCard(musicDist?.pitchProbs || [], {
				zh: isZh,
				knobsOn: $musicKnobsUnlocked,
				lastNote: lastMusicNote
			});
			if (m) out.push(m);
			if (musicTempWalkUnlocked($coachLessonIdx, $musicKnobsUnlocked)) {
				const tcard = buildTempCard(musicDist?.pitchProbs || [], {
					zh: isZh,
					temperature: $musicTemp,
					domain: 'music'
				});
				if (tcard) out.push(tcard);
				const rows = musicDist?.pitchProbs || [];
				const kept = rows.filter((r: any) => Number(r?.prob) > 0).length;
				const ccard = buildCutoffCard(rows, {
					zh: isZh,
					domain: 'music',
					samplingType: $musicSampling?.type,
					samplingValue: $musicSampling?.value,
					keptCount: kept
				});
				if (ccard) out.push(ccard);
			}
		}
		const preferred =
			c === 'text'
				? defaultTextMathId($coachLessonIdx, $textPathDone, $samplingUnlocked, textOpts)
				: c === 'image'
					? defaultImageMathId($coachLessonIdx, $imageStep, $imageKnobsUnlocked)
					: c === 'music'
						? defaultMusicMathId($coachLessonIdx, musicGenerated || $coachLessonIdx >= 2, $musicKnobsUnlocked)
						: null;
		if (preferred) {
			const i = out.findIndex((x) => x.id === preferred);
			if (i > 0) {
				const [hit] = out.splice(i, 1);
				out.unshift(hit);
			}
		}
		return out;
	}

	$: autoId =
		c === 'text'
			? defaultTextMathId($coachLessonIdx, $textPathDone, $samplingUnlocked, textOpts)
			: c === 'image'
				? defaultImageMathId($coachLessonIdx, $imageStep, $imageKnobsUnlocked)
				: c === 'music'
					? defaultMusicMathId($coachLessonIdx, musicGenerated || $coachLessonIdx >= 2, $musicKnobsUnlocked)
					: null;

	let tab: MathCardId | null = null;
	let lastAuto: MathCardId | null | undefined = undefined;
	$: if (autoId !== lastAuto) {
		lastAuto = autoId;
		tab = autoId;
	}
	$: if (cards.length && tab && !cards.some((x) => x.id === tab)) {
		tab = cards[0].id;
	}
	$: if (cards.length === 1) tab = cards[0].id;

	$: shown = cards.filter((card) => (cards.length === 1 ? true : card.id === (tab ?? cards[0]?.id)));
	$: remountKey = `${c}-${$coachLessonIdx}-${autoId ?? 'none'}-${shown[0]?.id ?? 'x'}`;
	$: dockLow = !$coachVisible;

	// Keep a walk request until the card list is ready, even if the tutor is open.
	$: if ($mathWalkRequest) {
		pendingWalk = String($mathWalkRequest);
		mathWalkRequest.set(null);
	}
	$: if (pendingWalk && !$courseContrastOpen && cards.some((x) => x.id === pendingWalk)) {
		tab = pendingWalk as MathCardId;
		cardOpen = true;
		holdForTutor = true;
		pendingWalk = null;
	}
	// Do not collapse a walk the agent just opened just because the tutor panel is open.
	$: if ($tutorPanelOpen && cardOpen && !holdForTutor && !pendingWalk) cardOpen = false;
	$: if (holdForTutor && !cards.length) holdForTutor = false;
	let lastShownId: string | null | undefined = undefined;
	$: if ((shown[0]?.id ?? null) !== lastShownId) {
		lastShownId = shown[0]?.id ?? null;
		if (holdForTutor || pendingWalk) {
			// Keep a walk the student or tutor just asked to open.
		} else if (!$tutorPanelOpen && !$courseContrastOpen) {
			// Text never auto-expands (one idea at a time). Image and music may
			// auto-open their default walk after the first-eye station, but the
			// door stays optional (collapsed) on idx 0 after the first phenomenon.
			if (c !== 'text' && $coachLessonIdx > 0) cardOpen = !!(autoId && shown[0]?.id === autoId);
		}
	}
	$: mathWalkExpanded.set(!!(cards.length && cardOpen));
	$: overContrast = $courseContrastOpen && cards.length > 0;
	$: if (typeof document !== 'undefined') {
		document.body.classList.toggle('te-has-math-dock', cards.length > 0);
	}
	onDestroy(() => {
		mathWalkExpanded.set(false);
		if (typeof document !== 'undefined') document.body.classList.remove('te-has-math-dock');
	});
</script>

{#if cards.length && !$courseContrastOpen && (!$tutorPanelOpen || holdForTutor || pendingWalk)}
	<aside
		class="math-dock"
		class:low={dockLow}
		class:over-contrast={overContrast}
		class:with-tutor={$tutorPanelOpen}
		data-te-math="dock"
		data-te-math-default={autoId ?? ''}
		data-te-math-current={tab ?? shown[0]?.id ?? ''}
		data-te-math-open={cardOpen ? '1' : '0'}
		data-te-math-stale={scoreStale ? '1' : '0'}
		data-te-math-phenom={autoId ?? shown[0]?.id ?? ''}
		aria-label={zh ? '看见这一步怎么算' : 'See how this step is calculated'}
	>
		{#if cards.length > 1}
			<div class="tabs" role="tablist">
				{#each cards as card}
					<button
						type="button"
						role="tab"
						class:on={tab === card.id}
						data-te-math-tab={card.id}
						on:click={() => (tab = card.id)}>{card.title}</button
					>
				{/each}
			</div>
		{/if}
		{#key remountKey}
			{#each shown as card (card.id)}
				<MathWalkCard {card} {zh} bind:open={cardOpen} />
			{/each}
		{/key}
	</aside>
{/if}

<style>
	.math-dock {
		position: relative;
		z-index: 1;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		max-height: min(32vh, 16rem);
		overflow: auto;
	}
	.math-dock.with-tutor {
		max-height: min(20vh, 10rem);
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.tabs button {
		border: 1px solid #ddd6fe;
		background: white;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.15rem 0.55rem;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.tabs button.on {
		background: #7c3aed;
		color: white;
		border-color: #7c3aed;
	}
</style>
