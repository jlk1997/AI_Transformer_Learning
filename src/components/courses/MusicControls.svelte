<script lang="ts">
	import { coachLessonIdx, locale, messages } from '~/i18n';
	import { musicKnobsOpen, musicKnobsUnlocked, requestShowMusicKnobs } from '~/store/beginnerPath';
	import { MUSIC_EXAMPLES, MUSIC_TEMPS, type MelodyExample } from '~/courses/music/melodies';
	import { nextDistributions, playNotes, sampleNext } from '~/courses/music/model';
	import {
		musicExampleIdx,
		musicModeOverride,
		musicNotes,
		musicSampling,
		musicSeed,
		musicTemp,
		resetMelody,
		musicHasListened,
		musicStationMark
	} from '~/courses/music/store';
	import { musicPages } from '~/courses/music/textbookPages';

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $locale !== 'en';
	$: knobsVisible = $musicKnobsUnlocked && $musicKnobsOpen;
	let knobLockedMsg = '';
	const onShowKnobs = () => {
		const r = requestShowMusicKnobs();
		knobLockedMsg =
			r === 'locked'
				? (zh ? '先点「生成下一个音符」，看卷帘多一格。走到「怎么抽下一个音」再来拧这些旋钮。' : 'First click “Generate next note” and watch a new cell appear. These knobs unlock on the sampling step.')
				: '';
	};
	$: ex = MUSIC_EXAMPLES[$musicExampleIdx] ?? MUSIC_EXAMPLES[0];
	$: musicLessons = ((($messages as any).musicCoach?.lessons ?? []) as { id?: string }[]);
	$: musicLessonId =
		musicLessons[Math.min(Math.max($coachLessonIdx, 0), Math.max(musicLessons.length - 1, 0))]?.id ?? '';
	$: noteNow = musicLessonId === 'map' || musicLessonId === 'step';
	$: listenNow = musicLessonId === 'listen';
	$: noteHeld =
		!noteNow ||
		($coachLessonIdx === 0 && $musicNotes.length > (ex?.notes?.length ?? 0)) ||
		($coachLessonIdx > 0 && noteNow && $musicNotes.length > $musicStationMark);
	$: listenPrimary = listenNow && !$musicHasListened;

	const bump = (id: string) => musicPages.find((p) => p.id === id)?.complete();

	const stepOnce = () => {
		const note = sampleNext(ex, $musicNotes, $musicTemp, $musicSampling, $musicSeed, $musicModeOverride ?? undefined);
		musicNotes.update((ns) => [...ns, note]);
		musicSeed.update((s) => s + 1);
		bump('next-note');
	};

	const stepBack = () => {
		if ($musicNotes.length <= ex.notes.length) return;
		musicNotes.update((ns) => ns.slice(0, -1));
	};

	const play = () => {
		playNotes($musicNotes);
		bump('read-piano-roll');
		musicHasListened.set(true);
	};
</script>

