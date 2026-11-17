import { get } from 'svelte/store';
import { coachLessonIdx, coachVisible } from '~/i18n';
import { inputText, inputTextExample, selectedExampleIdx, textHasDrawnWord, textLastDrawnWord } from '~/store';
import { completeTextPath, samplingOpen, textPathDone, unlockSampling } from '~/store/beginnerPath';
import { noteTutorAction } from '~/tutor/store';

/** Six short-path beats, then an invitation to the textbook library. */
export const TEXT_PATH_IDS = [
	'generate',
	'tokens',
	'attention',
	'layers',
	'residual',
	'knobs',
	'invite'
] as const;

export type TextPathId = (typeof TEXT_PATH_IDS)[number];

const FLASH: Record<TextPathId, string> = {
	generate: '[data-click="generate-btn"]',
	tokens: '[data-click="dropdown-btn"]',
	attention: '[data-te-zone="left"], .embedding .label, .embedding .cell',
	layers: '[data-click="transformer-bounding-title"], [data-click="attention-head"]',
	residual: '[data-click="residual-start"], .residual',
	knobs: '[data-te-sampling="temp"], [data-te-sampling="topk"], [data-te-sampling="panel"], [data-te-sampling="show"]',
	invite: '[data-te-path="invite"]'
};

export function textPathCount() {
	return TEXT_PATH_IDS.length;
}

export function textPathIdAt(idx: number): TextPathId {
	const n = TEXT_PATH_IDS.length;
	const i = Math.min(Math.max(idx, 0), n - 1);
	return TEXT_PATH_IDS[i];
}

export function currentTextPathId(): TextPathId {
	return textPathIdAt(get(coachLessonIdx));
}

export function flashSel(selector: string, timeout = 1800): Promise<boolean> {
	return new Promise((resolve) => {
		if (typeof document === 'undefined') {
			resolve(false);
			return;
		}
		const parts = String(selector || '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		const firstListed = (): HTMLElement | null => {
			// Honor listed order, not document order, so residual points at
			// residual instead of an earlier zone such as the right-hand table.
			for (const part of parts.length ? parts : [selector]) {
				const found = document.querySelector(part) as HTMLElement | null;
				if (!found) continue;
				const st = typeof getComputedStyle === 'function' ? getComputedStyle(found) : null;
				if (st && (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0')) continue;
				const r = found.getBoundingClientRect();
				if (r.width <= 0 || r.height <= 0) continue;
				return found;
			}
			return null;
		};
		const tryFind = (attempt: number) => {
			const el = firstListed();
			if (el) {
				el.classList.add('te-lab-flash');
				try {
					el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
				} catch {
					/* ignore */
				}
				setTimeout(() => el.classList.remove('te-lab-flash'), timeout);
				resolve(true);
				return;
			}
			if (attempt >= 8) {
				resolve(false);
				return;
			}
			setTimeout(() => tryFind(attempt + 1), 70);
		};
		setTimeout(() => tryFind(0), 40);
	});
}

export function useChineseExample() {
	const i = 5;
	const text = inputTextExample[i] || '残差连接把前面的信号加到后面。';
	selectedExampleIdx.set(i);
	// A new sentence has not yet had a word appended; keep 生成下一个词 as the first-eye primary.
	textHasDrawnWord.set(false);
	textLastDrawnWord.set('');
	inputText.set(text);
}

export function enterTextPathStep(idx: number) {
	const id = textPathIdAt(idx);
	noteTutorAction('path-step', id);
	// Collapsing the card is hide-for-view. Keep it collapsed across stations
	// until the learner expands it. resetTextPath / map / workbench still open it.
	if (id === 'tokens') {
		// Do not auto-switch the sentence; the user should click it. Flash the menu.
	}
	if (id === 'knobs') {
		unlockSampling(true);
	}
	if (id === 'invite') {
		unlockSampling(false);
		completeTextPath();
	}
	const sel = FLASH[id];
	if (sel) void flashSel(sel);
}

export function textPathNext() {
	const n = TEXT_PATH_IDS.length;
	const i = Math.min(Math.max(get(coachLessonIdx), 0), n - 1);
	if (i >= n - 1) {
		completeTextPath();
		return;
	}
	const next = i + 1;
	noteTutorAction('push-step', 'Take one step');
	coachLessonIdx.set(next);
	enterTextPathStep(next);
}

export function textPathBack() {
	const i = Math.max(0, get(coachLessonIdx) - 1);
	coachLessonIdx.set(i);
	enterTextPathStep(i);
}

export function isTextPathLast() {
	return get(coachLessonIdx) >= TEXT_PATH_IDS.length - 1;
}

export function resetTextPath() {
	coachLessonIdx.set(0);
	coachVisible.set(true);
	samplingOpen.set(false);
	enterTextPathStep(0);
}

export { textPathDone };
