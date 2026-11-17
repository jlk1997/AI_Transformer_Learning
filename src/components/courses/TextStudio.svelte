<script lang="ts">
	import {
		tokens,
		expandedBlock,
		vectorHeight,
		rootRem,
		maxVectorHeight,
		minVectorHeight,
		maxVectorScale,
		headContentHeight,
		isOnBlockTransition,
		blockIdx,
		inputScoreStale,
		isFetchingModel,
		inputText
	} from '~/store';
	import { coachLessonIdx, locale, messages } from '~/i18n';
	import { textPathIdAt } from '~/courses/textPath';
	import Sankey from '~/components/Sankey.svelte';
	import Attention from '~/components/Attention.svelte';
	import SubsequentBlocks from '~/components/SubsequentBlocks.svelte';
	import LinearSoftmax from '~/components/LinearSoftmax.svelte';
	import Embedding from '~/components/Embedding.svelte';
	import Mlp from '~/components/Mlp.svelte';
	import classNames from 'classnames';
	import WeightPopovers from '~/components/WeightPopovers.svelte';
	import { fade } from 'svelte/transition';
	import BlockTransition from '~/components/BlockTransition.svelte';
	import QKV from '~/components/QKV.svelte';
	import TextExplore from '~/components/courses/TextExplore.svelte';
	import { researchDoorOpen, bootResearchDoorHooks } from '~/courses/researchDoor';
	import { bootLabSignals } from '~/courses/labSignals';
	bootLabSignals();
	bootResearchDoorHooks();

	let vizHeight = 0;
	let titleHeight = rootRem * 5;

	const calculateVectorHeight = () => {
		const gaps = rootRem * 0.5 * ($tokens.length - 1);
		const vectorHeightVal = Math.min(
			Math.max((vizHeight - titleHeight - gaps) / $tokens.length / maxVectorScale, minVectorHeight),
			maxVectorHeight
		);
		vectorHeight.set(vectorHeightVal);
		headContentHeight.set(Math.max($tokens.length * vectorHeightVal * 3 + gaps, rootRem * 20));
	};

	$: if (vizHeight || $tokens.length) {
		calculateVectorHeight();
	}

	$: m = $messages;
	$: zh = $locale !== 'en';
	$: scoreStale = $inputScoreStale;
	$: modelLoading = $isFetchingModel;
	$: inputEmpty = !($inputText || '').trim();
	$: pathId = textPathIdAt($coachLessonIdx);
	// First-eye (U-04) and the 词片 station: keep the diagram, but do not name later parts yet.
	$: deferArchNames = pathId === 'generate' || pathId === 'tokens';
	$: archStage = deferArchNames
		? 'deferred'
		: pathId === 'attention'
			? 'attention'
			: pathId === 'layers'
				? 'layers'
				: pathId === 'residual'
					? 'residual'
					: 'named';
</script>

<div
	class="text-studio h-full w-full"
	class:score-stale={scoreStale}
	class:defer-arch-names={deferArchNames}
	class:input-empty={inputEmpty}
	data-te-arch={archStage}
	data-te-path={pathId}
	data-te-diagram={inputEmpty ? 'empty' : 'machine'}
	data-te-diagram-empty={inputEmpty ? '1' : '0'}
	style={`--vector-height: ${$vectorHeight}px;--title-height: ${titleHeight}px;--content-height:${vizHeight - titleHeight}px;--head-content-h:${$headContentHeight}px;`}
	data-te-score={scoreStale ? 'recomputing' : 'current'}
	data-te-score-fetching={modelLoading ? '1' : '0'}
	aria-busy={scoreStale}
