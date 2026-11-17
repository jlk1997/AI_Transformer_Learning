<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { locale, messages, mathWalkExpanded, coachLessonIdx, workbenchOpen } from '~/i18n';
	import { course, courseContrastOpen } from '~/store/course';
	import { isTextbookOpen, textbookCurrentPageId } from '~/store';
	import { finetuneSpineView } from '~/courses/finetune/store';
	import {
		openTutorSettings,
		tutorDraft,
		tutorError,
		tutorMessages,
		tutorNextHint,
		tutorPanelOpen,
		tutorServiceDown,
		tutorSettings,
		tutorStreaming,
		tutorTarget,
		tutorThinking
	} from '~/tutor/store';
	import { askTutor, loadTutorSettings } from '~/tutor/api';
	import { buildTutorSnapshot } from '~/tutor/snapshot';
	import { askPlaceholder, contrastOverlayVisible, currentTutorStationId, suggestedAsks } from '~/tutor/suggestions';
	import { humanizeSpecialTokensInText } from '~/utils/gpt2Tokens';

	$: m = ($messages as any).tutor || {};
	$: zh = $locale !== 'en';
	$: courseId = $course;
	$: stationId = currentTutorStationId(courseId, $coachLessonIdx, $finetuneSpineView, {
		contrast: $courseContrastOpen && contrastOverlayVisible(),
		workbench: $workbenchOpen,
		textbookOpen: $isTextbookOpen,
		textbookPage: $textbookCurrentPageId
	});
	$: chips = suggestedAsks(courseId, stationId, zh);
	$: inputPlaceholder =
		askPlaceholder(courseId, stationId, zh) ||
		m.placeholder ||
		(zh ? '问这一步，例如：右边表是什么？' : 'Ask about this step, e.g. what is the table on the right?');
	$: lastTutorMsg = (() => {
		const list = $tutorMessages;
		for (let i = list.length - 1; i >= 0; i--) {
			if (list[i].role === 'tutor') return list[i];
		}
		return null;
	})();
	$: corpusAnswerShowing = !!(lastTutorMsg && lastTutorMsg.text && lastTutorMsg.source === 'corpus' && !lastTutorMsg.needKey);
	let scroller: HTMLElement;
	let inputEl: HTMLTextAreaElement;
	let wasOpen = false;
	let showStartHelp = false;
	let leadScrolledAway = false;
	$: curtainUp = $courseContrastOpen && contrastOverlayVisible();

	const startHelpZh = `要开始上课，请双击项目文件夹里的「启动帮手」。

它会打开本机课堂。请在浏览器中打开 http://127.0.0.1:5173 。

如果还缺 Python 或 Node.js，帮手会用白话告诉你还缺什么。教材、自测和提问界面在教学服务还没连上时也可以先用。`;

	const startHelpEn = `To start the class, double-click “启动帮手” (Start helper) in the project folder.

It opens the local classroom. Then open http://127.0.0.1:5173 in your browser.

If Python or Node.js is missing, the helper will tell you in plain language. The textbook, self-checks, and question box still work if the teaching service is not connected yet.`;
onMount(() => {
		void loadTutorSettings().catch(() => {});
	});

	$: if ($tutorPanelOpen && !wasOpen) {
		wasOpen = true;
		void tick().then(() => {
			inputEl?.focus();
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	} else if (!$tutorPanelOpen) {
		wasOpen = false;
	}

	$: if (!$tutorServiceDown) {
		showStartHelp = false;
	}

	const measureLeadVisibility = () => {
		if (!scroller) {
			leadScrolledAway = false;
			return;
		}
		const last = scroller.querySelector('[data-te-tutor-msg="tutor"]:last-of-type') as HTMLElement | null;
		if (!last) {
			leadScrolledAway = false;
			return;
		}
		const bubble = (last.querySelector('.bubble') as HTMLElement) || last;
		const cr = scroller.getBoundingClientRect();
		const tr = bubble.getBoundingClientRect();
		leadScrolledAway = tr.top < cr.top - 6;
	};

	$: if ($tutorMessages && scroller) {
		void tick().then(measureLeadVisibility);
	}

	// Do not auto-scroll from a reactive $: on $tutorMessages (that path wedged the tab).
	// send() scrolls once after the answer arrives.

		const close = () => tutorPanelOpen.set(false);

	const send = async (preset?: string) => {
		const q = (preset ?? $tutorDraft).trim();
		if (!q || $tutorStreaming) return;
		tutorDraft.set('');
		// Let the click turn finish before snapshot/ask so the tab stays responsive.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		if ($tutorStreaming) return;
		const snapshot = buildTutorSnapshot();
		const target = $tutorTarget;
		await askTutor({ question: q, snapshot, target, zh });
		tutorTarget.set(null);
		await tick();
		if (scroller) {
			const last = scroller.querySelector('[data-te-tutor-msg="tutor"]:last-of-type') as HTMLElement | null;
			if (last) scroller.scrollTop = Math.max(0, last.offsetTop - 8);
			else scroller.scrollTop = scroller.scrollHeight;
		}
		measureLeadVisibility();
		const last = get(tutorMessages).at(-1);
		if (last && last.role === 'tutor' && last.needKey) openTutorSettings();
	};

	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	};
</script>

{#if $tutorPanelOpen}
	<aside class="panel" class:with-dock={$mathWalkExpanded} class:with-curtain={curtainUp} data-te-tutor="ask-panel" transition:fade={{ duration: 180 }} aria-label={m.askTitle || (zh ? '问导师' : 'Ask the tutor')}>
		<header>
			<h2>{m.askTitle || (zh ? '问导师' : 'Ask the tutor')}</h2>
			<button type="button" class="ghost" data-te-tutor="settings-open-from-panel" on:click={openTutorSettings}>{m.settings || (zh ? '设置' : 'Settings')}</button>
			<button type="button" class="ghost" data-te-tutor="ask-close" on:click={close}>{m.close || (zh ? '关闭' : 'Close')}</button>
		</header>

		{#if $tutorServiceDown}
			<div class="down-block" data-te-tutor="service-down">
				<p class="warn">
					{m.serviceDown ||
						(zh
							? '本机教学服务还没连上。教材、自测和提问界面仍可使用。要问导师，需要先启动本机教学服务。'
							: 'The local teaching service is not connected. You can still use the textbook, self-checks, and the question box. Asking the tutor needs the local teaching service started first.')}
				</p>
				<button
					type="button"
					class="ghost help-toggle"
					data-te-tutor="start-help-toggle"
					aria-expanded={showStartHelp}
					on:click={() => (showStartHelp = !showStartHelp)}
				>
					{showStartHelp
						? m.startHelpHide || (zh ? '收起启动说明' : 'Hide start instructions')
						: m.startHelpToggle || (zh ? '如何启动本机教学服务' : 'How to start the local teaching service')}
				</button>
				{#if showStartHelp}
					<pre class="help" data-te-tutor="start-help">{m.startHelp || (zh ? startHelpZh : startHelpEn)}</pre>
				{/if}
			</div>
		{/if}

		<div class="log" bind:this={scroller} data-te-tutor="transcript" on:scroll={measureLeadVisibility}>
			{#if $tutorMessages.length === 0}
				<p class="empty">{m.empty || (zh ? '随时问当前这一步。我会指着画面上的位置，用你看见的数字讲解，再把你送回主路。' : 'Ask about this step anytime. I will point at the screen, use the numbers you can see, and send you back to the path.')}</p>
			{/if}
			{#each $tutorMessages as msg, i (i + '-' + msg.role)}
				<div class="msg" class:user={msg.role === 'user'} data-te-tutor-msg={msg.role}>
					<div class="bubble">{humanizeSpecialTokensInText(msg.text || '', zh) || ($tutorStreaming && !$tutorServiceDown && i === $tutorMessages.length - 1 ? '…' : '')}</div>
					{#if msg.role === 'tutor' && i === $tutorMessages.length - 1 && corpusAnswerShowing && $tutorSettings && !$tutorSettings.configured}
						<p class="need-key-secondary" data-te-tutor="need-key-secondary">
							{zh
								? '若要问更深的问题，可以到面板上方的「设置」里配置密钥。'
								: 'To ask deeper questions, you can configure a key in Settings at the top of this panel.'}
						</p>
					{/if}
				</div>
			{/each}
			{#if $tutorThinking && $tutorSettings?.showThinking}
				<details class="thinking" data-te-tutor="thinking"><summary>{zh ? '模型思考（调试）' : 'Model thinking (debug)'}</summary><pre>{$tutorThinking}</pre></details>
			{/if}
		</div>
		{#if lastTutorMsg && leadScrolledAway}
			<button
				type="button"
				class="ghost scroll-start"
				data-te-tutor="scroll-start"
				on:click={() => {
					if (!scroller) return;
					const last = scroller.querySelector('[data-te-tutor-msg="tutor"]:last-of-type') as HTMLElement | null;
					if (last) scroller.scrollTop = Math.max(0, last.offsetTop - 8);
				}}
			>
				{zh ? '回到回答开头' : 'Back to the start of the answer'}
			</button>
		{/if}

		{#if $tutorNextHint}
			<p class="hint" data-te-tutor="next-hint">{humanizeSpecialTokensInText($tutorNextHint, zh)}</p>
		{/if}
		{#if $tutorError}
			<p class="warn">{$tutorError}</p>
		{/if}

		{#if !$tutorServiceDown && $tutorSettings && !$tutorSettings.configured && !corpusAnswerShowing}
			<p class="need-key-note" data-te-tutor="need-key-note">
				{m.needKeyNote ||
					(zh
						? '常见问题我仍然可以用本课讲解来回答。若要问更深的问题，可以到设置里配置密钥。'
						: 'Common questions still get a lesson answer. To ask deeper questions, you can configure a key in Settings.')}
				<button type="button" class="link" data-te-tutor="need-key-open" on:click={openTutorSettings}>{m.goSettings || (zh ? '去设置' : 'Open settings')}</button>
			</p>
		{/if}

		<div class="compose">
			<textarea
				bind:this={inputEl}
				bind:value={$tutorDraft}
				data-te-tutor="ask-input"
				rows="2"
				placeholder={inputPlaceholder}
				on:keydown={onKey}
			></textarea>
			<button type="button" class="primary" data-te-tutor="ask-send" disabled={$tutorStreaming || !$tutorDraft.trim()} on:click={() => send()}>
				{$tutorStreaming && !$tutorServiceDown ? (zh ? '正在讲…' : 'Answering…') : m.send || (zh ? '问' : 'Ask')}
			</button>
		</div>
		<p class="quick" data-te-tutor="chips">
			{#each chips as chip (chip.id + '-' + courseId + '-' + stationId)}
				<button type="button" class="chip" data-te-tutor={chip.id} on:click={() => send(chip.question)}>{chip.label}</button>
			{/each}
		</p>
	</aside>
{/if}

<style>
	.panel {
		position: relative;
		z-index: 2;
		width: 100%;
		max-height: min(38vh, 22rem);
		display: flex;
		flex-direction: column;
		background: rgba(255, 255, 255, 0.98);
		border: 1px solid #ddd6fe;
		border-radius: 0.75rem;
		box-shadow: 0 12px 36px rgba(76, 29, 149, 0.18);
		padding: 0.65rem 0.7rem 0.55rem;
	}
	.panel.with-dock {
		max-height: min(28vh, 16rem);
	}
	.panel.with-curtain {
		max-height: min(18vh, 10.5rem);
		z-index: 1;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.35rem;
	}
	h2 {
		margin: 0;
		flex: 1;
		font-size: 0.95rem;
		font-weight: 800;
		color: #4c1d95;
	}
	.scroll-start {
		align-self: flex-start;
		margin: 0.15rem 0 0.25rem;
		font-size: var(--te-fs-caption, 0.75rem);
	}
	.log {
		flex: 1;
		overflow: auto;
		min-height: 5.5rem;
		padding: 0.2rem 0.1rem;
	}
	.empty,
	.hint {
		font-size: 0.82rem;
		color: #4b5563;
		line-height: 1.45;
		margin: 0.2rem 0;
	}
	.hint {
		background: #f5f3ff;
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
		color: #5b21b6;
		font-weight: 600;
	}
	.msg {
		margin: 0.35rem 0;
		display: flex;
	}
	.msg.user {
		justify-content: flex-end;
	}
	.bubble {
		max-width: 92%;
		border-radius: 0.6rem;
		padding: 0.4rem 0.55rem;
		font-size: 0.86rem;
		line-height: 1.45;
		white-space: pre-wrap;
		color: #1f2937;
		background: #f5f3ff;
	}
	.msg.user .bubble {
		background: #4c1d95;
		color: #fff;
	}
	.compose {
		display: flex;
		gap: 0.35rem;
		align-items: flex-end;
		margin-top: 0.3rem;
	}
	textarea {
		flex: 1;
		resize: none;
		border: 1px solid #e5e7eb;
		border-radius: 0.45rem;
		padding: 0.35rem 0.5rem;
		font-size: 0.88rem;
		font-family: inherit;
	}
	.primary,
	.ghost,
	.chip,
	.link {
		cursor: pointer;
		border-radius: 0.4rem;
		font-size: 0.8rem;
	}
	.primary {
		background: #7c3aed;
		color: #fff;
		border: none;
		padding: 0.4rem 0.7rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.primary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.ghost {
		background: #fff;
		border: 1px solid #e5e7eb;
		color: #4b5563;
		padding: 0.2rem 0.5rem;
	}
	.warn,
	.need-key-note {
		font-size: 0.8rem;
		line-height: 1.4;
		margin: 0 0 0.35rem;
		padding: 0.4rem 0.5rem;
		border-radius: 0.4rem;
	}
	.warn {
		background: #fef3c7;
		color: #92400e;
		border: 1px solid #f59e0b;
	}
	.down-block .warn {
		margin-bottom: 0.35rem;
	}
	.help-toggle {
		margin: 0 0 0.4rem;
	}
	.help {
		margin: 0 0 0.45rem;
		padding: 0.45rem 0.55rem;
		font-size: 0.72rem;
		line-height: 1.45;
		white-space: pre-wrap;
		background: #fffbeb;
		border: 1px solid #f59e0b;
		border-radius: 0.4rem;
		color: #78350f;
		overflow: visible;
		max-height: none;
		font-size: 0.8rem;
		line-height: 1.5;
		font-family: inherit;
	}
	.need-key-note {
		margin: 0.25rem 0 0.15rem;
		padding: 0;
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 0.75rem;
		font-weight: 400;
	}
	.need-key-note .link {
		color: #6b7280;
		font-weight: 600;
	}
	.need-key-secondary {
		margin: 0.3rem 0 0;
		max-width: 92%;
		font-size: 0.72rem;
		line-height: 1.4;
		font-weight: 400;
		color: #6b7280;
	}
	.link {
		display: inline;
		margin-left: 0.35rem;
		background: transparent;
		border: none;
		color: #6d28d9;
		font-weight: 700;
		text-decoration: underline;
		padding: 0;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0.3rem 0 0;
	}
	.chip {
		background: #fff;
		border: 1px dashed #ddd6fe;
		color: #5b21b6;
		padding: 0.15rem 0.45rem;
	}
	.thinking {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0.3rem 0;
	}
	.thinking pre {
		white-space: pre-wrap;
		max-height: 6rem;
		overflow: auto;
	}
</style>
