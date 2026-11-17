<script lang="ts">
	import { locale } from '~/i18n';
	import {
		TEXT_RESEARCH_LABS,
		RESEARCH_READINGS,
		closeResearchDoor,
		flashResearchTarget,
		type ResearchLab
	} from '~/courses/researchDoor';

	export let zh = true;
	$: zh = $locale !== 'en';

	let readingId: string | null = null;

	const openLab = (item: ResearchLab) => {
		if (item.target.type === 'reading') {
			readingId = item.target.id;
			return;
		}
		readingId = null;
		flashResearchTarget(item.target.sel);
	};
</script>

<section class="text-explore" data-te-explore="ready" data-te-studio-explore="text">
	<div class="lab-dir" data-te-text="explore-labs" data-te-explore="lab-dir">
		<p class="kicker">{zh ? '本课壳子里已有的实验室' : 'Labs already in this course shell'}</p>
		<p class="tiny lead">{zh ? '点一项就能走进去。这些都在文字课里，不是另开的工业平台。' : 'Open one to walk in. These labs already live in the text course; they are not a separate industrial platform.'}</p>
		<ul>
			{#each TEXT_RESEARCH_LABS as item}
				<li>
					<button type="button" data-te-explore-lab={item.id} on:click={() => openLab(item)}>
						<strong>{zh ? item.titleZh : item.titleEn}</strong>
						<span>{zh ? item.hintZh : item.hintEn}</span>
					</button>
				</li>
			{/each}
		</ul>
		<p class="tiny ft-walk-pointer" data-te-explore="ft-walk-pointer">
			{zh
				? '微调课的「再深挖」里，已经可以走进去看过拟合曲线、检查点对照和遗忘对照。那是预置教学示意，不是工业平台。'
				: 'In the fine-tune “Go deeper” door, you can already walk in and see an overfitting curve, a checkpoint contrast, and a forgetting contrast. Those are preset teaching sketches, not an industrial platform.'}
		</p>
		<button type="button" class="ghost" data-te-explore="close" on:click={() => closeResearchDoor()}>
			{zh ? '先离开研究门口' : 'Leave the research door for now'}
		</button>
	</div>
	{#if readingId && RESEARCH_READINGS[readingId]}
		<article class="reading" data-te-explore="reading" data-te-explore-reading={readingId}>
			<h3>{zh ? RESEARCH_READINGS[readingId].titleZh : RESEARCH_READINGS[readingId].titleEn}</h3>
			<p>{zh ? RESEARCH_READINGS[readingId].bodyZh : RESEARCH_READINGS[readingId].bodyEn}</p>
		</article>
	{/if}
</section>

<style>
	.text-explore {
		position: relative;
		z-index: 8;
		margin: 0.6rem 0.75rem 0.4rem;
		max-width: 56rem;
	}
	.lab-dir {
		background: rgba(255, 255, 255, 0.97);
		border: 1px solid #ddd6fe;
		border-radius: 0.75rem;
		padding: 0.7rem 0.85rem 0.8rem;
		box-shadow: 0 10px 24px rgba(76, 29, 149, 0.12);
	}
	.kicker {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: #6d28d9;
	}
	.lead {
		margin: 0.2rem 0 0.55rem;
		font-size: 0.82rem;
		line-height: 1.45;
		color: #4b5563;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
		gap: 0.4rem;
	}
	button[data-te-explore-lab] {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		width: 100%;
		text-align: left;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 0.45rem 0.55rem;
		cursor: pointer;
	}
	button[data-te-explore-lab]:hover {
		border-color: #c4b5fd;
		background: #f5f3ff;
	}
	button[data-te-explore-lab] strong {
		font-size: 0.86rem;
		color: #1f2937;
	}
	button[data-te-explore-lab] span {
		font-size: 0.75rem;
		color: #6b7280;
		line-height: 1.4;
	}
	.ghost {
		margin-top: 0.55rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.4rem;
		padding: 0.25rem 0.6rem;
		color: #4b5563;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.reading {
		margin-top: 0.5rem;
		background: #f5f3ff;
		border-radius: 0.6rem;
		padding: 0.65rem 0.75rem;
	}
	.reading h3 {
		margin: 0 0 0.3rem;
		font-size: 0.9rem;
		color: #4c1d95;
	}
	.reading p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: #374151;
	}
	.ft-walk-pointer {
		margin: 0.55rem 0 0;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #4b5563;
	}

</style>
