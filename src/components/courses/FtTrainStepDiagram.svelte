<script lang="ts">
	import { FT_TRAIN_LOOP } from '~/courses/finetune/presets';
	import FtLossAsTable from './FtLossAsTable.svelte';
	import FtWeightMove from './FtWeightMove.svelte';
	import { BRIDGE_SENTENCE_ZH } from '~/courses/bridge';

	export let zh = true;
	export let active = 0;
	export let method = 'lora';
	export let running = false;

	let open = active;
	$: open = active;

	const methodHint = (m: string) => {
		if (m === 'freeze') return zh ? '只更新最后几层或输出层' : 'Only the last layers or the output move';
		if (m === 'full') return zh ? '几乎所有层都在更新' : 'Almost every layer is being updated';
		return zh ? '原权重不动，只更新 Q、K、V 旁边那一小块' : 'Base weights stay still; only the small add-on beside Q, K, and V is updated';
	};

	const stages = [
		{ id: 'tok', zh: '词片', en: 'Tokens' },
		{ id: 'block', zh: '块结构', en: 'Blocks' },
		{ id: 'table', zh: '概率表', en: 'Table' },
		{ id: 'loss', zh: '损失', en: 'Loss' },
		{ id: 'update', zh: '更新', en: 'Update' }
	];

	// Which pipeline stages are lit for each training beat.
	const litFor = (beat: number, stage: number) => {
		if (beat <= 0) return stage <= 2;
		if (beat === 1) return stage === 2 || stage === 3;
		if (beat === 2) return stage >= 1 && stage <= 3;
		return stage === 4;
	};
</script>

