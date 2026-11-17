<script>
	import { locale } from '~/i18n';
	import { course } from '~/store/course';
	import ArticleZh from './ArticleZh.svelte';
	import ArticleEn from './ArticleEn.svelte';
	import ArticleImageZh from './ArticleImageZh.svelte';
	import ArticleMusicZh from './ArticleMusicZh.svelte';
	import ArticleFinetuneZh from './ArticleFinetuneZh.svelte';
</script>

{#if $course === 'image'}
	<ArticleImageZh />
{:else if $course === 'music'}
	<ArticleMusicZh />
{:else if $course === 'finetune'}
	<ArticleFinetuneZh />
{:else if $locale === 'en'}
	<ArticleEn />
{:else}
	<ArticleZh />
{/if}
