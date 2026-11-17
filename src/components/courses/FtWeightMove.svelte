<script lang="ts">
	export let zh = true;
	export let compact = false;
	/** nudge = play the see-first move; after = leave the bar in the nudged state. */
	export let phase: 'nudge' | 'after' = 'nudge';
</script>

<div
	class="ft-weight-move"
	class:compact
	class:after={phase === 'after'}
	data-te-ft="weight-move"
>
	<p class="kicker">{zh ? '示意：一条权重被推了一下' : 'Sketch: a weight is nudged'}</p>
	<div class="row">
		<span class="lab">{zh ? '通向「后」的一条示意权重' : 'A sketch weight toward “后”'}</span>
		<span class="track" aria-hidden="true">
			<i class="bar before"></i>
			<i class="bar moved"></i>
			<em class="tick"></em>
		</span>
		<span class="nums">
			<span class="from">{zh ? '偏低' : 'low'}</span>
			<span class="to">{zh ? '推高一点' : 'nudged up'}</span>
		</span>
	</div>
	<p class="cap">
		{zh
			? '「后」只有 4%，这笔账大约 3.2，偏高，所以这条示意权重被轻轻推高了一点。这不是正在跑的训练平均，也不会在这里开训。'
			: '“后” has only 4%, and the tally is about 3.2 — too high — so this sketch weight is nudged up a little. This is not a live training average, and it does not start a train.'}
	</p>
</div>

<style>
	.ft-weight-move {
		border: 1px dashed #f3e8ff;
		border-radius: 0.45rem;
		padding: 0.45rem 0.55rem 0.4rem;
		background: #fffdf8;
		margin: 0.45rem 0 0;
	}
	.kicker {
		margin: 0 0 0.3rem;
		font-size: 0.72rem;
		color: #9a3412;
		font-weight: 700;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.55rem;
	}
	.lab {
		font-size: 0.75rem;
		font-weight: 700;
		color: #4c1d95;
	}
	.track {
		position: relative;
		flex: 1 1 8.5rem;
		height: 0.7rem;
		min-width: 7.5rem;
		max-width: 14rem;
		background: #f3e8ff;
		border-radius: 99px;
		overflow: visible;
	}
	.bar {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 99px;
	}
	.bar.before {
		width: 28%;
		background: #c4b5fd;
		z-index: 1;
	}
	.bar.moved {
		width: 42%;
		background: #d97706;
		z-index: 2;
		transform-origin: left center;
	}
	.ft-weight-move:not(.after) .bar.moved {
		animation: nudge 2.2s ease-out 0.2s both;
	}
	.tick {
		position: absolute;
		left: 42%;
		top: 50%;
		width: 0;
		height: 0;
		border-left: 0.38rem solid #9a3412;
		border-top: 0.28rem solid transparent;
		border-bottom: 0.28rem solid transparent;
		transform: translate(-10%, -50%);
		z-index: 3;
	}
	.ft-weight-move:not(.after) .tick {
		animation: tick-in 2.2s ease-out 0.2s both;
	}
	.nums {
		display: flex;
		gap: 0.45rem;
		font-size: 0.68rem;
		font-weight: 700;
	}
	.nums .from { color: #6d28d9; }
	.nums .to { color: #9a3412; }
	.cap {
		margin: 0.35rem 0 0;
		font-size: 0.75rem;
		color: #4b5563;
		line-height: 1.45;
	}
	.compact {
		padding: 0.35rem 0.4rem;
		margin: 0.3rem 0 0;
	}
	.compact .cap { font-size: 0.7rem; }
	@keyframes nudge {
		0% { width: 28%; }
		100% { width: 42%; }
	}
	@keyframes tick-in {
		0% { left: 28%; opacity: 0.2; }
		100% { left: 42%; opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.bar.moved, .tick { animation: none !important; }
	}
</style>
