import { get, writable } from 'svelte/store';
import { MUSIC_EXAMPLES, type MelodyExample, type Note } from './melodies';

export type MusicView = 'notes' | 'tokens' | 'diffusion';

export const musicExampleIdx = writable(0);
export const musicTemp = writable(0.8);
export const musicSampling = writable<{ type: 'top-k' | 'top-p'; value: number }>({ type: 'top-k', value: 5 });
export const musicNotes = writable<Note[]>(MUSIC_EXAMPLES[0].notes.map((n) => ({ ...n })));
export const musicModeOverride = writable<MelodyExample['mode'] | null>(null);
export const musicView = writable<MusicView>('notes');
export const musicSeed = writable(3);
export const musicDiffStep = writable(0);
/** Set when the learner plays the current snippet. */
export const musicHasListened = writable(false);
/** Note-count snapshot when the current short-path station was entered. */
export const musicStationMark = writable(0);

export function captureMusicStationMark() {
	musicStationMark.set(get(musicNotes).length);
}


export function resetMelody(idx: number) {
	const ex = MUSIC_EXAMPLES[idx] ?? MUSIC_EXAMPLES[0];
	musicExampleIdx.set(idx);
	musicNotes.set(ex.notes.map((n) => ({ ...n })));
	musicModeOverride.set(null);
	musicDiffStep.set(0);
	musicHasListened.set(false);
	captureMusicStationMark();
}

export const MUSIC_SELECTORS = {
	roll: '.piano-roll',
	probs: '.music-probs',
	condition: '.music-condition',
	temp: '.music-temp',
	sampling: '.music-sampling',
	play: '.music-play',
	step: '.music-step-btn',
	view: '.music-view',
	tokens: '.audio-tokens',
	diff: '.spec-diff',
	hint: '.music-step-hint'
};
