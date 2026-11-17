<script lang="ts">
	import { flashMathTarget, type MathCardModel } from '~/courses/mathWalk';

	export let card: MathCardModel;
	export let open = false;
	export let zh = true;

	let layerOpen = false;

	const onToggle = () => {
		open = !open;
		if (open && card.highlightSel) flashMathTarget(card.highlightSel);
	};

	const onShow = () => {
		if (card.highlightSel) flashMathTarget(card.highlightSel);
	};
</script>

<section
	class="math-card"
	class:open
	data-te-math-card={card.id}
	data-te-math-source={card.source}
		data-te-math-scale={card.scale ?? 'ready'}
	data-te-math="card"
>
	<button type="button" class="head" data-te-math="how" aria-expanded={open} on:click={onToggle}>
		<span class="kicker">{card.kicker || (zh ? '看见这一步怎么算' : 'See how this step is calculated')}</span>
		<strong>{card.title}</strong>
		<span class="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
	</button>
	{#if open}
		<div class="body" data-te-math="steps">
			<p class="now">{card.now}</p>
			<ol>
				{#each card.steps as s, i}
					<li>
						<p class="talk">
							<span class="n">{zh ? `第 ${i + 1} 步` : `Step ${i + 1}`}</span>
							{s.talk}
						</p>
						{#if s.expr}
							<pre class="expr">{s.expr}</pre>
						{/if}
					</li>
				{/each}
			</ol>
			<p class="points">{card.pointsTo}</p>
			<p class="myth">{card.myth}</p>
			<p class="src">{card.sourceNote}</p>
			<button type="button" class="ghost" data-te-math="point" on:click={onShow}
				>{zh ? '指到画面上这一块' : 'Point to this on the screen'}</button
			>
			{#if card.nextLayer}
				<details bind:open={layerOpen} data-te-math="next-layer">
					<summary>{card.nextLayer.title}</summary>
					<p>{card.nextLayer.body}</p>
				</details>
			{/if}
		</div>
	{/if}
</section>

<style>
	.math-card {
		border: 1px solid #ddd6fe;
		border-radius: 0.55rem;
		background: #faf8ff;
		overflow: hidden;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
		padding: 0.45rem 0.65rem;
		cursor: pointer;
	}
	.kicker {
		flex: 0 0 auto;
		font-size: 0.7rem;
		font-weight: 700;
		color: #6d28d9;
		letter-spacing: 0.02em;
	}
	.head strong {
		flex: 1 1 auto;
		font-size: 0.86rem;
		color: #1f2937;
		font-weight: 700;
		line-height: 1.35;
	}
	.chev {
		color: #7c3aed;
		font-size: 0.85rem;
	}
	.body {
		padding: 0 0.7rem 0.6rem;
		border-top: 1px solid #ede9fe;
		max-height: 11rem;
		overflow: auto;
	}
	.now,
	.points,
	.myth,
	.src {
		margin: 0.4rem 0 0.35rem;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #374151;
	}
	ol {
		margin: 0.15rem 0 0.2rem;
		padding: 0;
		list-style: none;
	}
	li {
		margin: 0.35rem 0 0;
	}
	.talk {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #1f2937;
	}
	.n {
		display: inline-block;
		font-weight: 700;
		color: #6d28d9;
		margin-right: 0.25rem;
	}
	.expr {
		margin: 0.2rem 0 0;
		padding: 0.3rem 0.45rem;
		background: white;
		border: 1px solid #ede9fe;
		border-radius: 0.3rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.72rem;
		line-height: 1.4;
		white-space: pre-wrap;
		color: #4c1d95;
	}
	.myth {
		background: #fff7ed;
		border-radius: 0.3rem;
		padding: 0.3rem 0.45rem;
	}
	.src {
		color: #6b7280;
		font-size: 0.72rem;
	}
	.ghost {
		margin-top: 0.15rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.35rem;
		padding: 0.2rem 0.5rem;
		cursor: pointer;
		color: #5b21b6;
		font-size: 0.75rem;
	}
	details {
		margin-top: 0.4rem;
		font-size: 0.78rem;
		color: #374151;
	}
	summary {
		cursor: pointer;
		color: #5b21b6;
		font-weight: 600;
	}
	details p {
		margin: 0.3rem 0 0;
		line-height: 1.45;
	}
</style>
