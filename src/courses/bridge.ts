import { get } from 'svelte/store';
import { inputText, isTextbookOpen, selectedExampleIdx } from '~/store';
import { switchCourse } from '~/store/course';
import { replaceTeachingHash } from '~/utils/teachingHash';

/** The shared sentence used by the text course and the fine-tune course. */
export const BRIDGE_SENTENCE_ZH = '残差连接把前面的信号加到后面。';
export const BRIDGE_SENTENCE_EN = 'Residual connections add the earlier signal later.';

/** Index of the Chinese shared sentence in inputTextExample. English examples stay at 0–4. */
export const BRIDGE_EXAMPLE_IDX = 5;

export function goToTextCourseWithSentence() {
	selectedExampleIdx.set(BRIDGE_EXAMPLE_IDX);
	inputText.set(BRIDGE_SENTENCE_ZH);
	isTextbookOpen.set(false);
	switchCourse('text');
}

export function goToFinetuneFromText() {
	isTextbookOpen.set(false);
	switchCourse('finetune');
	// Clear the contrast hash after the course has already switched, so a hashchange
	// cannot yank the user back to the text course.
	if (typeof location !== 'undefined' && location.hash === '#lora-contrast') {
		replaceTeachingHash('');
	}
}

export function isBridgeSentence(text: string | null | undefined) {
	const t = (text || '').trim();
	return t === BRIDGE_SENTENCE_ZH || t === BRIDGE_SENTENCE_EN || t.startsWith(BRIDGE_SENTENCE_ZH.slice(0, 6));
}

export function currentInputIsBridge() {
	return isBridgeSentence(get(inputText));
}

export { goToTextCourseWithLora, PREFERRED_LORA_RUN } from '~/courses/loraContrast';
