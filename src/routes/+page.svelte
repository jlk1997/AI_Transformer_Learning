<script lang="ts">
	import {
		isTextbookOpen,
		isMobile
	} from '~/store';
	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { armClassroomReveal, markClassroomReady, revealIfDiagramVisible } from '~/store/classroomReady';
	import Textbook from '~/components/textbook/Textbook.svelte';
	import { course } from '~/store/course';
	import { applyTeachingCourseFromHash, switchCourse } from '~/store/course';
	import { isFtLaterHash } from '~/utils/teachingHash';
	import type { CourseId } from '~/store/course';
	import { locale } from '~/i18n';

	type StudioComp = typeof import('~/components/courses/TextStudio.svelte').default;

	const studioLoaders: Record<CourseId, () => Promise<{ default: StudioComp }>> = {
		text: () => import('~/components/courses/TextStudio.svelte'),
		image: () => import('~/components/courses/ImageStudio.svelte'),
		music: () => import('~/components/courses/MusicStudio.svelte'),
		finetune: () => import('~/components/courses/FinetuneStudio.svelte')
	};

	const studioCache: Partial<Record<CourseId, StudioComp>> = {};
	let CourseComp: StudioComp | null = null;
	let mountedId: CourseId | null = null;
	let studioError: string | null = null;
	let studioPending = false;

	// The precomputed text diagram can paint without waiting for the tokenizer.
	// A whole-page cover stays up until that diagram (or another course stage)
	// is actually visible, so the coach is not left on a blank canvas.
	$: active = true;
	$: pendingLabel = $locale === 'en' ? 'Opening this course…' : '正在打开这一课…';

	async function loadStudio(id: CourseId) {
		if (studioCache[id]) return studioCache[id]!;
		const mod = await studioLoaders[id]();
		studioCache[id] = mod.default;
		return mod.default;
	}

	async function showCourse(id: CourseId) {
		studioError = null;
		const cached = studioCache[id];
		if (cached) {
			CourseComp = cached;
			mountedId = id;
			studioPending = false;
			void revealWhenPainted();
			return;
		}
		// Drop the previous studio immediately so it cannot render under
		// data-te-studio={the new course} while the new chunk is loading.
		CourseComp = null;
		mountedId = null;
		studioPending = true;
		try {
			const comp = await loadStudio(id);
			if (get(course) !== id) return;
			CourseComp = comp;
			mountedId = id;
			studioPending = false;
			void revealWhenPainted();
		} catch (err) {
			if (get(course) !== id) return;
			console.warn(`failed to load ${id} studio`, err);
			CourseComp = null;
			mountedId = null;
			studioPending = false;
			markClassroomReady();
			studioError =
				id === 'text'
					? '文字课暂时打不开，其它课仍可用。'
					: '这一课暂时打不开，其它课仍可用。';
		}
	}

	async function ensureTextRuntime() {
		const { bootTextModel } = await import('~/courses/text/bootTextModel');
		await bootTextModel();
	}

	async function revealWhenPainted() {
		await tick();
		const attempt = (left: number) => {
			if (revealIfDiagramVisible()) return;
			if (studioError) {
				markClassroomReady();
				return;
			}
			if (left <= 0) return;
			requestAnimationFrame(() => attempt(left - 1));
		};
		requestAnimationFrame(() => attempt(24));
	}

	$: void showCourse($course);
	$: if ($course === 'text') {
		void ensureTextRuntime();
	}

	onMount(() => {
		armClassroomReveal();
		const poll = setInterval(() => {
			if (revealIfDiagramVisible()) clearInterval(poll);
		}, 80);
		applyTeachingCourseFromHash();
		void import('~/courses/loraContrast').then((m) => {
			m.maybeOpenLoraContrastFromHash();
		});
		const onHash = () => {
			applyTeachingCourseFromHash();
			void import('~/courses/loraContrast').then((m) => m.maybeOpenLoraContrastFromHash());
			if (typeof location !== 'undefined' && isFtLaterHash(location.hash)) {
				switchCourse('finetune');
			}
		};
		window.addEventListener('hashchange', onHash);
		return () => {
			window.removeEventListener('hashchange', onHash);
			clearInterval(poll);
		};
	});
</script>

<div
	class:active
	class="main-section h-full w-full"
>
	{#if studioError}
		<p class="studio-error" role="alert" data-te-studio="error">{studioError}</p>
	{:else if CourseComp && mountedId === $course}
		{#if $course === 'text'}
			<svelte:component this={CourseComp} />
		{:else}
			<div class="course-stage" data-te-studio={$course}>
				<svelte:component this={CourseComp} />
			</div>
		{/if}
	{:else if studioPending && $course !== 'text'}
		<p class="studio-pending" data-te-studio="pending">{pendingLabel}</p>
	{/if}
	{#if !$isMobile}
		<Textbook showTextCard={$isTextbookOpen} />
	{/if}
</div>

<style lang="scss">
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
	.studio-error,
	.studio-pending {
		margin: 2rem auto;
		max-width: 28rem;
		text-align: center;
		color: #4b5563;
		font-size: 0.9rem;
	}
	.studio-error {
		color: #9a3412;
	}
</style>
