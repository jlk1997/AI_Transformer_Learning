<script lang="ts">
	export let zh = true;
	export let baseProbs: { token: string; display?: string; prob: number }[] = [];
	export let tunedProbs: { token: string; display?: string; prob: number }[] = [];
	export let hasTuned = false;
	export let waiting = false;

	const label = (p: { token: string; display?: string }) => {
		const t = p.display ?? p.token ?? '';
		return t.replace(/\n/g, '↵').replace(/\t/g, '⇥').replace(/ /g, '␣') || '∅';
	};
	const pct = (n: number) => (n < 0.0001 ? '<0.01%' : `${(n * 100).toFixed(n >= 0.1 ? 1 : 2)}%`);
	const maxP = (rows: { prob: number }[]) => Math.max(0.0001, ...rows.map((r) => r.prob));
</script>

<div class="ft-probs">
	<p class="lead">
		{zh
			? '先看下一个词的概率怎么偏，再看下面抽出来的句子。拧温度或「只从最可能的几个里抽」，只改抽样，不是又一次微调。'
			: 'First see how the next-token probabilities shift, then read the sampled sentence below. Changing temperature, or “only from the top few”, is sampling — not another training run.'}
	</p>
	<div class="cols">
		<section>
			<h4>{zh ? '基座：下一个词更可能是谁' : 'Base: which next chip is more likely'}</h4>
			{#if waiting && !baseProbs.length}
				<p class="empty">{zh ? '正在向训练器要概率排行…' : 'Asking the trainer for the ranking…'}</p>
			{:else if !baseProbs.length}
				<p class="empty">{zh ? '还没有概率排行。训练器连上后会在这里画出基座一侧。' : 'No ranking yet. When the trainer is connected, the base side will appear here.'}</p>
			{:else}
				<ul>
					{#each baseProbs as row}
						<li>
							<span class="tok">{label(row)}</span>
							<span class="bar-wrap"><span class="bar" style="width: {(row.prob / maxP(baseProbs)) * 100}%"></span></span>
							<span class="pct">{pct(row.prob)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		<section>
			<h4>{zh ? '微调后：概率往哪边偏' : 'Fine-tuned: which way the probabilities lean'}</h4>
			{#if !hasTuned}
				<p class="empty">
					{zh
						? '这一侧现在是空的，因为还没有训练好的检查点。基座一侧的概率仍可看。请先到训练监控做一次极短跑或开训，再回来对照偏移。'
						: 'This side is empty because there is no trained checkpoint yet. You can still see the base probabilities. Do a short run or start training on the monitor, then come back to compare the shift.'}
				</p>
			{:else if waiting && !tunedProbs.length}
				<p class="empty">{zh ? '正在向训练器要微调后的概率…' : 'Asking the trainer for the fine-tuned ranking…'}</p>
			{:else if !tunedProbs.length}
				<p class="empty">{zh ? '还没有微调后的概率排行。' : 'No fine-tuned ranking yet.'}</p>
			{:else}
				<ul>
					{#each tunedProbs as row}
						<li>
							<span class="tok">{label(row)}</span>
							<span class="bar-wrap"><span class="bar tuned" style="width: {(row.prob / maxP(tunedProbs)) * 100}%"></span></span>
							<span class="pct">{pct(row.prob)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

<style>
	.ft-probs { margin: 0.35rem 0 0.7rem; }
	.lead { font-size: 0.8rem; color: #4b5563; line-height: 1.5; margin: 0 0 0.45rem; }
	.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
	h4 { margin: 0 0 0.35rem; font-size: 0.82rem; color: #5b21b6; }
	ul { list-style: none; margin: 0; padding: 0; }
	li { display: grid; grid-template-columns: 4.2rem 1fr 3.1rem; gap: 0.3rem; align-items: center; margin-bottom: 0.22rem; font-size: 0.75rem; }
	.tok { font-family: ui-monospace, Consolas, monospace; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.bar-wrap { height: 0.45rem; background: #f3f4f6; border-radius: 99px; overflow: hidden; }
	.bar { display: block; height: 100%; background: #c4b5fd; border-radius: 99px; }
	.bar.tuned { background: #7c3aed; }
	.pct { text-align: right; color: #6b7280; }
	.empty { font-size: 0.8rem; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 0.4rem; padding: 0.4rem 0.5rem; line-height: 1.45; }
	@media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
</style>
