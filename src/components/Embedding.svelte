<script lang="ts">
	import {
		tokens,
		expandedBlock,
		modelMeta,
		tokenIds,
		blockIdx,
		isExpandOrCollapseRunning,
		textbookCurrentPageId,
		isTextbookOpen,
		userId
	} from '~/store';
	import classNames from 'classnames';
	import { gsap, Flip } from '~/utils/gsap';
	import { tick, setContext, getContext, onMount } from 'svelte';
	import VectorCanvas from './common/VectorCanvas.svelte';
	import * as d3 from 'd3';
	import HelpPopover from './common/HelpPopover.svelte';
	import tailwindConfig from '../../tailwind.config';
	import resolveConfig from 'tailwindcss/resolveConfig';
	import { ga } from '~/utils/event';
	import { Tooltip } from 'flowbite-svelte';
	import { ZoomInOutline } from '~/components/icons';

	import TextbookTooltip from './common/TextbookTooltip.svelte';
	import { messages, showEmbeddingLessonHint, coachLessonIdx, locale } from '~/i18n';
	import {
		TOKEN_CUT_NOTE_ZH,
		TOKEN_CUT_NOTE_EN,
		groupDisplayLabels,
		labelsHaveSplitGroups
	} from '~/utils/gpt2Tokens';
	$: m = $messages;
	$: zhTok = $locale !== 'en';
	$: tokenGroups = groupDisplayLabels($tokens || []);
	$: cutNote = labelsHaveSplitGroups($tokens || []);
	$: cutNoteText = (m as any).tokenCutNote || (zhTok ? TOKEN_CUT_NOTE_ZH : TOKEN_CUT_NOTE_EN);
	let openTokGroup: string | null = null;
	$: if (!cutNote) openTokGroup = null;
	const groupHint = (ch: string, n: number) => {
		const tmpl =
			(m as any).tokenCutGroupHint ||
			(zhTok
				? `「{ch}」被切成 {n} 个更小的片，点开看说明`
				: `“{ch}” was split into {n} smaller pieces. Click to see why.`);
		return String(tmpl).replaceAll('{ch}', ch).replaceAll('{n}', String(n));
	};
	const groupNote = (ch: string, n: number) => {
		const tmpl =
			(m as any).tokenCutGroupNote ||
			(zhTok
				? `「{ch}」被切成 {n} 个更小的片，拼起来才是这个字。单独看每一小片往往不成字，所以这里把同一个字收成一枚。`
				: `“{ch}” was split into {n} smaller pieces that only make this character when put together. Each piece alone is usually unreadable, so the chip shows the assembled character.`);
		return String(tmpl).replaceAll('{ch}', ch).replaceAll('{n}', String(n));
	};
	const toggleTokGroup = (ch: string, ev?: Event) => {
		ev?.stopPropagation?.();
		openTokGroup = openTokGroup === ch ? null : ch;
	};

	import { textPages } from '~/utils/textbookPages';

	const { theme } = resolveConfig(tailwindConfig);

	export let className: string | undefined = undefined;

	setContext('block-id', 'embedding');

	const blockId = getContext('block-id');

	let isEmbeddingExpanded = false;

	// event handling
	$: if ($expandedBlock.id !== blockId && isEmbeddingExpanded) {
		isEmbeddingExpanded = false;
		collapseEmbedding();
	}
	$: if ($expandedBlock.id === blockId && !isEmbeddingExpanded) {
		isEmbeddingExpanded = true;
		expandEmbedding();
	}

	const onClickEmbedding = () => {
		if (!isEmbeddingExpanded) {
			expandedBlock.set({ id: blockId });
		}
	};

	const onClickEmbeddingTitle = (e) => {
		e.stopPropagation();
		e.preventDefault();
		textPages.find((page) => page.id === 'embedding')?.complete();

		if (!isEmbeddingExpanded) {
			expandedBlock.set({ id: blockId });
		} else {
			expandedBlock.set({ id: null });
		}
	};

	let expandableEl: HTMLDivElement;

	function handleOutsideClick(e) {
		if (isEmbeddingExpanded && !expandableEl.contains(e.target)) {
			expandedBlock.set({ id: null });
		}
	}
	onMount(() => {
		document.querySelector('.main-section').addEventListener('click', handleOutsideClick);
		return () => {
			document.querySelector('.main-section').removeEventListener('click', handleOutsideClick);
		};
	});

	// animation
	let containerState: any;

	// google analytics
	let startTime = null;

	const expandEmbedding = async () => {
		if ($coachLessonIdx <= 2) showEmbeddingLessonHint.set(true);
		containerState = Flip.getState('.embedding .token-column');
		isEmbeddingExpanded = true;

		await tick();

		isExpandOrCollapseRunning.set(true);

		Flip.from(containerState, {
			duration: 0.5,
			ease: 'power2.inOut',
			onComplete: () => {
				isExpandOrCollapseRunning.set(false);
			}
		});
		gsap.to('.embedding-detail', {
			opacity: 1,
			duration: 0.5,
			delay: 0.5
		});

		startTime = performance.now();
		window.dataLayer?.push({
			event: 'visibility-show',
			visible_name: 'embedding-expansion',
			start_time: startTime,
			user_id: $userId
		});
	};

	const collapseEmbedding = async () => {
		let endTime = performance.now();
		let visibleDuration = endTime - startTime;

		window.dataLayer?.push({
			event: 'visibility-hide',
			visible_name: 'embedding-expansion',
			end_time: endTime,
			visible_duration: visibleDuration,
			user_id: $userId
		});

		containerState = Flip.getState('.embedding .token-column');
		isEmbeddingExpanded = false;
		await tick();

		isExpandOrCollapseRunning.set(true);

		Flip.from(containerState, {
			duration: 0.5,
			ease: 'power2.inOut',
			onComplete: () => {
				isExpandOrCollapseRunning.set(false);
			}
		});
	};

	let isHovered = false;

	function handleMouseEnter() {
		isHovered = true;
	}

	function handleMouseLeave() {
		isHovered = false;
	}

	const embeddingVectorColor = 'bg-gray-300';
