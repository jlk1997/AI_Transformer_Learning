<script lang="ts">
	import { locale, messages } from '~/i18n';
	import { MUSIC_EXAMPLES, PITCH_MAX, PITCH_MIN, type Note } from '~/courses/music/melodies';
	import { attentionWeights, nextDistributions, pitchName } from '~/courses/music/model';
	import {
		musicExampleIdx,
		musicModeOverride,
		musicNotes,
		musicSampling,
		musicTemp,
		musicView,
		musicDiffStep
	} from '~/courses/music/store';
	import { musicKnobsUnlocked } from '~/store/beginnerPath';
	import MusicExplore from '~/components/courses/MusicExplore.svelte';
	import { researchDoorOpen, bootResearchDoorHooks } from '~/courses/researchDoor';
	import { bootLabSignals } from '~/courses/labSignals';
	bootLabSignals();
	bootResearchDoorHooks();

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $locale !== 'en';
	$: ex = MUSIC_EXAMPLES[$musicExampleIdx] ?? MUSIC_EXAMPLES[0];
	$: notes = $musicNotes;
	$: dist = nextDistributions(ex, notes, $musicTemp, $musicSampling, $musicModeOverride ?? undefined);
	$: topPitches = dist.pitchProbs.slice(0, 8);
	$: attn = attentionWeights(notes, dist.pitchProbs[0]?.pitch);
	$: generatedStart = ex.notes.length;
	$: lastStart = notes.length ? notes[notes.length - 1].start + notes[notes.length - 1].dur : 32;
	$: topDur = [...dist.durProbs].sort((a, b) => b.prob - a.prob)[0];
	$: nextGhost = topPitches[0] && topDur
		? { pitch: topPitches[0].pitch, name: topPitches[0].name, dur: topDur.dur, start: lastStart, prob: topPitches[0].prob }
		: null;
	$: totalBeats = Math.max(32, lastStart + Math.max(8, nextGhost?.dur ?? 8));
	$: interestPitches = notes.map((n) => n.pitch).concat(nextGhost ? [nextGhost.pitch] : []);
	$: viewMin = interestPitches.length ? Math.max(PITCH_MIN, Math.min(...interestPitches) - 2) : PITCH_MIN;
	$: viewMax = interestPitches.length ? Math.min(PITCH_MAX, Math.max(...interestPitches) + 2) : PITCH_MAX;
	$: hint = stepHint(notes, generatedStart, dist.pitchProbs[0], zh);
	let contrastOpen = false;

	function modeLabel(mode: string, isZh: boolean) {
		if (mode === 'major') return isZh ? '大调' : 'Major';
		if (mode === 'minor') return isZh ? '小调' : 'Minor';
		if (mode === 'pentatonic') return isZh ? '五声' : 'Pentatonic';
		return mode;
	}

	function closeContrast() {
		contrastOpen = false;
		if ($musicView !== 'notes') musicView.set('notes');
	}

	function stepHint(ns: Note[], base: number, top: { name: string; prob: number } | undefined, isZh: boolean) {
		if (ns.length <= base) {
			return isZh
				? '当前是示例开头。点「生成下一个音符」，卷帘会多一格，右边排行榜会更新。'
				: 'This is the example prefix. Click “Generate next note” to add one cell and refresh the ranking.';
		}
		const n = ns[ns.length - 1];
		const name = pitchName(n.pitch);
		if (isZh) {
			return `刚接上 ${name}（时值 ${n.dur}/16 拍）。右边第一名是 ${top?.name ?? '—'}（${((top?.prob ?? 0) * 100).toFixed(0)}%），但不一定抽中第一名。`;
		}
		return `Just appended ${name} (dur ${n.dur}/16). The top bar is ${top?.name ?? '—'} (${((top?.prob ?? 0) * 100).toFixed(0)}%), but the first place is not always sampled.`;
	}

	$: rows = (() => {
		const out = [];
		for (let p = viewMax; p >= viewMin; p--) out.push(p);
		return out;
	})();
	const rowH = 18;
	const leftW = 36;
	$: rollW = Math.max(360, totalBeats * 16);
	$: rollH = rows.length * rowH;

	function xOf(start: number) {
		return leftW + (start / totalBeats) * (rollW - leftW);
	}
	function wOf(dur: number) {
		return Math.max(14, (dur / totalBeats) * (rollW - leftW) - 1);
	}
	function yOf(pitch: number) {
		return (viewMax - pitch) * rowH;
	}

	$: tokens = notes.map((n, i) => {
		const hue = ((n.pitch * 17) % 360);
		return { i, hue, label: pitchName(n.pitch), attn: attn[i] ?? 0 };
	});

	// diffusion spectrogram frames: 8 steps from noise to a note-based spectrum
	const SPEC_W = 160;
	const SPEC_H = 80;
	let specEl: HTMLCanvasElement;
	$: if (specEl && $musicView === 'diffusion') paintSpec(specEl, notes, $musicDiffStep);

	function paintSpec(el: HTMLCanvasElement, ns: Note[], step: number) {
		el.width = SPEC_W;
		el.height = SPEC_H;
		const ctx = el.getContext('2d')!;
		const img = ctx.createImageData(SPEC_W, SPEC_H);
		const t = step / 8;
		const rng = (x: number, y: number) => {
			const s = Math.sin(x * 12.9898 + y * 78.233 + step * 3.1) * 43758.5453;
			return s - Math.floor(s);
		};
		for (let y = 0; y < SPEC_H; y++) {
			for (let x = 0; x < SPEC_W; x++) {
				const time = (x / SPEC_W) * Math.max(32, totalBeats);
				let energy = 0;
				for (const n of ns) {
					if (time >= n.start && time < n.start + n.dur) {
						const freqRow = SPEC_H - 1 - Math.round(((n.pitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN)) * (SPEC_H - 1));
						const d = Math.abs(y - freqRow);
						energy += Math.exp(-d * d / 8);
					}
				}
				const noise = rng(x, y);
				const v = (1 - t) * noise + t * Math.min(1, energy);
				const i = (y * SPEC_W + x) * 4;
				img.data[i] = 20 + v * 200;
				img.data[i + 1] = 10 + v * 80;
				img.data[i + 2] = 40 + v * 180;
				img.data[i + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
	}
</script>

<div class="music-studio">
	{#if $researchDoorOpen}
		<MusicExplore />
	{/if}
	<p class="disclaimer">
		{m.musicDisclaimer ??
			(zh
				? '这是预先设计的示例旋律与采样规则，用来把「下一个音符」看懂。试听是简易合成音，不会自动把整首播完。'
				: 'These are designed example melodies and sampling rules so you can see next-note prediction. Playback is a simple synth and will not auto-play a full song.')}
	</p>
	{#if contrastOpen}
		<div class="music-view" data-te-music="contrast-tabs">
			<button type="button" class:on={$musicView === 'notes'} on:click={() => musicView.set('notes')}>
				{zh ? '音符序列（主路）' : 'Note sequence'}
			</button>
			<button type="button" class:on={$musicView === 'tokens'} on:click={() => musicView.set('tokens')}>
				{zh ? '音频 token（对照）' : 'Audio tokens'}
			</button>
			<button type="button" class:on={$musicView === 'diffusion'} on:click={() => musicView.set('diffusion')}>
				{zh ? '扩散谱图（对照）' : 'Diffusion spectrogram'}
			</button>
			<button type="button" class="quiet" data-te-music="contrast-hide" on:click={closeContrast}>
				{zh ? '收起对照，先看卷帘' : 'Hide contrast, stay on the roll'}
			</button>
		</div>
	{:else}
		<p class="contrast-later">
			<button type="button" class="quiet-link" data-te-music="contrast-toggle" on:click={() => (contrastOpen = true)}>
				{zh ? '对照看法（音频 token / 扩散谱图）先收着，认完卷帘再看。' : 'Contrast views (audio tokens / diffusion) stay tucked away until you have seen the roll.'}
			</button>
		</p>
	{/if}

	<div class="cols">
		<section class="col left">
			<h3>{zh ? '条件 / 已有音符' : 'Condition / notes so far'}</h3>
			<div class="music-condition">
				<p class="prompt-line">
					<strong>{zh ? ex.labelZh : ex.labelEn}</strong>
					<span class="sub">{zh ? ex.conditionZh : ex.conditionEn}</span>
				</p>
				<p class="tiny">{zh ? ex.hintZh : ex.hintEn}</p>
				<p class="tiny" data-te-music="mode-line">
					{zh ? '当前调式：' : 'Current mode:'}
					<strong data-te-music="mode">{modeLabel($musicModeOverride ?? ex.mode, zh)}</strong>
					· {zh ? '已有' : 'notes'}
					{notes.length}
				</p>
			</div>
			<ol class="note-list">
				{#each notes as n, i}
					<li class:gen={i >= generatedStart} class:hot={(attn[i] ?? 0) > 0.18}>
						{pitchName(n.pitch)}
						<span>{n.dur}/16</span>
					</li>
				{/each}
			</ol>
		</section>

		<section class="col mid">
			<h3>{zh ? '钢琴卷帘' : 'Piano roll'}</h3>
			{#if $musicView === 'notes'}
				<p class="legend tiny" data-te-music="caption">
					{zh
						? '实心色块是已经弹出的音；虚线色块是模型正要猜的下一个音（右边第一名）。黄边表示回看时更被依赖的早先音。'
						: 'Solid blocks are notes already played. The dashed block is the next note the model is about to guess (the top bar on the right). A gold outline marks earlier notes this step looks back at.'}
				</p>
				<div class="piano-roll" data-te-music="yellow" style="height:{Math.min(260, rollH + 8)}px">
					<svg width="100%" height={rollH} viewBox={`0 0 ${rollW} ${rollH}`} preserveAspectRatio="xMinYMid meet">
						{#each rows as p, i}
							<rect
								x="0"
								y={i * rowH}
								width={rollW}
								height={rowH}
								fill={p % 12 === 0 ? '#f5f3ff' : p % 2 === 0 ? '#fafafa' : '#ffffff'}
							/>
							<text x="2" y={i * rowH + 13} font-size="10" fill="#6b7280">{pitchName(p)}</text>
						{/each}
						{#each Array(Math.floor(totalBeats / 4) + 1) as _, b}
							<line
								x1={xOf(b * 4)}
								x2={xOf(b * 4)}
								y1="0"
								y2={rollH}
								stroke={b % 4 === 0 ? '#ddd6fe' : '#f3f4f6'}
								stroke-width="1"
							/>
						{/each}
						<line
							class="playhead"
							x1={xOf(lastStart)}
							x2={xOf(lastStart)}
							y1="0"
							y2={rollH}
							stroke="#f59e0b"
							stroke-width="1.5"
							stroke-dasharray="3 3"
						/>
						{#each notes as n, i}
							{@const isNew = i === notes.length - 1 && i >= generatedStart}
							<rect
								class="note"
								class:just-fallen={isNew}
								data-te-music={isNew ? 'new-note' : 'played-note'}
								x={xOf(n.start)}
								y={yOf(n.pitch) + 1}
								width={wOf(n.dur)}
								height={rowH - 2}
								rx="3"
								fill={isNew ? '#6d28d9' : i >= generatedStart ? '#7c3aed' : '#4f46e5'}
								opacity={0.88}
								stroke={isNew ? '#f59e0b' : (attn[i] ?? 0) > 0.18 ? '#fbbf24' : '#312e81'}
								stroke-width={isNew ? 2 : (attn[i] ?? 0) > 0.18 ? 1.75 : 1}
							/>
							<text
								x={xOf(n.start) + 3}
								y={yOf(n.pitch) + 13}
								font-size="10"
								font-weight="700"
								fill="white"
								style="pointer-events:none"
							>{pitchName(n.pitch)}{isNew ? (zh ? ' 刚落下' : ' new') : ''}</text>
						{/each}
						{#if nextGhost}
							<rect
								class="next-note"
								data-te-music="next-note"
								x={xOf(nextGhost.start)}
								y={yOf(nextGhost.pitch) + 1}
								width={wOf(nextGhost.dur)}
								height={rowH - 2}
								rx="3"
								fill="#f59e0b"
								fill-opacity="0.18"
								stroke="#d97706"
								stroke-width="2"
								stroke-dasharray="5 3"
							/>
							<text
								x={xOf(nextGhost.start) + 3}
								y={yOf(nextGhost.pitch) + 13}
								font-size="10"
								font-weight="700"
								fill="#92400e"
								style="pointer-events:none"
							>{zh ? '下一个 ' : 'next '}{nextGhost.name}</text>
						{/if}
					</svg>
				</div>
				
			{:else if $musicView === 'tokens'}
				<div class="audio-tokens">
					<p class="tiny">{zh ? '把当前旋律想像成一串音频离散标签，再交给解码器还原波形。标签比「音符」更碎。' : 'Think of the melody as discrete audio tags that a codec later turns back into a waveform. Tags are finer than notes.'}</p>
					<div class="token-strip">
						{#each tokens as t}
							<span class="tok" style="background:hsl({t.hue} 70% 80%);outline: {t.attn > 0.18 ? '2px solid #f59e0b' : 'none'}"
								>{t.label}</span
							>
						{/each}
					</div>
				</div>
			{:else}
				<div class="spec-diff">
					<p class="tiny">{zh ? '对照图片课：这里也可以「从噪声谱图一步步变清晰」。点时间轴看过程，这不是主路。' : 'Like the image course, a spectrogram can go from noise to clear. This is a contrast view, not the main path.'}</p>
					<canvas bind:this={specEl} class="spec"></canvas>
					<div class="spec-ticks">
						{#each Array(9) as _, s}
							<button type="button" class:on={$musicDiffStep === s} on:click={() => musicDiffStep.set(s)}>{s}</button>
						{/each}
					</div>
				</div>
			{/if}
			<p class="music-step-hint">{hint}</p>
		</section>

		<section class="col right music-probs">
			<h3>{zh ? '下一个音符的概率' : 'Next-note probabilities'}</h3>
			<p class="tiny" data-te-music="pitch-head">
				{#if $musicKnobsUnlocked}
					{zh ? '音高排行（受意外程度和 Top-k / Top-p 影响）' : 'Pitch ranking (shaped by temperature and Top-k / Top-p)'}
				{:else}
					{zh ? '下一个音的排行' : 'Ranking of the next note'}
				{/if}
			</p>
			{#each topPitches as p, i}
				<div class="bar-row" class:top={i === 0}>
					<span>{p.name}</span>
					<div class="bar"><i style="width:{Math.round(p.prob * 100)}%"></i></div>
					<em>{(p.prob * 100).toFixed(1)}%</em>
				</div>
			{/each}
			<p class="tiny" style="margin-top:0.7rem">{zh ? '时值' : 'Duration'}</p>
			{#each dist.durProbs as d}
				<div class="bar-row">
					<span>{d.label}</span>
					<div class="bar dur"><i style="width:{Math.round(d.prob * 100)}%"></i></div>
					<em>{(d.prob * 100).toFixed(0)}%</em>
				</div>
			{/each}
		</section>
	</div>
</div>

<style lang="scss">
	.music-studio {
		height: 100%;
		width: 100%;
		padding: 0.6rem 1rem 1.25rem;
		overflow: auto;
		box-sizing: border-box;
	}
	.disclaimer {
		margin: 0 0 0.45rem;
		font-size: var(--te-fs-caption, 0.75rem);
		color: #6b7280;
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 0;
		line-height: 1.45;
	}
	.music-view {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
		align-items: center;
	}
	.music-view button {
		border: 1px solid #e5e7eb;
		background: white;
		border-radius: 999px;
		padding: 0.25rem 0.7rem;
		cursor: pointer;
		font-size: 0.82rem;
	}
	.music-view button.on {
		background: #6d28d9;
		color: white;
		border-color: #6d28d9;
	}
	.music-view button.quiet,
	.quiet-link {
		border: none;
		background: transparent;
		color: #6b7280;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.1rem 0;
		cursor: pointer;
		border-radius: 0;
		text-align: left;
		line-height: 1.4;
	}
	.quiet-link:hover,
	.music-view button.quiet:hover {
		color: #5b21b6;
		text-decoration: underline;
	}
	.contrast-later {
		margin: 0 0 0.5rem;
		max-width: 100%;
	}
	.cols {
		display: grid;
		grid-template-columns: 0.95fr 1.45fr 1.1fr;
		gap: 0.8rem;
	}
	.col {
		background: white;
		border: 1px solid #eee;
		border-radius: 0.7rem;
		padding: 0.7rem 0.8rem 0.9rem;
		min-width: 0;
		max-width: 100%;
	}
	h3 {
		margin: 0 0 0.5rem;
		font-size: 0.92rem;
		color: #5b21b6;
	}
	.sub,
	.tiny {
		display: block;
		font-size: 0.78rem;
		color: #6b7280;
		margin: 0.15rem 0;
	}
	.note-list {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.note-list li {
		font-size: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.3rem;
		padding: 0.1rem 0.35rem;
	}
	.note-list li.gen {
		background: #ede9fe;
		border-color: #c4b5fd;
	}
	.note-list li.hot {
		outline: 2px solid #f59e0b;
	}
	.piano-roll {
		overflow: auto;
		border: 1px solid #eee;
		border-radius: 0.4rem;
		background: white;
		max-width: 100%;
	}
	.piano-roll svg {
		display: block;
		max-width: 100%;
		height: auto;
	}
	.legend {
		white-space: normal;
		overflow-wrap: anywhere;
		word-break: break-word;
		max-width: 100%;
		line-height: 1.45;
		margin: 0 0 0.4rem;
	}
	.next-note {
		animation: next-pulse 1.4s ease-in-out infinite;
	}
	@keyframes next-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.65;
		}
	}
	.music-step-hint {
		margin: 0.45rem 0 0;
		font-size: 0.85rem;
		line-height: 1.45;
		color: #1f2937;
		background: #faf5ff;
		border-radius: 0.4rem;
		padding: 0.4rem 0.5rem;
	}
	.bar-row {
		display: grid;
		grid-template-columns: 3.2rem 1fr 2.6rem;
		gap: 0.3rem;
		align-items: center;
		font-size: 0.78rem;
		margin: 0.18rem 0;
	}
	.bar-row.top span {
		font-weight: 700;
		color: #5b21b6;
	}
	.bar {
		background: #f3f4f6;
		height: 0.55rem;
		border-radius: 99px;
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: #7c3aed;
	}
	.bar.dur i {
		background: #2563eb;
	}
	.token-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.4rem;
	}
	.tok {
		padding: 0.2rem 0.4rem;
		border-radius: 0.3rem;
		font-size: 0.75rem;
	}
	.spec {
		width: 100%;
		max-width: 320px;
		background: #111;
		border-radius: 0.3rem;
	}
	.spec-ticks {
		display: flex;
		gap: 0.2rem;
		margin-top: 0.3rem;
	}
	.spec-ticks button {
		flex: 1;
		border: none;
		background: #ede9fe;
		border-radius: 0.2rem;
		cursor: pointer;
		font-size: 0.7rem;
	}
	.spec-ticks button.on {
		background: #6d28d9;
		color: white;
	}
	@media (max-width: 1100px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
