<script lang="ts">
	import '~/styles/app.css';
	import '~/styles/global.scss';
	import Topbar from '~/components/Topbar.svelte';
	import { isLoaded, isFetchingModel, isMobile, predictedColor, rootRem, userId, modelFetchProgress } from '~/store';
	import Article from '~/components/article/Article.svelte';
	import { onMount } from 'svelte';
	import { Spinner } from 'flowbite-svelte';
	import Alert from '~/components/Alert.svelte';
	import GTM from '~/utils/gtm.svelte';
	import CoachBar from '~/components/CoachBar.svelte';
	import MathWalkDock from '~/components/MathWalkDock.svelte';
	import TextZoneGuide from '~/components/TextZoneGuide.svelte';
	import TaskCluster from '~/components/TaskCluster.svelte';
	import LearningWorkbench from '~/components/LearningWorkbench.svelte';
	import TutorSettings from '~/components/TutorSettings.svelte';
	import TutorPanel from '~/components/TutorPanel.svelte';
	import LearningMap from '~/components/LearningMap.svelte';
	import AskAnywhere from '~/components/AskAnywhere.svelte';
	import CourseContrast from '~/components/courses/CourseContrast.svelte';
	import { page } from '$app/stores';
	import { locale, messages } from '~/i18n';
	import { articleCollapsed, samplingLockedHint } from '~/store/beginnerPath';
	import { applyTeachingCourseFromHash, course, courseContrastOpen } from '~/store/course';
	import { tutorPanelOpen } from '~/tutor/store';
	import { armClassroomReveal } from '~/store/classroomReady';

	let topBarHeight = 0;
	let scrollLeft = 0;
	let guideSlotEl: HTMLElement | undefined;

	let minScreenWidth = 1280;
	let minColumWidth = Math.floor(minScreenWidth / 24) - rootRem * 2;

	$: m = $messages as any;
	$: zh = $locale !== 'en';
	let intersectionObserver: IntersectionObserver;
	let tobBarActive = false;
	let target: HTMLElement;

	onMount(() => {
		armClassroomReveal();
		applyTeachingCourseFromHash();
		void import('~/courses/loraContrast').then((m) => m.maybeOpenLoraContrastFromHash());
		isLoaded.set(true);
		document.documentElement.setAttribute('data-te-hydrated', '1');

		const userIdParam = $page.url.searchParams.get('userId');

		if (userIdParam) {
			userId.set(userIdParam);
			(window as any).dataLayer?.push({
				event: 'user_identified',
				user_id: userIdParam,
				timestamp: new Date().toISOString()
			});
		}

		intersectionObserver = new IntersectionObserver(handleIntersection, {
			root: null,
			rootMargin: '0px',
			threshold: 0.2
		});

		if (target) {
			intersectionObserver.observe(target);
		}
		const measureHeader = () => {
			const el = document.querySelector('#landing header') as HTMLElement | null;
			const main = document.querySelector('#main') as HTMLElement | null;
			if (!el) return;
			const h = Math.round(el.getBoundingClientRect().height);
			topBarHeight = h;
			if (main) main.style.paddingTop = `${h}px`;
			document.documentElement.style.setProperty('--te-topbar-h', `${h}px`);
			const chrome = document.querySelector('[data-te-topbar="chrome"], .top-bar') as HTMLElement | null;
			if (chrome) {
				const ch = Math.round(chrome.getBoundingClientRect().height);
				document.documentElement.style.setProperty('--te-topbar-chrome-h', `${ch}px`);
			}
		};
		const measureGuide = () => {
			const slot = (guideSlotEl || document.querySelector('[data-te-guide="slot"]')) as HTMLElement | null;
			if (!slot) {
				document.documentElement.style.setProperty('--te-guide-h', '0px');
				document.documentElement.style.setProperty('--te-coach-h', '0px');
				return;
			}
			const r = slot.getBoundingClientRect();
			const next = r.height > 0 ? `${Math.max(0, Math.ceil(window.innerHeight - r.top))}px` : '0px';
			if (document.documentElement.style.getPropertyValue('--te-guide-h') !== next) {
				document.documentElement.style.setProperty('--te-guide-h', next);
				document.documentElement.style.setProperty('--te-coach-h', next);
			}
		};
		measureHeader();
		measureGuide();
		const ro = new ResizeObserver(() => {
			measureHeader();
			measureGuide();
		});
		const headerEl = document.querySelector('#landing header');
		if (headerEl) ro.observe(headerEl);
		const chromeEl = document.querySelector('[data-te-topbar="chrome"], .top-bar');
		if (chromeEl) ro.observe(chromeEl);
		if (guideSlotEl) ro.observe(guideSlotEl);
		window.addEventListener('scroll', handleMobileScrollX);
		window.addEventListener('resize', measureGuide);

		return () => {
			document.documentElement.removeAttribute('data-te-hydrated');
			intersectionObserver.disconnect();
			ro.disconnect();
			window.removeEventListener('scroll', handleMobileScrollX);
			window.removeEventListener('resize', measureGuide);
		};
	});

	function handleIntersection(entries: any[]) {
		entries.forEach((entry: any) => {
			if (entry.isIntersecting) {
				tobBarActive = true;
			} else {
				tobBarActive = false;
			}
		});
	}

	const handleMobileScrollX = () => {
		scrollLeft = window.scrollX || document.documentElement.scrollLeft;
	};

	$: if (typeof document !== 'undefined') {
		void $courseContrastOpen;
		void $tutorPanelOpen;
		void $course;
		requestAnimationFrame(() => {
			const slot = (guideSlotEl || document.querySelector('[data-te-guide="slot"]')) as HTMLElement | null;
			if (!slot) {
				document.documentElement.style.setProperty('--te-guide-h', '0px');
				document.documentElement.style.setProperty('--te-coach-h', '0px');
				return;
			}
			const r = slot.getBoundingClientRect();
			const next = r.height > 0 ? `${Math.max(0, Math.ceil(window.innerHeight - r.top))}px` : '0px';
			document.documentElement.style.setProperty('--te-guide-h', next);
			document.documentElement.style.setProperty('--te-coach-h', next);
		});
	}
