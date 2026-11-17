<script lang="ts">
	import { MAP_STOPS, SAFETY_EN, SAFETY_ZH } from '~/courses/finetune/laterLabs';
	import { replaceTeachingHash } from '~/utils/teachingHash';

	export let zh = true;
	export let current: (typeof MAP_STOPS)[number]['id'] = 'course';
	export let onJump: ((hash: string) => void) | null = null;

	$: stop = MAP_STOPS.find((s) => s.id === current) || MAP_STOPS[0];

	const go = (id: typeof current, hash?: string) => {
		current = id;
		if (hash && onJump) onJump(hash);
		else if (hash) replaceTeachingHash(hash);
	};
</script>

<section class="map" data-te-map="ready">
	<p class="kicker">{zh ? '从本课到真实模型' : 'From this course to a real model'}</p>
	<h4>{zh ? '同一条路，只是规模和步骤更多' : 'The same path, at a larger scale'}</h4>
	<p class="later-see-first" data-te-later="see-first">
		{zh
			? '先对照「本课刚做过的」和「真实模型里还要多走的」，再出现工具名。'
			: 'First compare what you just did in this course with what a real model still has to do. Tool names come after.'}
	</p>

	<p class="tiny">
		{zh
			? '这不是广告墙。每站只写清：本课已经看见什么，真实系统还差什么。点一站就能对照。'
			: 'This is not an ad wall. Each stop only says what this course already showed, and what a real system still adds. Click a stop to compare.'}
	</p>
	<ol class="path">
		{#each MAP_STOPS as s, i}
			<li class:on={current === s.id}>
				<button type="button" data-te-map-stop={s.id} on:click={() => go(s.id)}>
					<span class="num">{i + 1}</span>
					{zh ? s.zh : s.en}
				</button>
				{#if i < MAP_STOPS.length - 1}<span class="arrow">→</span>{/if}
			</li>
		{/each}
	</ol>
	<div class="panel" data-te-map-panel={stop.id}>
		<p class="seen"><strong>{zh ? '本课已经看见' : 'Already seen in this course'}</strong>{zh ? stop.seenZh : stop.seenEn}</p>
		<p class="gap"><strong>{zh ? '真实系统还差' : 'Still missing in a real system'}</strong>{zh ? stop.gapZh : stop.gapEn}</p>
		{#if stop.hash}
			<button type="button" class="ghost" data-te-map-link={stop.hash} on:click={() => go(stop.id, stop.hash)}>
				{zh ? '去看这一站的课内实验' : 'Open the in-course lab for this stop'}
			</button>
		{/if}
	</div>
	<p class="tiny safety">{zh ? SAFETY_ZH : SAFETY_EN}</p>
</section>

<style>
	.map { margin: 0.2rem 0 0; color: #4c1d95; }
	.kicker { margin: 0; font-size: 0.75rem; font-weight: 700; color: #6d28d9; }
	h4 { margin: 0.2rem 0 0.35rem; font-size: 0.95rem; }
	.tiny { font-size: 0.82rem; line-height: 1.5; color: #4b5563; margin: 0.25rem 0 0.45rem; }
	.path { list-style: none; margin: 0.35rem 0 0.55rem; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
	.path li { display: flex; align-items: center; gap: 0.2rem; }
	.path button { display: flex; align-items: center; gap: 0.3rem; border: 1px solid #ddd6fe; background: white; color: #5b21b6; border-radius: 999px; padding: 0.18rem 0.55rem 0.18rem 0.22rem; cursor: pointer; font-size: 0.76rem; font-weight: 600; }
	.path li.on button { background: #7c3aed; color: white; border-color: #7c3aed; }
	.num { flex: 0 0 1.05rem; height: 1.05rem; border-radius: 99px; background: #ede9fe; color: #5b21b6; font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
	.path li.on .num { background: white; color: #6d28d9; }
	.arrow { color: #d1d5db; }
	.panel { border: 1px solid #ede9fe; border-radius: 0.5rem; padding: 0.55rem 0.65rem; background: white; }
	.panel p { margin: 0 0 0.4rem; font-size: 0.82rem; line-height: 1.5; color: #4b5563; }
	.panel strong { display: block; color: #5b21b6; font-size: 0.75rem; margin-bottom: 0.15rem; }
	.ghost { border: 1px solid #ddd6fe; background: white; color: #5b21b6; border-radius: 0.35rem; padding: 0.25rem 0.6rem; cursor: pointer; font-weight: 600; }
	.safety { color: #9a3412; }

	.later-see-first { margin: 0.35rem 0 0.8rem; font-size: 0.9rem; color: #374151; line-height: 1.55; }
</style>
