<script lang="ts">
	import { page } from '$app/stores';
	import { course, courseContrastOpen } from '~/store/course';
	import type { CourseId } from '~/store/course';
	import type { ComponentType } from 'svelte';

	$: isAboutPage = $page.url.pathname === '/about';

	const controlLoaders: Record<CourseId, () => Promise<{ default: ComponentType }>> = {
		text: () => import('~/components/InputForm.svelte'),
		image: () => import('~/components/courses/ImageControls.svelte'),
		music: () => import('~/components/courses/MusicControls.svelte'),
		finetune: () => import('~/components/courses/FinetuneControls.svelte')
	};

	const controlCache: Partial<Record<CourseId, ComponentType>> = {};
	let Controls: ComponentType | null = null;
	let controlsId: CourseId | null = null;
	let requestSeq = 0;

	async function showControls(id: CourseId) {
		const key: CourseId = id in controlLoaders ? id : 'text';
		const seq = ++requestSeq;
		const cached = controlCache[key];
		if (cached) {
			Controls = cached;
			controlsId = key;
			return;
		}
		// Drop the previous course's controls immediately so「生成下一个词」
		// cannot linger on 图片 / 音乐 / 微调 while the new chunk loads.
		Controls = null;
		controlsId = null;
		try {
			const mod = await controlLoaders[key]();
			controlCache[key] = mod.default;
			if (seq !== requestSeq) return;
			Controls = mod.default;
			controlsId = key;
		} catch (err) {
			if (seq !== requestSeq) return;
			console.warn('failed to load course controls', key, err);
			Controls = null;
			controlsId = null;
		}
	}

	$: void showControls($course);
</script>

{#if !isAboutPage}
	<div
		class="task-cluster"
		class:curtain-blocked={$courseContrastOpen}
		data-te-task="cluster"
		inert={$courseContrastOpen ? true : undefined}
		aria-hidden={$courseContrastOpen ? 'true' : undefined}
	>
		{#if Controls && controlsId === $course}
			<svelte:component this={Controls} />
		{/if}
	</div>
{/if}

<style>
	.task-cluster {
		position: relative;
		z-index: 30;
		width: 100%;
		padding: 0.15rem 0 0.2rem;
	}
	.task-cluster :global(.input-area) {
		padding-left: 0;
		padding-right: 0;
		gap: 0.55rem 0.75rem;
	}
	.task-cluster :global(.img-controls),
	.task-cluster :global(.mus-controls),
	.task-cluster :global(.ft-controls) {
		gap: 0.4rem 0.6rem;
	}
	.task-cluster.curtain-blocked {
		pointer-events: none;
	}
</style>
