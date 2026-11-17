import { get, writable } from 'svelte/store';
import { textHasDrawnWord, temperature, sampling, inputText, selectedExampleIdx, attentionHeadIdx, blockIdx } from '~/store';
import {
	imageStep,
	imageArCount,
	imageCfg,
	imageSteps,
	imageMode,
	imagePromptIdx
} from '~/courses/image/store';
import {
	musicNotes,
	musicTemp,
	musicSampling,
	musicModeOverride,
	musicView,
	musicExampleIdx
} from '~/courses/music/store';
import { MUSIC_EXAMPLES } from '~/courses/music/melodies';

export type LabSignalId =
	| 'text-next-token'
	| 'text-temp-knob'
	| 'text-sampling-knob'
	| 'text-input-or-head'
	| 'image-cfg'
	| 'image-steps'
	| 'image-prompt'
	| 'image-denoise-step'
	| 'image-mode-ar'
	| 'music-temp'
	| 'music-sampling'
	| 'music-condition'
	| 'music-next-note'
	| 'music-view';

const STORAGE_KEY = 'te-lab-seen-signals';

function readSeen(): Record<string, boolean> {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
	} catch {
		return {};
	}
}

function writeSeen(value: Record<string, boolean>) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch {
		/* ignore quota */
	}
}

export const labSeen = writable<Record<string, boolean>>(readSeen());

labSeen.subscribe((value) => writeSeen(value));

export function markLabSignal(id: LabSignalId | string) {
	if (!id) return;
	labSeen.update((cur) => (cur[id] ? cur : { ...cur, [id]: true }));
}

export function clearLabSignal(id: string) {
	labSeen.update((cur) => {
		if (!cur[id]) return cur;
		const next = { ...cur };
		delete next[id];
		return next;
	});
}

export function hasLabSignal(id: string, seen: Record<string, boolean> = get(labSeen)): boolean {
	return !!seen[id];
}

let booted = false;

function watchChange<T>(store: { subscribe: (fn: (v: T) => void) => () => void }, onChange: (next: T, prev: T) => void) {
	let primed = false;
	let prev: T;
	store.subscribe((value) => {
		if (!primed) {
			primed = true;
			prev = value;
			return;
		}
		onChange(value, prev);
		prev = value;
	});
}

/** Start listening for honest lab phenomena. Safe to call more than once. */
export function bootLabSignals() {
	if (booted || typeof window === 'undefined') return;
	booted = true;

	let hadWord = get(textHasDrawnWord);
	textHasDrawnWord.subscribe((v) => {
		if (v && !hadWord) markLabSignal('text-next-token');
		hadWord = v;
	});

	watchChange(temperature, (next, prev) => {
		if (next !== prev) markLabSignal('text-temp-knob');
	});
	watchChange(sampling, (next, prev) => {
		if (JSON.stringify(next) !== JSON.stringify(prev)) markLabSignal('text-sampling-knob');
	});
	watchChange(inputText, (next, prev) => {
		if (String(next) !== String(prev)) markLabSignal('text-input-or-head');
	});
	watchChange(selectedExampleIdx, (next, prev) => {
		if (next !== prev) markLabSignal('text-input-or-head');
	});
	watchChange(attentionHeadIdx, (next, prev) => {
		if (next !== prev) markLabSignal('text-input-or-head');
	});
	watchChange(blockIdx, (next, prev) => {
		if (next !== prev) markLabSignal('text-input-or-head');
	});

	watchChange(imageStep, (next, prev) => {
		if (typeof next === 'number' && typeof prev === 'number' && next > prev) markLabSignal('image-denoise-step');
	});
	watchChange(imageArCount, (next, prev) => {
		if (typeof next === 'number' && typeof prev === 'number' && next > prev) markLabSignal('image-denoise-step');
	});
	watchChange(imageCfg, (next, prev) => {
		if (next !== prev) markLabSignal('image-cfg');
	});
	watchChange(imageSteps, (next, prev) => {
		if (next !== prev) markLabSignal('image-steps');
	});
	watchChange(imagePromptIdx, (next, prev) => {
		if (next !== prev) markLabSignal('image-prompt');
	});
	watchChange(imageMode, (next) => {
		if (next === 'ar') markLabSignal('image-mode-ar');
	});

	watchChange(musicTemp, (next, prev) => {
		if (next !== prev) markLabSignal('music-temp');
	});
	watchChange(musicSampling, (next, prev) => {
		if (JSON.stringify(next) !== JSON.stringify(prev)) markLabSignal('music-sampling');
	});
	watchChange(musicModeOverride, (next, prev) => {
		if (next !== prev) markLabSignal('music-condition');
	});
	watchChange(musicExampleIdx, (next, prev) => {
		if (next !== prev) markLabSignal('music-condition');
	});
	watchChange(musicView, (next, prev) => {
		if (next !== prev) markLabSignal('music-view');
	});
	watchChange(musicNotes, (next, prev) => {
		const exIdx = get(musicExampleIdx);
		const base = (MUSIC_EXAMPLES[exIdx] ?? MUSIC_EXAMPLES[0]).notes.length;
		const prevLen = Array.isArray(prev) ? prev.length : 0;
		const nextLen = Array.isArray(next) ? next.length : 0;
		if (nextLen > prevLen && nextLen > base) markLabSignal('music-next-note');
	});
}