<div class="mus-controls">
	<label class="music-condition">
		<span class="lbl">{m.examples ?? (zh ? '示例旋律' : 'Example melody')}</span>
		<select class="ctrl" value={$musicExampleIdx} on:change={(e) => resetMelody(+e.currentTarget.value)}>
			{#each MUSIC_EXAMPLES as p, i}
				<option value={i}>{zh ? p.labelZh : p.labelEn}</option>
			{/each}
		</select>
	</label>
	<button type="button" class="music-step-btn" class:primary={!noteHeld} class:ghost={noteHeld} data-te-music="next-note-btn" data-te-path="next-note" on:click={stepOnce}>
		{m.musicStep ?? (zh ? '生成下一个音符' : 'Generate next note')}
	</button>
	<button type="button" class="ghost" on:click={stepBack} disabled={$musicNotes.length <= ex.notes.length}>
		{m.stepBack ?? (zh ? '回退一步' : 'Step back')}
	</button>
	<button type="button" class="music-play" class:primary={listenPrimary} class:ghost={!listenPrimary} on:click={play}>
		{m.playSnippet ?? (zh ? '试听当前片段' : 'Play current snippet')}
	</button>
	{#if knobsVisible}
	<div class="music-knobs-panel" data-te-music="knobs-panel">
	<label class="music-temp" data-te-music="knobs" title={m.tempHover ?? (zh ? '意外程度：越低越稳、越容易重复；越高越容易出现意外音。' : 'Surprise level: lower is steadier, higher brings more unexpected notes.')}>
		<span class="lbl">{m.surprise ?? (zh ? '意外程度（温度）' : 'Surprise (temperature)')}</span>
		<select
			class="ctrl"
			value={$musicTemp}
			on:change={(e) => {
				musicTemp.set(+e.currentTarget.value);
				bump('temperature-sampling');
			}}
		>
			{#each MUSIC_TEMPS as t}
				<option value={t}>{t}</option>
			{/each}
		</select>
	</label>
	<div class="music-sampling">
		<span class="lbl">{m.sampling ?? (zh ? '选音方式' : 'Sampling')}</span>
		<div class="row">
			<select
				class="ctrl"
				value={$musicSampling.type}
				on:change={(e) => { const typ = e.currentTarget.value as 'top-k' | 'top-p'; musicSampling.set({ type: typ, value: typ === 'top-k' ? 5 : 0.8 }); }}
			>
				<option value="top-k">Top-k</option>
				<option value="top-p">Top-p</option>
			</select>
			<select
				class="ctrl"
				value={$musicSampling.value}
				on:change={(e) => musicSampling.update((s) => ({ ...s, value: +e.currentTarget.value }))}
			>
				{#if $musicSampling.type === 'top-k'}
					<option value="3">k=3</option>
					<option value="5">k=5</option>
					<option value="12">k=12</option>
				{:else}
					<option value="0.3">p=0.3</option>
					<option value="0.8">p=0.8</option>
					<option value="0.95">p=0.95</option>
				{/if}
			</select>
		</div>
	</div>
	<label>
		<span class="lbl">{m.modeOverride ?? (zh ? '条件调式' : 'Condition / mode')}</span>
		<select
			class="ctrl"
			value={$musicModeOverride ?? ex.mode}
			on:change={(e) => {
				musicModeOverride.set(e.currentTarget.value as MelodyExample['mode']);
				bump('experiment-condition');
			}}
		>
			<option value="major">{zh ? '大调' : 'Major'}</option>
			<option value="minor">{zh ? '小调' : 'Minor'}</option>
			<option value="pentatonic">{zh ? '五声' : 'Pentatonic'}</option>
		</select>
	</label>
	<button type="button" class="ghost show-knobs" data-te-music="hide-knobs" on:click={() => musicKnobsOpen.set(false)}>
		{zh ? '收起旋钮' : 'Hide knobs'}
	</button>
	</div>
	{:else}
	<button type="button" class="ghost show-knobs" data-te-music="show-knobs" on:click={onShowKnobs}>
		{zh ? '显示抽音旋钮' : 'Show sampling knobs'}
	</button>
	{#if knobLockedMsg}<span class="knob-locked">{knobLockedMsg}</span>{/if}
	{/if}
</div>

<style>
	.mus-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.55rem 0.75rem;
		width: 100%;
	}
	.lbl {
		display: block;
		font-size: 0.7rem;
		color: #6b7280;
		margin-bottom: 0.1rem;
	}
	.ctrl {
		border: 1px solid #e5e7eb;
		border-radius: 0.35rem;
		padding: 0.2rem 0.35rem;
		font-size: 0.82rem;
		background: white;
	}
	.row {
		display: flex;
		gap: 0.3rem;
	}
	.primary,
	.ghost {
		border-radius: 0.4rem;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.primary {
		background: #7c3aed;
		color: white;
		border: none;
	}
	.ghost {
		background: white;
		border: 1px solid #e5e7eb;
		color: #374151;
	}
	.ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.knob-locked {
		font-size: 0.75rem;
		color: #6b7280;
		max-width: 16rem;
	}
</style>
