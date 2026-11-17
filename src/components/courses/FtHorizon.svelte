<script lang="ts">
	import FtDpoLab from './FtDpoLab.svelte';
	import FtQloraLab from './FtQloraLab.svelte';
	import FtMapPath from './FtMapPath.svelte';

	export let zh = true;
	export let open: 'map' | 'dpo' | 'qlora' | null = null;
	export let runId: string | null = null;
	export let connected = false;
	export let onJump: ((hash: string) => void) | null = null;

	const toggle = (id: typeof open) => {
		open = open === id ? null : id;
		if (typeof document === 'undefined') return;
		if (open) {
			requestAnimationFrame(() => {
				document.getElementById('ft-horizon-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		}
	};

	const jump = (hash: string) => {
		if (hash === '#ft-dpo') toggle('dpo');
		else if (hash === '#ft-qlora') toggle('qlora');
		else if (hash === '#ft-map') toggle('map');
		if (onJump) onJump(hash);
	};
</script>

<section class="horizon" data-te-horizon="ready">
	<p class="kicker">{zh ? '再往后看一眼（可动手的最小实验，不是完整平台）' : 'A later glance (hands-on minimum labs, not a full platform)'}</p>
	<p class="lead">
		{zh
			? '本课停在笔记本上的 GPT-2 + LoRA。下面三张卡片可以点开看、可以动手对照。评测卡还在上边第 4 站。不会在这台实验室上做完整对齐训练或完整 QLoRA 平台。'
			: 'This course stops at GPT-2 + LoRA on a laptop. The three cards below can be opened and tried. The eval card is still stop 4 above. This lab does not run full alignment training or a full QLoRA platform.'}
	</p>
	<div class="cards">
		<button type="button" class="card" class:on={open === 'map'} data-te-horizon="map" on:click={() => toggle('map')}>
			<strong>{zh ? '从本课到真实模型' : 'From this course to a real model'}</strong>
			<span>{zh ? '可点路径：本课已经看见什么，还差什么' : 'A clickable path: what you have seen, and what is still missing'}</span>
		</button>
		<button type="button" class="card" class:on={open === 'dpo'} data-te-horizon="dpo" on:click={() => toggle('dpo')}>
			<strong>DPO / RLHF</strong>
			<span>{zh ? '看偏好对，并可给这次 LoRA 打分' : 'See preference pairs, and score this LoRA'}</span>
		</button>
		<button type="button" class="card" class:on={open === 'qlora'} data-te-horizon="qlora" on:click={() => toggle('qlora')}>
			<strong>QLoRA</strong>
			<span>{zh ? '对照显存：为什么大模型需要它，本课用不到' : 'Memory contrast: why large models need it, and why this course does not'}</span>
		</button>
	</div>
	{#if open}
		<div id="ft-horizon-panel" class="panel" data-te-horizon-panel={open}>
			{#if open === 'map'}
				<FtMapPath {zh} onJump={jump} />
			{:else if open === 'dpo'}
				<FtDpoLab {zh} {runId} {connected} />
			{:else if open === 'qlora'}
				<FtQloraLab {zh} />
			{/if}
		</div>
	{/if}
</section>

<style>
	.horizon {
		margin: 1rem 0 0.4rem;
		padding: 0.7rem 0.8rem 0.8rem;
		border: 1px dashed #c4b5fd;
		border-radius: 0.55rem;
		background: #faf5ff;
		color: #4c1d95;
	}
	.kicker {
		margin: 0;
		font-weight: 700;
		font-size: 0.82rem;
	}
	.lead {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #5b21b6;
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}
	.card {
		flex: 1 1 10rem;
		text-align: left;
		border: 1px solid #ddd6fe;
		background: white;
		border-radius: 0.45rem;
		padding: 0.4rem 0.55rem;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.card.on {
		border-color: #7c3aed;
		background: #ede9fe;
	}
	.card strong {
		display: block;
		font-size: 0.82rem;
	}
	.card span {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.72rem;
		color: #6d28d9;
	}
	.panel {
		margin-top: 0.55rem;
		scroll-margin-top: 15rem;
	}
</style>
