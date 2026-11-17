<script lang="ts">
	import { locale, messages } from '~/i18n';
	import { course } from '~/store/course';
	import { textPathDone } from '~/store/beginnerPath';

	$: m = $messages as any;
	$: zh = $locale !== 'en';
	$: show = $course === 'text';
	$: compact = $textPathDone;
</script>

{#if show}
	<div class="zone-guide" class:compact data-te-zones="bar" role="region" aria-label={zh ? '三个区域' : 'Three zones'}>
		<ol class="zones">
			<li data-te-zone="left"><span class="tag">{zh ? '左边' : 'Left'}</span>{m.zoneLeft || (zh ? '已经有的词' : 'The words already there')}</li>
			<li data-te-zone="mid"><span class="tag">{zh ? '中间' : 'Middle'}</span>{m.zoneMid || (zh ? '正在计算' : 'It is computing')}</li>
			<li data-te-zone="right"><span class="tag">{zh ? '右边' : 'Right'}</span>{m.zoneRight || (zh ? '要猜的下一个词' : 'The next word it will guess')}</li>
		</ol>
	</div>
{/if}

<style>
	.zone-guide {
		position: relative;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.7rem;
		padding: 0.05rem 0 0.15rem;
		pointer-events: none;
	}
	.zones {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.45rem;
		margin: 0;
		padding: 0;
		font-size: 0.78rem;
		color: #4b5563;
	}
	.zones li {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 0;
	}
	.tag {
		font-weight: 700;
		color: #6d28d9;
	}
	.compact .zones li {
		opacity: 0.85;
	}
</style>