>
	{#if $researchDoorOpen}
		<TextExplore />
	{/if}
	{#if !!$expandedBlock.id}
		<div
			class={classNames('dim', `${$expandedBlock.id || ''}`)}
			transition:fade={{ duration: 100 }}
		></div>
		<div
			class={classNames('dim-partial left', `${$expandedBlock.id || ''}`)}
			transition:fade={{ duration: 100 }}
		></div>
		<div
			class={classNames('dim-partial right', `${$expandedBlock.id || ''}`)}
			transition:fade={{ duration: 100 }}
		></div>
	{/if}
	<div
		class="diagram-scroll resize-watch"
		data-te-diagram="scroll"
		bind:clientHeight={vizHeight}
	>
		{#if inputEmpty}
			<div class="diagram-empty" data-te-diagram-frame="empty" aria-hidden="true"></div>
		{:else}
		<div class="diagram-body">
			<div class="sankey opacity-1" class:attention={$expandedBlock.id === 'attention'}>
				<Sankey />
			</div>
			<div class="nodes resize-watch">
				<div class="steps" class:expanded={!!$expandedBlock.id}>
			<Embedding className="step" />
			<div class="blocks relative">
				<div class="block-steps main" class:initial={$blockIdx === 0}>
					<QKV className="step" />
					<Attention className="step" />
					<Mlp className="step" />
				</div>
				<div
					class="block-steps next"
					class:hide={!$isOnBlockTransition}
					class:initial={$blockIdx === 0}
				>
					<QKV className="step" />
					<Attention className="step" />
					<Mlp className="step" />
				</div>
				<div class="transition-watch" class:hide={!$isOnBlockTransition}></div>
			</div>
			<SubsequentBlocks className="step" />
			<LinearSoftmax className="step" />
		</div>
				<WeightPopovers />
				<BlockTransition />
			</div>
		</div>
		{/if}
	</div>
	{#if scoreStale && !inputEmpty}
		<div class="score-recomputing" data-te-score="banner" data-te-score-placement="corner" role="status" aria-live="polite">
			<p class="score-recomputing-title" data-te-score="title">
				{m.inputRescoring || (zh ? '正在按新句子重算' : 'Recomputing for the new sentence')}
			</p>
			<p class="score-recomputing-hint" data-te-score="hint">
				{modelLoading
					? m.inputRescoringLoading ||
						(zh
							? '模型还在下载。下载完成后会按新句子重算。'
							: 'The model is still downloading. It will recompute for the new sentence when the download finishes.')
					: m.inputRescoringHint ||
						(zh
							? '上一帧先留着，这句算完再更新。'
							: 'The last visible frame stays until this sentence is scored.')}
			</p>
		</div>
	{/if}
</div>

<style lang="scss">
	.text-studio {
		position: relative;
	}
	.diagram-empty {
		min-height: 100%;
	}
	/* First-eye + 词片 station: keep the diagram, but do not name the parts yet. */
	.text-studio.defer-arch-names {
		:global([data-click='embedding-step-title']),
		:global([data-click='attention-step-title']),
		:global([data-click='mlp-step-title']),
		:global(.guide-text.dropout-text),
		:global(.guide-text.ln-text),
		:global(.guide-text.residual-text),
		:global(.guide-text.gelu-text),
		:global(.matrix-label),
		:global([data-te-label='more-blocks']),
		:global([data-te-label='more-blocks-arrow']),
		:global([data-te-label='block-title']),
		:global([data-te-label='head-title']),
		:global(.attention .head1.title),
		:global(.qkv .sub-vector span) {
			opacity: 0;
			visibility: hidden;
			pointer-events: none;
		}
	}
	/* Attention station: name attention / head / QKV and the left column already seen.
	   Residual, feed-forward, and the stack of identical blocks still wait. */
	.text-studio[data-te-arch='attention'] {
		:global([data-click='mlp-step-title']),
		:global(.guide-text.dropout-text),
		:global(.guide-text.ln-text),
		:global(.guide-text.residual-text),
		:global(.guide-text.gelu-text),
		:global([data-te-label='more-blocks']),
		:global([data-te-label='more-blocks-arrow']),
		:global([data-te-label='block-title']) {
			opacity: 0;
			visibility: hidden;
			pointer-events: none;
		}
	}
	/* Layers station: block, head, and feed-forward titles are the phenomenon.
	   Residual naming still waits. */
	.text-studio[data-te-arch='layers'] {
		:global(.guide-text.dropout-text),
		:global(.guide-text.ln-text),
		:global(.guide-text.residual-text),
		:global(.guide-text.gelu-text) {
			opacity: 0;
			visibility: hidden;
			pointer-events: none;
		}
	}
	/* After names return, do not park the Phase 1 cut-note on top of 词向量（嵌入）. */
	.text-studio:not(.defer-arch-names) {
		:global(.cut-note),
		:global(.cut-group-note) {
			opacity: 0;
			visibility: hidden;
			pointer-events: none;
		}
	}


	.score-recomputing {
		position: absolute;
		top: 0.55rem;
		right: 0.7rem;
		left: auto;
		bottom: auto;
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.12rem;
		max-width: min(16.5rem, calc(100% - 1.4rem));
		padding: 0.35rem 0.55rem;
		background: rgba(255, 255, 255, 0.94);
		border: 1px solid #ddd6fe;
		border-radius: 0.45rem;
		box-shadow: 0 4px 12px rgba(76, 29, 149, 0.12);
		text-align: right;
		pointer-events: none;
	}
	.score-recomputing-title {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 700;
		color: #5b21b6;
		line-height: 1.3;
	}
	.score-recomputing-hint {
		margin: 0;
		max-width: 16.5rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: #4b5563;
	}
	.main-section {
		opacity: 0;
		&.active {
			opacity: 1;
		}
	}
	.course-stage {
		position: relative;
		height: calc(100% - var(--te-guide-h, 0px));
		width: 100%;
		overflow: auto;
		background: #fafafa;
		box-sizing: border-box;
	}
	.diagram-scroll {
		position: relative;
		height: calc(100% - var(--te-guide-h, 0px));
		width: 100%;
		overflow-x: hidden;
		overflow-y: auto;
		box-sizing: border-box;
		overscroll-behavior: contain;
	}
	.diagram-body {
		position: relative;
		min-height: 100%;
		width: 100%;
		height: max-content;
	}
	.nodes {
		min-height: 100%;
		height: auto;
		width: 100%;
		padding: 1rem 0 1.25rem 0;
		position: relative;
		box-sizing: border-box;
	}
	.steps {
		position: relative;
		width: 100%;
		min-height: 100%;
		height: max(100%, calc(var(--title-height) + var(--head-content-h, 20rem) + 1.5rem));
		position: relative;
		display: grid;
		grid-template-columns: auto 3.5fr minmax(0, 0.5fr) minmax(0, 0.5fr);

		&.expanded {
			:global(.step > .title) {
				padding-bottom: 3rem;
			}
		}

		.blocks {
			position: relative;
			width: 100%;
			height: 100%;

			.block-steps {
				height: 100%;
				width: 100%;
				position: absolute;
				display: grid;
				grid-template-columns: 0.5fr 2fr 1fr;
			}
			.block-steps.main {
				transform-origin: 3rem center;
				top: 0;
				left: 0;
			}
			.block-steps.next {
				transform-origin: right center;
				justify-content: end;
				top: 0;
				right: 0;
				pointer-events: none;
			}

			.transition-watch {
				position: absolute;
				top: 0;
				left: 0;
				height: 100%;
				width: 100%;
				pointer-events: none;
			}

			.hide {
				display: none;
			}
			&.animate-forward {
				.block-steps,
				.transition-watch {
					animation-duration: 800ms;
					animation-timing-function: ease-in;
				}
				.block-steps.main {
					animation-name: collapse;
					&.initial {
						transform-origin: left center;
					}
				}
				.block-steps.next {
					animation-name: expand;
				}
				.transition-watch {
					animation-name: width-collapse;
				}
			}

			&.animate-backward {
				.block-steps,
				.transition-watch {
					animation-duration: 800ms;
					animation-timing-function: ease-in;
				}
				.block-steps.main {
					animation-name: expand;
					&.initial {
						transform-origin: left center;
					}
				}
				.block-steps.next {
					animation-name: collapse;
				}
				.transition-watch {
					animation-name: width-collapse;
				}
			}
		}
	}
	@keyframes width-collapse {
		0% {
			width: 100%;
		}
		100% {
			width: 0%;
		}
	}
	@keyframes expand {
		0% {
			transform: scaleX(0);
		}
		100% {
			transform: scaleX(1);
		}
	}
	@keyframes collapse {
		0% {
			transform: scaleX(1);
		}
		100% {
			transform: scaleX(0);
		}
	}

	:global(.step) {
		height: 100%;
		display: grid;
		grid-template-rows: var(--title-height) 1fr;
	}
	:global(.step.softmax) {
		min-width: 0;
		width: 100%;
		max-width: 100%;
		min-height: 0;
		overflow: visible;
		position: relative;
		justify-self: stretch;
	}
	:global(.step.softmax > .content) {
		height: 100%;
		max-height: 100%;
		min-height: 0;
		min-width: 0;
		width: 100%;
		max-width: 100%;
		overflow: visible;
	}

	:global(.step > .title) {
		z-index: $COLUMN_TITLE_INDEX;
		display: flex;
		flex-direction: column;
		justify-content: end;
		grid-row: 1;
		color: theme('colors.gray.400');
		white-space: nowrap;
		padding-bottom: 2rem;
		overflow: visible;
		min-width: 0;
		transition: all 0.5s;
		cursor: default;

		&:hover {
			color: theme('colors.gray.600');
		}
	}

	:global(.step > .title.expandable) {
		cursor: pointer;
	}

	:global(.step .content) {
		grid-row: 2;
		height: fit-content;
	}

	:global(.column) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		position: relative;

		:global(.cell) {
			height: var(--vector-height);
			display: flex;
			gap: 1rem;
			align-items: center;
			position: relative;
		}

		:global(.subtitle) {
			position: absolute;
			top: 0;
			transform: translateY(calc(-100% - 1rem));
			text-align: center;
			font-size: 0.8rem;
			color: theme('colors.gray.400');
			width: 100%;
			z-index: $COLUMN_TITLE_INDEX;
		}
	}

	:global(.vector),
	:global(.sub-vector) {
		position: relative;
		z-index: $VECTOR_INDEX;
		width: 12px;
		height: var(--vector-height);
		flex-shrink: 0;
		justify-content: start;
	}
	:global(.cell.x1-12),
	:global(.vector.x1-12),
	:global(.sub-vector.x1-12) {
		height: calc(var(--vector-height) / 12);
	}

	:global(.cell.x3),
	:global(.vector.x3),
	:global(.sub-vector.x3) {
		height: calc(var(--vector-height) * 3);
	}
	:global(.cell.x4),
	:global(.vector.x4),
	:global(.sub-vector.x4) {
		height: calc(var(--vector-height) * 3.1);
	}

	:global(.vector.vocab),
	:global(.sub-vector.vocab) {
		height: 100%;
		width: 0;
	}

	:global(.sub-vector.head-rest) {
		flex: 1 0 0;
	}

	:global(.label) {
		font-size: 0.9rem;
		color: theme('colors.gray.700');
		z-index: $VECTOR_INDEX;
		display: inline;
		max-width: 7rem;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: right;
		line-height: var(--vector-height);
		height: var(--vector-height);
		flex-shrink: 0;
	}
	:global(.label.float) {
		position: absolute;
		left: -0.8rem;
		transform: translateX(-100%);
		overflow: visible;
		text-overflow: clip;
		max-width: none;
		width: max-content;
		min-width: 1.75rem;
		padding: 0 0.16rem;
		white-space: nowrap;
		box-sizing: content-box;
		height: auto;
		line-height: 1.15;
	}
	:global(.step.attention),
	:global(.step.attention .content),
	:global(.step.attention .heads),
	:global(.step.attention .qkv),
	:global(.step.attention .cell),
	:global(.multi-head),
	:global(.head-content) {
		overflow: visible;
	}
	:global(.label.float-right) {
		position: absolute;
		left: -0.8rem;
	}

	:global(.ellipsis) {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global(.bounding) {
		position: absolute;
		box-sizing: content-box;
		top: -0.5rem;
		padding: 0.5rem 0;
		left: 0;
		height: 100%;
		border: 2px dashed theme('colors.gray.300');
		border-radius: 0.5rem;
		transition: opacity 0.5s;
		opacity: 0;
		pointer-events: none;
	}
	:global(.bounding.active) {
		opacity: 0.8;
	}

	:global(.popover) {
		z-index: $POPOVER_INDEX;
		width: max-content;
	}

	:global(.tooltip) {
		z-index: $TOOLTIP_INDEX;
		background-color: white !important;
		color: theme('colors.gray.600') !important;
		border: 1px solid theme('colors.gray.200') !important;
		padding: 0.2rem 0.5rem !important;
		font-size: 0.8rem !important;
		white-space: nowrap;
		font-weight: 300 !important;
		border-color: theme('colors.gray.200') !important;
	}
	.dim {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: $DIM_INDEX;
		background-color: white;
		opacity: 0.7;
		user-select: none;

		&.attention {
			z-index: 0;
		}
	}
	.dim-partial {
		user-select: none;
		z-index: $PARTIAL_DIM_INDEX;
		position: absolute;
		top: 0;
		height: 100%;

		&.right {
			right: 0;
			background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 1) 80%);
		}
		&.left {
			left: 0;
			background: linear-gradient(-90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 1) 80%);
		}

		&.embedding {
			&.left {
				display: none;
			}
			&.right {
				width: 60%;
			}
		}
		&.attention {
			&.left {
				width: 20%;
			}
			&.right {
				width: 20%;
			}
		}
		&.softmax {
			&.left {
				width: 60%;
			}
			&.right {
				display: none;
			}
		}
	}
	.sankey {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;

		&.attention {
			:global(.sankey-top) {
				z-index: $EXPANDED_ATTENTION_INDEX !important;
				pointer-events: none;
			}
			// :global(.sankey-top > g) {
			// 	opacity: 0.3;
			// }
			// :global(.sankey-top > g.attention) {
			// 	opacity: 1;
			// }
		}
	}

	:global(svg g.path-group) {
		transition: opacity 0.5s;
	}
	:global(div.step > div) {
		transition: opacity 0.5s;
	}
	:global(div.step .column) {
		transition: opacity 0.5s;
	}
</style>
