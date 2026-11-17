<script lang="ts">
	import { Dropdown, DropdownItem, ButtonGroup } from 'flowbite-svelte';
	import Temperature from './Temperature.svelte';
	import { get } from 'svelte/store';
	import { onDestroy, tick } from 'svelte';

	import { ChevronDownOutline } from '~/components/icons';
	import {
		inputText,
		isModelRunning,
		predictedToken,
		inputTextExample,
		isFetchingModel,
		expandedBlock,
		selectedExampleIdx,
		isLoaded,
		isOnAnimation,
		isMobile,
		weightPopover,
		sampling,
		attentionHeadIdx,
		blockIdx,
		temperature,
		tokenIds,
		userId,
		textHasDrawnWord,
		textLastDrawnWord,
		textProbLiveHandoff,
		scoredInputText,
		draftInputText
	} from '~/store';
	import LoadingDots from './common/LoadingDots.svelte';
	import classNames from 'classnames';
	import Sampling from './Sampling.svelte';
	import { completeCurrentAnimation } from '~/utils/animation';
	import { textPages } from '~/utils/textbookPages';
	import { locale, messages } from '~/i18n';
	import { samplingOpen, samplingUnlocked, samplingLockedHint, requestShowSampling, textPathDone } from '~/store/beginnerPath';
	import { textPathBack, useChineseExample } from '~/courses/textPath';
	import { coachLessonIdx } from '~/i18n';
	import { goToFinetuneFromText, isBridgeSentence } from '~/courses/bridge';
	import LoraContrastBar from '~/components/LoraContrastBar.svelte';
	import { exitLoraContrast, isLoraContrastActive } from '~/courses/loraContrast';
	import { formatTokenForDisplay, isPunctOrBreakToken, tokenTextForCommit } from '~/utils/gpt2Tokens';
	$: m = $messages;
	$: zh = $locale !== 'en';
	$: onBridgeSentence = isBridgeSentence($inputText);

	let inputRef: HTMLDivElement;
	let predictRef: HTMLDivElement;

	let useCustomInput = false;
	$: if ($selectedExampleIdx === 5 && onBridgeSentence) {
		useCustomInput = false;
	}
	let stayEditableAfterClear = false;
	let syncTimer: ReturnType<typeof setTimeout> | null = null;

	$: inputTextTemp = $inputText || '';
	$: draftInputText.set(inputTextTemp ?? '');

	$: predictedTokenTemp = $predictedToken?.token || '';

	// Keep the visible box in sync when another view pins the text (LoRA contrast / hash).
	$: if (typeof document !== 'undefined' && inputRef && document.activeElement !== inputRef) {
		const next = $inputText || '';
		if (inputRef.innerText !== next) {
			inputTextTemp = next;
			inputRef.innerText = next;
		}
	}

	$: predictionFresh =
		(inputTextTemp || '').trim() === ($scoredInputText || '').trim() &&
		!!(predictedTokenTemp || $predictedToken?.token);
	$: pendingToken =
		predictionFresh && !!(inputTextTemp || '').trim()
			? predictedTokenTemp || $predictedToken?.token || ''
			: '';
	$: pendingDisplay = pendingToken ? formatTokenForDisplay(pendingToken, zh) : '';
	$: pendingIsPunct = !!pendingToken && isPunctOrBreakToken(pendingToken);

	const wordLimit = 12;
	$: exceedLimit = inputTextTemp.split(' ').length >= wordLimit;

	const clearSyncTimer = () => {
		if (syncTimer) {
			clearTimeout(syncTimer);
			syncTimer = null;
		}
	};

	const publishInput = (text: string) => {
		const next = text ?? '';
		if (get(inputText) === next) return;
		inputText.set(next);
	};

	const schedulePublishInput = () => {
		clearSyncTimer();
		syncTimer = setTimeout(() => {
			syncTimer = null;
			publishInput(inputTextTemp);
		}, 350);
	};

	onDestroy(clearSyncTimer);

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	const waitForFreshPrediction = async (text: string, timeoutMs = 20000) => {
		const target = (text || '').trim();
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			const scored = (get(scoredInputText) || '').trim();
			const running = get(isModelRunning);
			const pred = get(predictedToken);
			if (scored === target && !running && pred && pred.token != null && String(pred.token) !== '') {
				return pred;
			}
			await sleep(50);
		}
		return null;
	};

	// Text input
	const commitPreviewIntoInput = () => {
		const pred = tokenTextForCommit(predictedTokenTemp || $predictedToken?.token || '');
		let formattedString = (inputTextTemp + pred).replace(/[\s\n]+/g, ' ');
		inputTextTemp = formattedString;
		predictedTokenTemp = '';
		if (inputRef) inputRef.innerText = inputTextTemp;
	};

	const onFocusInput = (e) => {
		// Keep the committed sentence and the next-word preview apart (F-12).
		// Focusing the box must not pour the preview into the same input run.
		if (inputRef && document.activeElement !== inputRef) {
			/* no-op; contenteditable focus only */
		}
	};

	const onInput = (e) => {
		inputTextTemp = inputRef.innerText;
		useCustomInput = true;
		schedulePublishInput();
	};

	const handleSubmit = (e) => {
		e?.preventDefault?.();
		// Complete any running animation before starting new generation
		completeCurrentAnimation();

		setTimeout(() => {
			void (async () => {
				clearSyncTimer();
				const typed = inputRef ? inputRef.innerText : inputTextTemp;
				inputTextTemp = typed;
				if ((typed || '').trim() !== (get(inputText) || '').trim()) {
					publishInput(typed);
				}
				const fresh = await waitForFreshPrediction(typed);
				if (!fresh) {
					// Do not glue on a leftover token from a previous sentence.
					publishInput(typed);
					if (inputRef) inputRef.innerText = typed;
					return;
				}
				predictedTokenTemp = fresh.token || '';
				commitPreviewIntoInput();
				textLastDrawnWord.set(String(fresh.token || ''));
				textHasDrawnWord.set(true);
				textProbLiveHandoff.set(false);
				textPages.find((page) => page.id === 'how-transformers-work')?.complete();

				inputText.set(inputTextTemp);

				window.dataLayer?.push({
					event: 'generate-next-token',
					attn_head_num: $attentionHeadIdx,
					transformer_block_num: $blockIdx,
					sampling_type: $sampling.type,
					sampling_value: $sampling.value,
					temperature_value: $temperature,
					current_token_length: $tokenIds.length,
					input_word_count: inputTextTemp
						.trim()
						.split(/\s+/)
						.filter((word) => word.length > 0).length,
					use_custom_input: useCustomInput,
					user_id: $userId
				});
			})();
		}, 0);
	};

	const handleKeyDown = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (disabled || exceedLimit) return;
			handleSubmit(e);
			return;
		}
		useCustomInput = true;
	};

	// Example select box
	let dropdownOpen = false;
	const onSelectExample = (d, i) => {
		if ($isFetchingModel) {
			textPages.find((page) => page.id === 'how-transformers-work')?.complete();
		}

		dropdownOpen = false;

		if (i !== 5 && isLoraContrastActive()) exitLoraContrast();
		selectedExampleIdx.set(i);
		predictedTokenTemp = '';
		clearSyncTimer();

		inputTextTemp = d;
		inputRef.innerText = inputTextTemp;
		textHasDrawnWord.set(false);
		textLastDrawnWord.set('');
		inputText.update((prev) => {
			if (prev === d.trim()) {
				return d + ' ';
			}
			return d.trim();
		});
		useCustomInput = false;
	};

	const moveCursorToEnd = (element) => {
		const range = document.createRange();
		const sel = window.getSelection();
		range.selectNodeContents(element);
		range.collapse(false);
		sel.removeAllRanges();
		sel.addRange(range);
		element.focus();
	};

	$: isLoading = $isFetchingModel || $isModelRunning;
	$: hasCachedExample = !useCustomInput && $selectedExampleIdx >= 0 && $selectedExampleIdx <= 4;
	$: disabled =
		($isFetchingModel && !hasCachedExample && !!(inputTextTemp || '').trim()) ||
		// $isModelRunning ||
		$expandedBlock.id !== null ||
		!!$weightPopover;
	$: selectDisabled = $isModelRunning || $expandedBlock.id !== null || !!$weightPopover;
	$: parameterDisabled = !!$weightPopover;
	$: knobsVisible = $samplingUnlocked && $samplingOpen;
	$: pathIdx = $coachLessonIdx;
	$: textFirstStop = pathIdx === 0;
	// Filled only while the now-do is still “guess a word”. After the first
	// word, and on later stations (看切开 / 推进一步), this door recedes.
	$: generateHeld = !textFirstStop || $textHasDrawnWord;
	const onShowKnobs = () => {
		requestShowSampling();
	};
	$: knobLockedMsg = $samplingLockedHint
		? m.samplingLocked || (zh ? '还没走到这一步，先看它怎么抽一个词。' : 'This step is not unlocked yet. First watch how it draws a word.')
		: '';
	$: showFtBridge = $textPathDone || pathIdx >= 6;

	$: fieldHasContent = !!(inputTextTemp || '').trim();
	const clearInputField = (e?: Event) => {
		e?.preventDefault?.();
		e?.stopPropagation?.();
		stayEditableAfterClear = true;
		clearSyncTimer();
		inputTextTemp = '';
		predictedTokenTemp = '';
		if (inputRef) inputRef.innerText = '';
		textHasDrawnWord.set(false);
		textLastDrawnWord.set('');
		if (get(coachLessonIdx) !== 0) coachLessonIdx.set(0);
		if (get(samplingOpen)) samplingOpen.set(false);
		publishInput('');
		useCustomInput = true;
		const focusBox = () => {
			const el = inputRef;
			if (!el) return;
			try {
				el.focus();
				moveCursorToEnd(el);
			} catch {
				try {
					el.focus();
				} catch {
					/* ignore */
				}
			}
		};
		// The 清空 control unmounts when the field is empty; also, a still-
		// downloading model would otherwise lock contenteditable. Wait for
		// that update, then put the caret back in the box.
		void tick().then(focusBox);
		setTimeout(focusBox, 0);
		setTimeout(focusBox, 50);
	};