</script>

<GTM />
<div
	id="app"
	style={`--min-screen-width:${minScreenWidth}px;--min-column-width:${minColumWidth}px;--predicted-color:${predictedColor};`}
>
	<div id="landing">
		<header bind:offsetHeight={topBarHeight} style="transform: translateX({-1 * scrollLeft}px);">
			<Topbar isActive={tobBarActive} />
			{#if $isLoaded && $course === 'text' && $isFetchingModel && !$isMobile && $modelFetchProgress.active && $modelFetchProgress.percent < 100 && $modelFetchProgress.partsDone < $modelFetchProgress.partsTotal}
				<div class="header-status" data-te-model="download" role="status" aria-live="polite" data-te-model-parts={$modelFetchProgress.partsDone} data-te-model-total={$modelFetchProgress.partsTotal}>
					<span class="model-dl-track" aria-hidden="true"><span class="model-dl-bar" style={`width:${Math.max(0, Math.min(100, $modelFetchProgress.percent))}%`}></span></span>
					<span class="model-dl-text">{zh ? `模型下载中（${$modelFetchProgress.partsDone}/${$modelFetchProgress.partsTotal}，${Math.round($modelFetchProgress.percent)}%）。约 600MB，先用示例即可` : `Downloading GPT-2 (${$modelFetchProgress.partsDone}/${$modelFetchProgress.partsTotal}, ${Math.round($modelFetchProgress.percent)}%). ~600MB, examples still work.`}</span>
				</div>
			{/if}
			{#if $course === 'text' && $samplingLockedHint}
				<p class="header-status locked" data-te-sampling="locked" role="status">
					{m.samplingLocked || (zh ? '还没走到这一步，先看它怎么抽一个词。' : 'This step is not unlocked yet. First watch how it draws a word.')}
				</p>
			{/if}
			<div class="stage-chrome">
				<div class="locator-row">
					<LearningMap />
				</div>
				<TextZoneGuide />
				<TaskCluster />
			</div>
		</header>
		<main id="main" style={`padding-top:${topBarHeight}px`} bind:this={target}>
			{#if $isLoaded}
				<slot />
			{:else}
				<div class="flex h-full w-full items-center justify-center"><Spinner color="purple" /></div>
			{/if}
		</main>
	</div>
	<div class="article-wrap">
		{#if $articleCollapsed}
			<div class="article-collapsed">
				<button type="button" class="article-toggle" data-te-article="show" on:click={() => articleCollapsed.set(false)}>
					{m.articleShow || (zh ? '展开文底说明（现在还不用看）' : 'Show the article below (you can skip it for now)')}
				</button>
			</div>
		{:else}
			<div class="article h-auto w-full">
				<button type="button" class="article-toggle in-article" data-te-article="hide" on:click={() => articleCollapsed.set(true)}>
					{m.articleHide || (zh ? '收起文底说明' : 'Hide the article')}
				</button>
				<Article></Article>
			</div>
		{/if}
	</div>
</div>

{#if $courseContrastOpen}
	<div class="contrast-curtain-back" data-te-contrast="backdrop" aria-hidden="true"></div>
{/if}
<div
	class="guide-slot"
	class:with-curtain-ask={$courseContrastOpen && $tutorPanelOpen}
	class:curtain-up={$courseContrastOpen}
	data-te-guide="slot"
	bind:this={guideSlotEl}
>
	{#if $courseContrastOpen}
		<CourseContrast />
	{:else}
		<MathWalkDock />
		<CoachBar />
	{/if}
	<TutorPanel />
</div>

<LearningWorkbench />
<AskAnywhere />
<TutorSettings />

<!-- <div class="alert">
	<Alert />
</div> -->

<style lang="scss">
	:global(:root) {
		--te-fs-title: 0.95rem;
		--te-fs-body: 0.84rem;
		--te-fs-caption: 0.75rem;
		--te-ease: 180ms ease;
		--te-ink: #1f2937;
		--te-ink-soft: #4b5563;
	}
	.alert {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		z-index: 9999;
	}

	.guide-slot {
		position: fixed;
		left: 50%;
		bottom: 0.75rem;
		transform: translateX(-50%);
		z-index: 10000;
		width: min(820px, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: min(42vh, 26rem);
		overflow-y: auto;
		pointer-events: none;
	}
	.guide-slot.with-curtain-ask {
		max-height: min(58vh, 34rem);
	}
	.contrast-curtain-back {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		top: var(--te-topbar-chrome-h, 3.25rem);
		z-index: 10040;
		background: rgba(247, 244, 255, 0.92);
		pointer-events: auto;
	}
	.guide-slot.curtain-up {
		z-index: 10050;
	}
	.guide-slot.curtain-up.with-curtain-ask :global([data-te-contrast="overlay"]) {
		flex: 1 1 auto;
		min-height: 8rem;
		max-height: none;
	}
	.guide-slot.curtain-up.with-curtain-ask :global([data-te-tutor="ask-panel"]) {
		flex: 0 1 auto;
		max-height: min(18vh, 10.5rem);
		z-index: 1;
	}
	.guide-slot > :global(*) {
		pointer-events: auto;
		width: 100%;
	}
	.guide-slot > :global(button.reopen) {
		width: auto;
		max-width: max-content;
		align-self: center;
	}

	#app {
		height: 100vh;
		min-width: 900px;
		contain: layout;
	}

	#landing {
		height: 100%;
		width: 100%;
		min-width: 0;
		max-width: 100%;
	}

	header {
		min-width: 0;
		width: 100%;
		max-width: 100%;
		position: fixed;
		z-index: 10030;
		background: #fff;
		box-sizing: border-box;
	}
	.stage-chrome {
		position: relative;
		padding: 0.3rem 1.5rem 0.4rem;
		background: #fff;
		border-bottom: 1px solid #f5f3ff;
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
		overflow: visible;
	}
	.locator-row {
		display: flex;
		align-items: center;
		min-height: 1.6rem;
		position: relative;
		z-index: 2;
	}
	.header-status {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 1.25rem;
		padding: 0.25rem 1.5rem 0.3rem;
		margin: 0;
		background: #fff;
		position: relative;
		z-index: 1;
		pointer-events: none;
		border-bottom: 1px solid #f3f0ff;
	}
	.header-status.locked {
		color: #6d28d9;
		font-size: 0.82rem;
		font-weight: 700;
		line-height: 1.3;
		margin: 0;
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
		width: 0%;
		height: 100%;
		border-radius: 999px;
		background: #7c3aed;
		transition: width 160ms linear;
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
	main {
		position: relative;
		height: 95%;
		width: 100%;
		display: flex;
		justify-content: start;
		overflow: hidden;
		box-sizing: border-box;
		padding-top: var(--te-topbar-h, 6.2rem);
	}
	.article {
		padding-top: 2rem;
	}
	.article-collapsed {
		display: flex;
		justify-content: center;
		padding: 0.6rem 1rem 1.2rem;
	}
	.article-toggle {
		border: 1px dashed #ddd6fe;
		background: #fafafa;
		color: #6b7280;
		border-radius: 999px;
		padding: 0.3rem 0.9rem;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.article-toggle.in-article {
		display: block;
		margin: 0 auto 0.8rem;
	}
</style>


