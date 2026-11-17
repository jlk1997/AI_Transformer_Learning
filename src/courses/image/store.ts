import { get, writable } from 'svelte/store';
import { IMAGE_PROMPTS, type ImageScheduler } from './prompts';

export type ImageMode = 'diffusion' | 'ar';

export const imageMode = writable<ImageMode>('diffusion');
export const imagePromptIdx = writable(0);
export const imageCfg = writable(7);
export const imageSteps = writable(20);
export const imageSeed = writable(1);
export const imageScheduler = writable<ImageScheduler>('euler');
export const imageStep = writable(0);
export const imagePlaying = writable(false);
export const imageArCount = writable(0);
/** Progress snapshot when the current short-path station was entered. */
export const imageStationMark = writable(0);

export function currentImageProgress() {
	return get(imageMode) === 'ar' ? get(imageArCount) : get(imageStep);
}

export function captureImageStationMark() {
	imageStationMark.set(currentImageProgress());
}


export function currentPrompt() {
	return IMAGE_PROMPTS[0];
}

export const IMAGE_SELECTORS = {
	canvas: '.image-canvas',
	prompt: '.image-prompt',
	cfg: '.cfg-control',
	steps: '.steps-control',
	seed: '.seed-control',
	scheduler: '.scheduler-control',
	denoise: '.denoise-button',
	playAll: '.play-all-button',
	vae: '.vae-panel',
	noise: '.noise-pred',
	cfgCompare: '.cfg-compare',
	mode: '.mode-switch',
	arCanvas: '.ar-canvas',
	timeline: '.image-timeline',
	condition: '.clip-condition',
	stepHint: '.step-hint'
};
