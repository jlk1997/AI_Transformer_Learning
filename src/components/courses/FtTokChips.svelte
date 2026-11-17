<script lang="ts">
	export let groups: { group: string | null; items: { text: string; group?: string; incomplete?: boolean }[] }[] = [];
	export let zh = true;
	export let dropped = false;

	let open: number | null = null;

	const tidy = (tok: string) =>
		(tok || '').replace(/\n/g, '↵').replace(/\r/g, '').replace(/\t/g, '⇥').replace(/ /g, '␣');

	const isSplit = (g: (typeof groups)[number]) => !!(g.group && g.items.length > 1);

	const label = (g: (typeof groups)[number]) => {
		if (g.group) return tidy(g.group);
		const t = tidy(g.items[0]?.text || '');
		if (!t || t === '…' || t === '...') return zh ? '半截' : '…';
		return t;
	};

	const toggle = (gi: number) => {
		if (!isSplit(groups[gi])) return;
		open = open === gi ? null : gi;
	};
</script>

<div class="chips" class:dropped>
	{#each groups as g, gi}
		{#if isSplit(g)}
			<button
				type="button"
				class="chip split"
				class:on={open === gi}
				on:click={() => toggle(gi)}
				title={zh
					? `「${g.group}」被切成 ${g.items.length} 个更小的片，点开看说明`
					: `“${g.group}” was split into ${g.items.length} smaller pieces. Click to see why.`}
			>
				<span class="ch">{label(g)}</span>
				<sup>{g.items.length}</sup>
			</button>
		{:else}
			<span class="chip">{label(g)}</span>
		{/if}
	{/each}
</div>
{#if open != null && groups[open] && isSplit(groups[open])}
	<p class="note">
		{zh
			? `「${groups[open].group}」被切成 ${groups[open].items.length} 个更小的片，拼起来才是这个字。单独看每一小片往往不成字，所以这里只显示拼好的字。`
			: `“${groups[open].group}” was split into ${groups[open].items.length} smaller pieces that only make this character when put together. Each piece alone is usually unreadable, so the chip shows the assembled character.`}
	</p>
{/if}

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.05rem;
		border: 1px solid #ddd6fe;
		background: #f5f3ff;
		color: #1f1633;
		border-radius: 0.4rem;
		padding: 0.18rem 0.45rem;
		font-size: 0.95rem;
		line-height: 1.3;
		font-family: inherit;
	}
	.chip.split {
		cursor: pointer;
		border-color: #7c3aed;
		background: #ede9fe;
		font-weight: 600;
	}
	.chip.split:hover,
	.chip.split.on {
		background: #ddd6fe;
	}
	.chip.split sup {
		font-size: 0.65rem;
		font-weight: 700;
		color: #6d28d9;
		margin-left: 0.1rem;
		line-height: 1;
	}
	.chips.dropped .chip {
		background: #ffedd5;
		border-color: #fdba74;
		color: #9a3412;
		text-decoration: line-through;
	}
	.note {
		margin: 0.4rem 0 0.15rem;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #5b21b6;
		background: #f5f3ff;
		border-radius: 0.4rem;
		padding: 0.4rem 0.55rem;
	}
</style>
