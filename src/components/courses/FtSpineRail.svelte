<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatchSelect = createEventDispatcher<{ select: string }>();
	const dispatch = (id: string) => dispatchSelect('select', id);

	export let stops: { id: string; zh: string; en: string }[] = [];
	export let viewId = 'see';
	export let unlockedId = 'see';
	export let zh = true;
	/** Stops that stay clickable even before they are unlocked (demo path). */
	export let alsoOpen: string[] = [];
	/** Later stops that are optional, so they do not take a required 关 number. */
	export let optionalIds: string[] = [];

	const idxOf = (id: string) => {
		if (id === 'watching') return 3;
		const i = stops.findIndex((s) => s.id === id);
		return i < 0 ? 0 : i;
	};

	const requiredNum = (i: number) =>
		stops.slice(0, i + 1).filter((s) => !optionalIds.includes(s.id)).length;

	$: viewAt = idxOf(viewId);
	$: unlockedAt = idxOf(unlockedId);
	$: optionalAt = (id: string) => optionalIds.includes(id);
	$: locked = (stop: { id: string }, i: number) =>
		i > unlockedAt && !alsoOpen.includes(stop.id) && i !== viewAt;

</script>

<nav class="ft-spine" aria-label={zh ? '十分钟主线' : 'Ten-minute path'}>
	<ol>
		{#each stops as stop, i}
			<li
				class:on={viewAt === i}
				class:done={i < unlockedAt && i !== viewAt}
				class:todo={locked(stop, i)}
				class:current={viewAt === i}
				class:optional={optionalAt(stop.id)}
				data-te-ft-spine={stop.id}
				data-te-ft-spine-current={viewAt === i ? '1' : '0'}
				data-te-ft-spine-optional={optionalAt(stop.id) ? '1' : '0'}
			>
				<button type="button" disabled={locked(stop, i)} on:click={() => dispatch(stop.id)}>
					<span class="num">{optionalAt(stop.id) ? (zh ? '选' : 'Opt') : requiredNum(i)}</span>
					<span class="lab"
						>{zh ? stop.zh : stop.en}{#if optionalAt(stop.id)}<span class="opt">{zh ? '选做' : 'Optional'}</span>{/if}</span
					>
				</button>
				{#if i < stops.length - 1}<span class="arrow" aria-hidden="true">→</span>{/if}
			</li>
		{/each}
	</ol>
</nav>

<style>
	.ft-spine {
		margin: 0 0 0.65rem;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		align-items: center;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}
	button {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		color: #6b7280;
		border-radius: 999px;
		padding: 0.2rem 0.55rem 0.2rem 0.25rem;
		cursor: pointer;
		font-size: 0.78rem;
	}
	li.done button {
		background: #ecfdf5;
		border-color: #a7f3d0;
		color: #047857;
	}
	li.current button {
		background: #ede9fe;
		border-color: #c4b5fd;
		color: #5b21b6;
		font-weight: 700;
	}
	li.on button {
		box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.28);
	}
	li.todo button {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.num {
		flex: 0 0 1.15rem;
		height: 1.15rem;
		border-radius: 99px;
		background: #e5e7eb;
		color: #374151;
		font-size: 0.7rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	li.current .num,
	li.on .num {
		background: #7c3aed;
		color: white;
	}
	li.done .num {
		background: #059669;
		color: white;
	}
	li.optional button {
		border-style: dashed;
	}
	.opt {
		margin-left: 0.25rem;
		font-size: 0.66rem;
		font-weight: 700;
		color: #7c3aed;
		letter-spacing: 0.02em;
	}
	li.optional .num {
		background: #ede9fe;
		color: #5b21b6;
		font-size: 0.62rem;
	}
	li.current.optional .num,
	li.on.optional .num {
		background: #7c3aed;
		color: white;
	}
	.arrow {
		color: #d1d5db;
		font-size: 0.8rem;
		padding: 0 0.05rem;
	}
	@media (max-width: 720px) {
		.arrow {
			display: none;
		}
	}
</style>
