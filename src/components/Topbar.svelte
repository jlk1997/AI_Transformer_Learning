<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { locale, messages } from '~/i18n';
	import CourseSwitcher from '~/components/courses/CourseSwitcher.svelte';
	import { openTutorPanel, openTutorSettings } from '~/tutor/store';
	import { loadTutorSettings } from '~/tutor/api';
	import { isTextbookOpen, textbookCurrentPage, textbookCurrentPageId, textbookPreviousPage } from '~/store';
	import { getActivePages } from '~/store/course';

	$: m = $messages;
	$: t = ($messages as any).tutor || {};
	$: zh = $locale !== 'en';

	const toggleLocale = () => {
		const cur = get(locale);
		locale.set(cur === 'zh-CN' ? 'en' : 'zh-CN');
	};

	export let isActive;

	onMount(() => {
		void loadTutorSettings().catch(() => {});
	});

	const openAsk = () => {
		// Default door is the corpus ask path. Settings open only when the user
		// clicks 设置, or after a reply with needKey: true (handled in TutorPanel).
		openTutorPanel();
		void loadTutorSettings().catch(() => {});
	};

	const toggleLibrary = () => {
		isTextbookOpen.update((open) => {
			const next = !open;
			if (next) {
				const pages = getActivePages();
				textbookCurrentPage.set(0);
				textbookPreviousPage.set(-1);
				if (pages[0]) textbookCurrentPageId.set(pages[0].id);
				if (typeof window !== 'undefined') {
					window.dataLayer?.push({
						event: 'open-textbook',
						open_via: 'topbar-library',
						page_id: pages[0]?.id || ''
					});
				}
			}
			return next;
		});
	};
</script>

<div class="top-bar flex w-full items-center" class:active={isActive} data-te-topbar="chrome">
	<div class="brand-row">
		<div class="logo text-bold text-gray-700" data-click="logo">
			{m.appName}
		</div>
		<CourseSwitcher />
	</div>
	<div class="utilities">
		<button type="button" class="tutor-btn ghost" data-te-tutor="ask" on:click={openAsk}>
			{t.ask || (zh ? '问导师' : 'Ask tutor')}
		</button>
		<button type="button" class="tutor-btn ghost" data-te-tutor="settings" on:click={openTutorSettings}>
			{t.settings || (zh ? '设置' : 'Settings')}
		</button>
		<button
			type="button"
			class="tutor-btn ghost"
			data-te-book="open"
			aria-pressed={$isTextbookOpen}
			on:click={toggleLibrary}
		>
			{zh ? '书库' : 'Library'}
		</button>
		<button
			type="button"
			class="locale-toggle"
			data-te-locale="toggle"
			aria-label={zh ? '切换为英文' : 'Switch to Chinese'}
			on:click={toggleLocale}
		>
			{$locale === 'zh-CN' ? 'EN' : '中文'}
		</button>
	</div>
</div>

<style lang="scss">
	.top-bar {
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		padding: 0.3rem 1.5rem;
		background: #fff;
		border-bottom: 1px solid #f3e8ff;
	}
	.brand-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.85rem;
		min-width: 0;
		flex: 1 1 auto;
	}
	.utilities {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		flex: 0 1 auto;
		min-width: 0;
	}
	.tutor-btn {
		flex-shrink: 0;
		position: relative;
		z-index: 10050;
		pointer-events: auto;
		min-height: 2rem;
		padding: 0.2rem 0.7rem;
		border: 1px solid #c4b5fd;
		border-radius: 999px;
		background: #7c3aed;
		color: #fff;
		font-weight: 800;
		font-size: 0.82rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.tutor-btn.ghost {
		background: #f5f3ff;
		color: #5b21b6;
		border-color: #ddd6fe;
	}
	.tutor-btn {
		transition:
			background-color 180ms ease,
			color 180ms ease,
			border-color 180ms ease,
			filter 180ms ease;
	}
	.tutor-btn:hover {
		filter: brightness(1.05);
	}
	.tutor-btn:focus-visible,
	.locale-toggle:focus-visible {
		outline: 2px solid #7c3aed;
		outline-offset: 2px;
	}
	.locale-toggle {
		flex-shrink: 0;
		position: relative;
		z-index: 10050;
		pointer-events: auto;
		min-width: 2.5rem;
		min-height: 2rem;
		padding: 0.2rem 0.65rem;
		border: 1px solid #ddd6fe;
		border-radius: 999px;
		background: #f5f3ff;
		color: #5b21b6;
		font-weight: 800;
		font-size: 0.85rem;
		cursor: pointer;
		transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
	}
	.locale-toggle:hover {
		background: #ede9fe;
	}
	.logo {
		flex-shrink: 0;
		white-space: nowrap;
		font-family: 'Jersey 10', sans-serif;
		font-optical-sizing: auto;
		font-style: normal;
		font-size: 1.75rem;
		background: linear-gradient(
			to right,
			theme('colors.blue.500') 0%,
			theme('colors.purple.500') 60%
		);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
</style>
