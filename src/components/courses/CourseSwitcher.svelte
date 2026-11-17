<script lang="ts">
	import { locale as localeStore, messages } from '~/i18n';
	import { course, switchCourse, type CourseId } from '~/store/course';

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $localeStore !== 'en';

	const items: { id: CourseId; zh: string; en: string }[] = [
		{ id: 'text', zh: '文字', en: 'Text' },
		{ id: 'image', zh: '图片', en: 'Image' },
		{ id: 'music', zh: '音乐', en: 'Music' },
		{ id: 'finetune', zh: '微调', en: 'Fine-tune' }
	];

</script>

<nav class="course-switch" aria-label={m.courseSwitch ?? (zh ? '课轨切换' : 'Course switcher')}>
	{#each items as it}
		<button type="button" data-te-course={it.id} class:on={$course === it.id} on:click={() => switchCourse(it.id)}>
			{zh ? it.zh : it.en}
		</button>
	{/each}
</nav>

<style>
	.course-switch {
		display: flex;
		flex-shrink: 0;
		border: 1px solid #ddd6fe;
		border-radius: 999px;
		overflow: hidden;
		background: #f5f3ff;
	}
	button {
		border: none;
		background: transparent;
		padding: 0.28rem 0.7rem;
		cursor: pointer;
		font-size: 0.85rem;
		color: #5b21b6;
		font-weight: 600;
	}
	button.on {
		background: #6d28d9;
		color: white;
	}
	button.locale {
		border-left: 1px solid #ddd6fe;
		font-weight: 700;
	}
</style>