<div class="ft-loop" class:running data-te-bridge="loop">
	<p class="kicker">
		{zh ? '训练的一步（和「推进一步」同一件事）' : 'One training step — the same four beats as “Take one step”'}
	</p>
	<ol class="beats">
		{#each FT_TRAIN_LOOP as step, i}
			<li class:on={open === i}>
				<button type="button" on:click={() => (open = i)}>
					<span class="num">{i + 1}</span>
					<strong>{zh ? step.titleZh : step.titleEn}</strong>
				</button>
				{#if i < 3}<span class="arrow" aria-hidden="true">→</span>{/if}
			</li>
		{/each}
	</ol>

	<div class="pipe" aria-hidden="true">
		{#each stages as st, i}
			<div class="stage" class:on={litFor(open, i)} data-stage={st.id}>
				{#if st.id === 'tok'}
					<p class="sl">{zh ? st.zh : st.en}</p>
					<div class="chips">
						<span>残</span><span>差</span><span>连</span><span>接</span><span>…</span>
					</div>
				{:else if st.id === 'block'}
					<p class="sl">{zh ? st.zh : st.en}</p>
					<div class="mini-blocks">
						<b>{zh ? '注意力' : 'Attn'}</b>
						<b>{zh ? '前馈' : 'FFN'}</b>
						<b>{zh ? '残差' : 'Res'}</b>
						<b>{zh ? '归一化' : 'LN'}</b>
					</div>
				{:else if st.id === 'table'}
					<p class="sl">{zh ? st.zh : st.en}</p>
					<ul class="rank">
						<li>的 <i style="--p:0.22"></i></li>
						<li>了 <i style="--p:0.18"></i></li>
						<li class="true">后 <i style="--p:0.04"></i></li>
					</ul>
				{:else if st.id === 'loss'}
					<p class="sl">{zh ? st.zh : st.en}</p>
					<p class="loss-num">{zh ? '偏高' : 'High'}</p>
				{:else}
					<p class="sl">{zh ? st.zh : st.en}</p>
					<p class="upd">{methodHint(method)}</p>
				{/if}
			</div>
			{#if i < stages.length - 1}
				<span class="pipe-arrow" class:back={open === 2}>→</span>
			{/if}
		{/each}
	</div>

	<p class="body">
		{zh ? FT_TRAIN_LOOP[open].bodyZh : FT_TRAIN_LOOP[open].bodyEn}
		{#if open === 3}
			<em>{methodHint(method)}</em>
		{/if}
	</p>
	{#if open === 1}
		<FtLossAsTable {zh} compact />
	{:else if open === 2}
		<FtWeightMove {zh} compact phase="nudge" />
	{:else if open === 3}
		<FtWeightMove {zh} compact phase="after" />
	{/if}
	<p class="shared">{zh ? '贯穿例句：' : 'Shared sentence: '}「{BRIDGE_SENTENCE_ZH}」</p>
</div>

<style>
	.ft-loop {
		border: 1px dashed #ddd6fe;
		border-radius: 0.5rem;
		padding: 0.5rem 0.65rem 0.55rem;
		background: #faf8ff;
		margin: 0.45rem 0 0.5rem;
	}
	.kicker {
		margin: 0 0 0.35rem;
		font-size: 0.72rem;
		color: #6d28d9;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	ol.beats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: 0.2rem;
	}
	.beats li {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex: 1 1 8.5rem;
		min-width: 8.5rem;
		opacity: 0.72;
		transition: opacity 0.2s;
	}
	.beats li.on {
		opacity: 1;
	}
	.beats button {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		text-align: left;
		border: 1px solid #f3e8ff;
		background: white;
		border-radius: 0.4rem;
		padding: 0.3rem 0.4rem;
		cursor: pointer;
	}
	.beats li.on button {
		border-color: #7c3aed;
		box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
	}
	.running .beats li.on button {
		animation: pulse 1.4s ease-in-out infinite;
	}
	.num {
		flex: 0 0 1.2rem;
		height: 1.2rem;
		border-radius: 99px;
		background: #ede9fe;
		color: #5b21b6;
		font-size: 0.72rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.beats li.on .num {
		background: #7c3aed;
		color: white;
	}
	strong {
		display: block;
		font-size: 0.75rem;
		color: #4c1d95;
		font-weight: 700;
		line-height: 1.3;
	}
	.arrow {
		flex: 0 0 auto;
		color: #c4b5fd;
		font-size: 0.9rem;
		padding: 0 0.05rem;
	}
	.pipe {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: 0.15rem;
		margin: 0.5rem 0 0.35rem;
	}
	.stage {
		flex: 1 1 5.5rem;
		min-width: 5.2rem;
		border: 1px solid #e5e7eb;
		background: white;
		border-radius: 0.4rem;
		padding: 0.3rem 0.35rem 0.35rem;
		opacity: 0.42;
		transition: opacity 0.25s, border-color 0.25s, box-shadow 0.25s;
	}
	.stage.on {
		opacity: 1;
		border-color: #7c3aed;
		box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
	}
	.sl {
		margin: 0 0 0.2rem;
		font-size: 0.68rem;
		color: #6d28d9;
		font-weight: 700;
	}
	.chips span {
		display: inline-block;
		background: #ede9fe;
		color: #5b21b6;
		border-radius: 0.2rem;
		padding: 0.05rem 0.2rem;
		font-size: 0.7rem;
		font-weight: 700;
		margin: 0 0.08rem 0.08rem 0;
	}
	.mini-blocks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem;
	}
	.mini-blocks b {
		font-size: 0.65rem;
		background: #f3f4f6;
		border-radius: 0.2rem;
		padding: 0.1rem 0.25rem;
		font-weight: 700;
		color: #4c1d95;
	}
	.rank {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.68rem;
		color: #374151;
	}
	.rank li {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.rank i {
		display: inline-block;
		height: 0.28rem;
		width: calc(var(--p) * 4.5rem);
		background: #c4b5fd;
		border-radius: 99px;
	}
	.rank .true {
		color: #92400e;
		font-weight: 700;
	}
	.rank .true i {
		background: #d97706;
	}
	.loss-num, .upd {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		color: #9a3412;
	}
	.upd {
		color: #5b21b6;
		font-weight: 600;
		line-height: 1.3;
	}
	.pipe-arrow {
		align-self: center;
		color: #d1d5db;
		font-size: 0.85rem;
		flex: 0 0 auto;
	}
	.pipe-arrow.back {
		color: #7c3aed;
		transform: rotate(180deg);
	}
	.body {
		margin: 0.4rem 0 0;
		font-size: 0.78rem;
		color: #4b5563;
		line-height: 1.45;
	}
	em {
		display: inline;
		margin-left: 0.25rem;
		font-style: normal;
		color: #6d28d9;
		font-weight: 600;
	}
	.shared {
		margin: 0.35rem 0 0;
		font-size: 0.72rem;
		color: #6b7280;
	}
	@keyframes pulse {
		0%,
		100% {
			box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
		}
		50% {
			box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.28);
		}
	}
	@media (max-width: 720px) {
		.arrow, .pipe-arrow {
			display: none;
		}
	}
</style>