</script>

<div
	class={classNames('embedding', className, {
		expanded: isEmbeddingExpanded,
		'textbook-highlight': $isTextbookOpen && $textbookCurrentPageId === 'transformer-architecture'
	})}
	bind:this={expandableEl}
	role="none"
	on:click={onClickEmbedding}
	on:keydown={onClickEmbedding}
	data-click="embedding-step"
>
	<div
		class="title expandable"
		role="none"
		on:click={onClickEmbeddingTitle}
		on:keydown={onClickEmbeddingTitle}
		on:mouseenter={handleMouseEnter}
		on:mouseleave={handleMouseLeave}
		data-click="embedding-step-title"
	>
		<div class="title-text flex w-max items-center gap-1">
			{m.embedding}
			<ZoomInOutline></ZoomInOutline>
		</div>
	</div>
	<div class="content relative">
		<div class="bounding embedding-bounding" class:active={isHovered && !isEmbeddingExpanded}></div>
		<div class="token-column resizable resize-watch flex">
			<!-- token -->
			<div class="column token-string relative">
				{#if isEmbeddingExpanded}<div class="subtitle embedding-detail">
						<TextbookTooltip id="token-embedding">{m.tokenization}</TextbookTooltip>
					</div>{/if}
				{#each tokenGroups as g}
					{#if g.group && g.items.length > 1}
						{#each g.items as item, k}
							{@const index = item.index}
							{@const token = $tokens[index]}
							<div
								class="cell in-group"
								class:last={index === $tokens.length - 1}
								class:group-start={k === 0}
								class:group-end={k === g.items.length - 1}
								class:group-open={openTokGroup === g.group}
								style={k === 0 ? `--te-tok-n: ${g.items.length}` : undefined}
								data-te-tok-group={g.group}
								data-te-tok-pieces={g.items.length}
							>
								{#if k === 0}
									<button
										type="button"
										class="tok-group-chip"
										class:on={openTokGroup === g.group}
										data-te-tok="group-chip"
										title={groupHint(g.group, g.items.length)}
										on:click={(e) => toggleTokGroup(g.group, e)}
									>
										<span class="ch">{g.group}</span>
										<sup>{g.items.length}</sup>
									</button>
								{/if}
								<span
									class="label piece-idx"
									title={token}
									data-te-tok-label={index}
									data-te-tok-piece={`${item.pieceIndex}/${item.pieceCount}`}
								>{item.pieceIndex}/{item.pieceCount}</span>
							</div>
						{/each}
					{:else}
						{#each g.items as item}
							{@const index = item.index}
							{@const token = $tokens[index]}
							<div class="cell" class:last={index === $tokens.length - 1}>
								<span class="label" title={token} data-te-tok-label={index}>{token}</span>
							</div>
						{/each}
					{/if}
				{/each}
				{#if cutNote}
					<p class="cut-note" data-te-tok="cut-note">{cutNoteText}</p>
				{/if}
				{#if openTokGroup}
					<p class="cut-group-note" data-te-tok="group-note">{groupNote(openTokGroup, tokenGroups.find((x) => x.group === openTokGroup)?.items.length || 0)}</p>
				{/if}
			</div>
			{#if isEmbeddingExpanded}
				<!-- token id and embedding -->
				<div class="column token-embedding embedding-detail">
					<div class="subtitle flex items-center gap-1">
						<TextbookTooltip id="token-embedding"><span>{m.tokenEmbeddingLine1}<br />{m.tokenEmbeddingLine2}</span></TextbookTooltip
						>
						<!-- <HelpPopover
							id="token-embedding"
							goTo="article-token-embedding"
							>{`Converts tokens into numerical \nrepresentations using embeddings \nderived from predefined vocabulary, \ncapturing their semantic meaning.`}</HelpPopover
						> -->
					</div>
					{#each $tokens as token, index}
						<div class="token-id flex items-center">
							<div class="vocab-index ellipsis flex items-center text-right text-xs text-gray-400">
								<div class="flex flex-col items-center">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 31 9"
										fill="none"
										class="w-10 text-gray-300"
									>
										<path
											fill="currentColor"
											d="M30.3886 4.74352C30.5839 4.54826 30.5839 4.23168 30.3886 4.03642L27.2067 0.854435C27.0114 0.659173 26.6948 0.659173 26.4996 0.854435C26.3043 1.0497 26.3043 1.36628 26.4996 1.56154L29.328 4.38997L26.4996 7.2184C26.3043 7.41366 26.3043 7.73024 26.4996 7.9255C26.6948 8.12076 27.0114 8.12076 27.2067 7.9255L30.3886 4.74352ZM0.31958 4.88997H30.0351V3.88997H0.31958V4.88997Z"
										/>
									</svg>
								</div>
							</div>
							<div class="cell flex items-center">
								<div class={`vector ${embeddingVectorColor}`}>
									<VectorCanvas active />
								</div>
								<span class="index-val text-xs">
									{#if index === 0}
										<span class="label">id</span><br />
									{/if}
									<span class="val">{$tokenIds[index]}</span>
								</span>
							</div>
						</div>
					{/each}
				</div>
				<!-- position embedding -->
				<div class="column symbol embedding-detail">
					{#each $tokens as token, index}
						<div class="cell text-lg">+</div>
					{/each}
				</div>
				<div class="column embedding-detail position-embedding">
					<div class="subtitle flex gap-1">
						<TextbookTooltip id="positional-encoding">
							<span>{m.positionalLine1}<br />{m.positionalLine2}</span>
						</TextbookTooltip>
						<!-- <HelpPopover
							id="position-embedding"
							goTo="article-positional-embedding"
							>{`Converts token positions into \nnumerical representations that \ncapture their order in the sequence.`}</HelpPopover
						> -->
					</div>
					{#each $tokens as token, index}
						<div class="cell flex items-center">
							<div class={`vector ${embeddingVectorColor}`}>
								<VectorCanvas
									active
									colorScale={(d, i) => {
										return d3
											.scaleDiverging()
											.domain([0, 0.5, 1])
											.range([theme.colors['red'][400], 'white', theme.colors['blue'][400]])(d);
									}}
								/>
							</div>
							<span class="index-val text-xs">
								{#if index === 0}
									<span class="label">position</span><br />
								{/if}
								<span class="val">{index}</span>
							</span>
						</div>
					{/each}
				</div>
				<div class="column symbol embedding-detail">
					{#each $tokens as token, index}
						<div class="cell">=</div>
					{/each}
				</div>
				<Tooltip triggeredBy=".embedding .vector" class="popover" placement="right"
					>vector({$modelMeta.dimension})</Tooltip
				>
				<!-- <PositionalEncodingPopover triggeredBy=".position-embedding" /> -->
			{/if}
		</div>

		<div class="vector-column block-start-column relative flex">
			<div class="column vectors embedding-column">
				{#each $tokens as token, index}
					<div class={`vector ${embeddingVectorColor}`} class:last={index === $tokens.length - 1}>
						<VectorCanvas active={$blockIdx === 0 && (isHovered || isEmbeddingExpanded)} />
					</div>
				{/each}
			</div>
			<Tooltip triggeredBy=".step.embedding .vector" class="popover" placement="right"
				>vector({$modelMeta.dimension})</Tooltip
			>
		</div>
	</div>
</div>

<style lang="scss">
	.embedding-bounding {
		top: -0.5rem;
		padding: 0.5rem 0;
		left: 2rem;
		width: calc(100% - 2rem);
		height: 100%;
	}
	.embedding {
		&.expanded {
			.title,
			.content {
				z-index: $EXPANDED_CONTENT_INDEX;
			}
			.operations {
				pointer-events: none;
				opacity: 0.2;
			}
		}
		.embedding-detail {
			opacity: 0;
		}
		.title {
			justify-content: end;
			padding-left: 3rem;
			width: 1rem;
			white-space: nowrap;
		}
		.content {
			padding-left: 2rem;
			display: flex;

			.token-column {
				.column {
					padding: 0 1rem;

					.cell {
						justify-content: flex-end;
						gap: 0.5rem;
						text-align: left;
					}
				}
				.symbol {
					font-size: 0.8rem;
					color: theme('colors.gray.400');
				}
			}

			.token-string {
				width: 8.2rem;
				flex-shrink: 0;
			}
			.token-string .label {
				overflow: visible;
				text-overflow: clip;
				white-space: nowrap;
				font-size: 0.82rem;
			}
			.token-string {
				position: relative;
			}
			.cut-note,
			.cut-group-note {
				position: absolute;
				left: 0;
				margin: 0;
				font-size: 0.68rem;
				line-height: 1.35;
				color: #6d28d9;
				max-width: 16.5rem;
				z-index: 5;
			}
			.cut-note {
				bottom: calc(100% + 0.2rem);
			}
			.cut-group-note {
				bottom: calc(100% + 2.55rem);
				background: #f5f3ff;
				border-radius: 0.35rem;
				padding: 0.3rem 0.4rem;
			}
			.cell.in-group {
				position: relative;
			}
			.cell.group-start::before {
				content: '';
				position: absolute;
				left: 0.1rem;
				right: -0.15rem;
				top: -0.12rem;
				height: calc(
					var(--te-tok-n) * var(--vector-height) + (var(--te-tok-n) - 1) * 0.5rem + 0.24rem
				);
				border: 1.5px solid #7c3aed;
				background: #f5f3ff;
				border-radius: 0.4rem;
				z-index: 0;
				pointer-events: none;
			}
			.tok-group-chip {
				position: absolute;
				left: 0.22rem;
				top: calc((var(--te-tok-n) * var(--vector-height) + (var(--te-tok-n) - 1) * 0.5rem) / 2);
				transform: translateY(-50%);
				z-index: 1;
				display: inline-flex;
				align-items: center;
				gap: 0.05rem;
				margin: 0;
				padding: 0.05rem 0.22rem 0.05rem 0.28rem;
				border: none;
				background: transparent;
				color: #1f1633;
				font: inherit;
				font-weight: 700;
				font-size: 0.9rem;
				line-height: 1.1;
				cursor: pointer;
			}
			.tok-group-chip:hover,
			.tok-group-chip.on {
				color: #5b21b6;
			}
			.tok-group-chip sup {
				font-size: 0.62rem;
				font-weight: 700;
				color: #6d28d9;
				line-height: 1;
			}
			.token-string .label.piece-idx {
				position: relative;
				z-index: 1;
				font-size: 0.72rem;
				color: #6d28d9;
				min-width: 1.8rem;
			}

			.subtitle {
				justify-content: center;
				align-items: end;
				line-height: 1.3;
			}
			.index-val .label {
				color: theme('colors.gray.400');
				line-height: 1;
				font-size: 0.8rem;
			}
			.index-val .val {
				width: 4rem;
				text-align: left;
				font-size: 0.7rem;
				color: theme('colors.gray.600');
				font-family: monospace;
			}

			.token-embedding {
				position: relative;
				width: 11rem;

				.vocab-index {
					width: 5rem;
					flex-shrink: 0;
					display: flex;
					justify-content: center;
					overflow: visible;
					padding-right: 1rem;
				}
			}

			.position-embedding {
				.subtitle {
					margin-left: -1rem;
				}
				.cell {
					justify-content: center;
					gap: 0.5rem;
				}
				.index-val {
					width: 2rem;
					justify-content: start;
				}
			}
		}
	}
</style>