</script>

<div class="input-area" data-click="input-area">
	<form class="input-form" data-click="input-form">
		<ButtonGroup class="input-btn-group" size="sm">
			<button
				data-click="dropdown-btn"
				type="button"
				disabled={selectDisabled}
				class:selectDisabled
				class="select-button inline-flex shrink-0 items-center justify-center border border-s-0 border-gray-200 bg-white px-3 py-2 text-center text-xs font-medium text-gray-900 first:rounded-s-lg first:border-s last:rounded-e-lg"
			>
				{m.examples}<ChevronDownOutline class="pointer-events-none h-4 w-4 text-gray-500" />
			</button>
			<Dropdown bind:open={dropdownOpen} class="example-dropdown">
				{#each inputTextExample.slice(0, 5) as text, index}
					<DropdownItem
						data-click={`dropdown-item-${index}`}
						class={$selectedExampleIdx === index && 'active'}
						on:click={() => {
							onSelectExample(text, index);
						}}>{text}</DropdownItem
					>
				{/each}
			</Dropdown>

			<div
				data-click="text-input"
				class="input-container"
				class:disabled
				role="none"
				on:keydown={(e) => {
					e.stopPropagation();
					inputRef.focus();
				}}
				on:click={(e) => {
					e.stopPropagation();
					inputRef.focus();
				}}
			>
				<div class={`editable ${!$isModelRunning ? 'w-full' : ''}`}>
					<div
						bind:this={inputRef}
						contenteditable={!disabled || stayEditableAfterClear}
						class="text-box"
						placeholder={m.placeholder}
						on:focus={onFocusInput}
						on:input={onInput}
						on:keydown={handleKeyDown}
						on:click={(e) => {
							e.stopPropagation();
						}}
						role="input"
						data-te-input="committed"
					>
						{inputTextTemp}
					</div>
					{#if pendingToken}
						<span class="pending-token" class:punct={pendingIsPunct} data-te-input="pending" title={m.pendingTokenLabel || (zh ? '即将写入' : 'About to write')}>{pendingDisplay}</span>
					{/if}
				</div>
				{#if $isModelRunning}
					<div class="loading"><LoadingDots /></div>
				{/if}
				{#if $isMobile}
					<span class="helper-text"
						>{m.mobileHint}</span
					>
				{:else if exceedLimit}
					<span class="helper-text">{m.wordLimit.replace('{n}', String(wordLimit))}</span>
				{/if}
				{#if fieldHasContent}
					<button
						type="button"
						class="clear-input"
						data-te-input="clear"
						on:click={clearInputField}
					>{m.clearInput || (zh ? '清空' : 'Clear')}</button>
				{/if}
			</div>
		</ButtonGroup>
		{#if textFirstStop && !onBridgeSentence && fieldHasContent}
			<div class="why-english-row" data-te-input="why-english-row">
				<p class="why-english" data-te-input="why-english">{m.whyEnglishFirst || (zh ? '先用这句英文，是因为它已经算好了下一个词，现在就能看见，不用等模型下载完。' : 'This sentence starts in English because the next word is already precomputed, so you can see it now without waiting for the model to download.')}</p>
				<button type="button" class="use-chinese-quiet" data-te-path="use-chinese" on:click={useChineseExample}>{m.useChinese || (zh ? '换上这句中文' : 'Use this Chinese sentence')}</button>
			</div>
		{/if}
		<div class="next-guess" data-te-preview="next">
			<span class="next-guess-label" data-te-preview="label">{m.nextGuessLabel || (zh ? '它正要猜的下一个词' : 'The next word it is about to guess')}</span>
			<span class="next-guess-chip" class:punct={pendingIsPunct} data-te-preview="chip">{pendingDisplay || m.nextGuessPlaceholder || '•••'}</span>
			{#if pendingIsPunct}
				<span class="next-guess-hint" data-te-preview="punct-hint">{m.nextGuessPunctHint || (zh ? '这是符号或换行，还没写进句子。点「生成下一个词」才会加上。' : 'This is a symbol or line break, not yet in the sentence. Click “Generate the next word” to add it.')}</span>
			{/if}
		</div>
		<button
			data-click="generate-btn"
			data-te-path="generate"
			disabled={disabled || exceedLimit || exceedLimit}
			class={classNames('generate-button rounded-lg text-center text-sm shadow-sm', {
				disabled: disabled || exceedLimit,
				active: !(disabled || exceedLimit) && !generateHeld,
				held: generateHeld && !(disabled || exceedLimit)
			})}
			type="submit"
			on:click={handleSubmit}
		>
			{m.generate}
		</button>
		{#if !textFirstStop}
			<div class="text-path-ctrls" data-te-path="controls">
				<button type="button" class="push-back" data-te-path="push-back" on:click={textPathBack} disabled={pathIdx === 0}>
					{m.textPushBack || (zh ? '回退一步' : 'Step back')}
				</button>
			</div>
		{/if}
	</form>
	{#if !textFirstStop || knobsVisible}
	<div class="parameters" data-click="input-parameters" data-te-sampling="panel">
		{#if knobsVisible}
			<Temperature disabled={parameterDisabled} />
			<Sampling disabled={parameterDisabled} />
			<button type="button" class="show-knobs" data-te-sampling="hide" on:click={() => samplingOpen.set(false)}>
				{m.hideSampling || (zh ? '收起抽词旋钮' : 'Hide sampling knobs')}
			</button>
		{:else}
			<button type="button" class="show-knobs" data-te-sampling="show" aria-expanded="false" on:click={onShowKnobs}>
				{m.showSampling || (zh ? '显示抽词旋钮' : 'Show sampling knobs')}
			</button>
		{/if}
	</div>
	{/if}
	{#if showFtBridge}
		<p class="te-bridge-back" data-te-bridge="to-finetune">
			{#if onBridgeSentence}
				<span class="te-bridge-note">{zh ? '这是两门课共用的贯穿例句。' : 'This is the shared sentence used by both courses.'}</span>
			{/if}
			<button type="button" class="te-bridge-btn" on:click={goToFinetuneFromText}>{zh ? '回微调课看损失如何改权重' : 'Back to the fine-tune course to see how loss changes the weights'}</button>
		</p>
	{/if}
	<LoraContrastBar />
</div>

<style lang="scss">
	.parameters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
	}
	.text-path-ctrls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.5rem;
		flex-shrink: 0;
	}
	.push-back,
	.show-knobs {
		border-radius: 0.4rem;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
		background: white;
		border: 1px solid #e5e7eb;
		color: #374151;
	}
	.push-back:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.knob-locked {
		font-size: 0.75rem;
		color: #6b7280;
		max-width: 16rem;
	}
	.input-area {
		width: 100%;
		flex-shrink: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding-left: 0;
		padding-right: 0;

		.input-form {
			width: 100%;
			flex: 1 0 0;
			display: flex;
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 0.5rem;

			:global(.input-btn-group) {
				flex: 1 1 28rem;
				min-width: min(100%, 22rem);
				display: flex;
				align-items: stretch;
			}
		}
	}
	.input-container {
		position: relative;
		display: flex;
		flex: 1 1 auto;
		align-items: flex-start;
		min-width: 12rem;
		min-height: 2.7rem;

		border: 1px solid theme('colors.gray.300');
		color: theme('colors.gray.900');
		border-left: none;
		border-start-end-radius: 0.5rem;
		border-end-end-radius: 0.5rem;
		font-size: 1rem;
		line-height: 1.45;
		padding: 0.45rem 0.55rem;
		white-space: pre-wrap;
		gap: 0.3rem;

		width: 10px; // to keep input box width in the flex row

		.editable {
			flex: 1 1 auto;
			width: 100%;
			min-width: 0;
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			align-content: flex-start;
			overflow: visible;
			white-space: pre-wrap;

			.text-box {
				flex: 0 1 auto;
				min-width: 0;
				width: auto;
				max-width: calc(100% - 0.5rem);
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				word-break: break-word;
				min-height: 1.45em;
				br {
					display: none;
				}

				&:focus {
					outline: none;
				}
			}
			.pending-token {
				flex: 0 1 auto;
				color: var(--predicted-color, #7c3aed);
				font-weight: 700;
				white-space: pre-wrap;
				background: #faf5ff;
				border: 1px dashed #c4b5fd;
				border-radius: 0.25rem;
				padding: 0 0.28rem;
				margin-left: 0.12rem;
				line-height: 1.45;
			}
			.pending-token.punct {
				background: #f5f3ff;
			}
			.predicted {
				flex: 1 0 0;
				color: var(--predicted-color);
				font-weight: 600;
				span {
					white-space: pre;
				}
			}
		}

		&.disabled {
			cursor: not-allowed;
		}

		.loading {
			flex-shrink: 0;
			padding-top: 0.15rem;
		}
	}

	.select-button {
		flex-shrink: 0;
		font-size: 0.9rem;
		border: 1px solid theme('colors.gray.300');
		color: theme('colors.gray.900');
		&:hover {
			background-color: theme('colors.gray.100');
		}
		&:focus {
			outline: none;
		}
		&.disabled {
			cursor: not-allowed;
		}
	}
	:global(.example-dropdown) {
		:global(.active) {
			background-color: theme('colors.gray.100') !important;
		}
	}
	.why-english-row {
		flex: 1 0 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem 0.7rem;
		margin: 0;
		min-width: 0;
	}
	.why-english {
		margin: 0;
		flex: 1 1 18rem;
		min-width: 0;
		font-size: 0.78rem;
		line-height: 1.4;
		color: #4b5563;
	}
	.use-chinese-quiet {
		flex: 0 0 auto;
		background: transparent;
		border: 1px solid #e5e7eb;
		border-radius: 0.35rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
		color: #6d28d9;
		font-size: 0.78rem;
		font-weight: 500;
	}
	.use-chinese-quiet:hover {
		background: #f5f3ff;
		border-color: #ddd6fe;
	}

	.clear-input {
		flex: 0 0 auto;
		align-self: center;
		background: transparent;
		border: 1px solid #e5e7eb;
		border-radius: 0.35rem;
		padding: 0.15rem 0.45rem;
		margin-left: 0.2rem;
		cursor: pointer;
		color: #6b7280;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.3;
		white-space: nowrap;
	}
	.clear-input:hover {
		background: #f9fafb;
		border-color: #d1d5db;
		color: #374151;
	}
	.clear-input:focus {
		outline: 2px solid #e5e7eb;
		outline-offset: 1px;
	}
	.helper-text {
		position: absolute;
		bottom: 0;
		right: 0;
		padding: 0.2rem 0;
		transform: translate(0, 100%);
		color: theme('colors.gray.400');
		font-size: 0.75rem;
		pointer-events: none;
		z-index: 0;
		max-width: 16rem;
		text-align: right;
	}
	.model-dl {
		flex: 1 0 100%;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 1.05rem;
		margin: 0 0 0.15rem;
		padding: 0;
		position: relative;
		z-index: 1;
		pointer-events: none;
	}
	.model-dl-track {
		flex: 0 0 4.2rem;
		height: 3px;
		border-radius: 999px;
		background: #ede9fe;
		overflow: hidden;
	}
	.model-dl-bar {
		display: block;
		width: 45%;
		height: 100%;
		border-radius: 999px;
		background: #7c3aed;
		animation: te-model-dl 1.1s ease-in-out infinite;
	}
	.model-dl-text {
		font-size: 0.72rem;
		color: #6b7280;
		line-height: 1.2;
		white-space: nowrap;
	}
	@keyframes te-model-dl {
		0% { transform: translateX(-120%); }
		100% { transform: translateX(280%); }
	}
	.parameters {
		position: relative;
		z-index: 2;
	}
	:global(.generate-button) {
		padding: 0.4rem 0.8rem;
		border: 1px solid theme('colors.gray.300');
		color: theme('colors.gray.900');
		transition: all 0.2s;
		flex-shrink: 0;
		margin-top: 0.15rem;
		font-weight: 600;
	}
	:global(.generate-button.held) {
		background: white;
		color: #374151;
		border: 1px solid #e5e7eb;
		font-weight: 600;
	}
	:global(.generate-button.active) {
		background: #7c3aed;
		color: #fff;
		border: 1px solid #7c3aed;
		font-weight: 600;
		&:hover {
			background: #6d28d9;
			border-color: #6d28d9;
			color: #fff;
		}
	}
	:global(.generate-button.disabled) {
		opacity: 1;
		background-color: theme('colors.gray.100');
		color: theme('colors.gray.400');
		border-color: theme('colors.gray.300');
		cursor: not-allowed;
		font-weight: 600;
	}

	:global(.generate-button.active):focus {
		border: 1px solid #6d28d9;
		color: #fff;
		outline: 2px solid #c4b5fd;
		outline-offset: 2px;
	}

	.te-bridge-back {
		flex: 1 0 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: -0.35rem 0 0;
		font-size: 0.78rem;
		color: #6b7280;
	}
	.te-bridge-note {
		color: #5b21b6;
		font-weight: 600;
	}
	.te-bridge-btn {
		border: none;
		background: transparent;
		padding: 0;
		color: #6d28d9;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}
	.te-bridge-btn:hover {
		color: #4c1d95;
	}

	.next-guess {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.12rem;
		max-width: 14rem;
		padding: 0.15rem 0.45rem 0.2rem;
		border: 1px dashed #c4b5fd;
		border-radius: 0.45rem;
		background: #faf5ff;
		margin-top: 0.05rem;
	}
	.next-guess-label {
		font-size: 0.68rem;
		font-weight: 700;
		color: #6d28d9;
		line-height: 1.2;
		white-space: nowrap;
	}
	.next-guess-chip {
		color: var(--predicted-color, #7c3aed);
		font-weight: 700;
		font-size: 0.95rem;
		line-height: 1.2;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.next-guess-hint {
		font-size: 0.68rem;
		font-weight: 600;
		color: #6d28d9;
		line-height: 1.35;
		white-space: normal;
	}
</style>
