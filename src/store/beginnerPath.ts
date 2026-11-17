import { writable, get } from 'svelte/store';

const KEY = {
	sampling: 'te-sampling-unlocked',
	textDone: 'te-text-path-done',
	image: 'te-image-knobs-unlocked',
	music: 'te-music-knobs-unlocked'
};

function readFlag(key: string): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(key) === '1';
}

function writeFlag(key: string, value: boolean) {
	if (typeof localStorage === 'undefined') return;
	if (value) localStorage.setItem(key, '1');
	else localStorage.removeItem(key);
}

/** Temperature / Top-k / Top-p stay off the required path until the short text lesson unlocks them. */
export const samplingUnlocked = writable<boolean>(readFlag(KEY.sampling));
/** Whether the unlocked knobs are expanded. Default is collapsed even after unlock. */
export const samplingOpen = writable<boolean>(false);

export const textPathDone = writable<boolean>(readFlag(KEY.textDone));

export const imageKnobsUnlocked = writable<boolean>(readFlag(KEY.image));
export const imageKnobsOpen = writable<boolean>(false);

export const musicKnobsUnlocked = writable<boolean>(readFlag(KEY.music));
export const musicKnobsOpen = writable<boolean>(false);

/** Bottom long article stays collapsed so it does not fight the first-look coach. */
export const articleCollapsed = writable<boolean>(true);

samplingUnlocked.subscribe((v) => writeFlag(KEY.sampling, v));
textPathDone.subscribe((v) => writeFlag(KEY.textDone, v));
imageKnobsUnlocked.subscribe((v) => writeFlag(KEY.image, v));
musicKnobsUnlocked.subscribe((v) => writeFlag(KEY.music, v));

/** Non-empty when the user asked to show knobs before the short path unlocked them. */
export const samplingLockedHint = writable<string>('');

export function unlockSampling(open = true) {
	samplingUnlocked.set(true);
	samplingLockedHint.set('');
	if (open) samplingOpen.set(true);
}

export function completeTextPath() {
	textPathDone.set(true);
}

export function unlockImageKnobs(open = true) {
	imageKnobsUnlocked.set(true);
	if (open) imageKnobsOpen.set(true);
}

export function unlockMusicKnobs(open = true) {
	musicKnobsUnlocked.set(true);
	if (open) musicKnobsOpen.set(true);
}

export function requestShowSampling(): 'shown' | 'locked' {
	if (get(samplingUnlocked)) {
		samplingLockedHint.set('');
		samplingOpen.update((v) => !v);
		return 'shown';
	}
	samplingLockedHint.set('locked');
	return 'locked';
}

export function requestShowImageKnobs(): 'shown' | 'locked' {
	if (get(imageKnobsUnlocked)) {
		imageKnobsOpen.update((v) => !v);
		return 'shown';
	}
	return 'locked';
}

export function requestShowMusicKnobs(): 'shown' | 'locked' {
	if (get(musicKnobsUnlocked)) {
		musicKnobsOpen.update((v) => !v);
		return 'shown';
	}
	return 'locked';
}
