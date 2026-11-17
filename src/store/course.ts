import { derived, get, writable } from 'svelte/store';
import { textPages, type TextbookPage } from '~/utils/textbookPages';
import { imagePages } from '~/courses/image/textbookPages';
import { musicPages } from '~/courses/music/textbookPages';
import { finetunePages } from '~/courses/finetune/textbookPages';
import { coachLessonIdx } from '~/i18n';
import { isTextbookOpen, textbookCurrentPage, textbookCurrentPageId, textbookPreviousPage } from '~/store';
import { courseFromResearchHash, isFtLaterHash, replaceTeachingHash } from '~/utils/teachingHash';

export type CourseId = 'text' | 'image' | 'music' | 'finetune';

function readSavedCourse(): CourseId {
	if (typeof localStorage === 'undefined') return 'text';
	const v = localStorage.getItem('te-course');
	return v === 'image' || v === 'music' || v === 'finetune' ? v : 'text';
}

function courseFromTeachingHash(): CourseId | null {
	if (typeof location === 'undefined') return null;
	if (isFtLaterHash(location.hash)) return 'finetune';
	return courseFromResearchHash(location.hash);
}

export const course = writable<CourseId>(courseFromTeachingHash() ?? readSavedCourse());

/** Switch to the course a teaching hash belongs to, without waiting for the text-course tokenizer. */
export function applyTeachingCourseFromHash() {
	const next = courseFromTeachingHash();
	if (!next) return;
	if (get(course) === next) return;
	// Deep links should land on the lab, not the first-switch contrast overlay.
	courseContrastOpen.set(false);
	courseContrastTarget.set(null);
	course.set(next);
}

export const activeTextbookPages = derived(
	course,
	($course): TextbookPage[] =>
		$course === 'image' ? imagePages : $course === 'music' ? musicPages : $course === 'finetune' ? finetunePages : textPages
);

export function getActivePages(): TextbookPage[] {
	const c = get(course);
	return c === 'image' ? imagePages : c === 'music' ? musicPages : c === 'finetune' ? finetunePages : textPages;
}

/** First-switch contrast overlay (per destination course). */
export const courseContrastOpen = writable(false);
export const courseContrastTarget = writable<Exclude<CourseId, 'text'> | null>(null);

export function shouldShowContrast(target: Exclude<CourseId, 'text'>): boolean {
	if (typeof localStorage === 'undefined') return true;
	return localStorage.getItem(`te-course-contrast-${target}`) !== 'seen';
}

export function markContrastSeen(target: Exclude<CourseId, 'text'>) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(`te-course-contrast-${target}`, 'seen');
}

const coachIdxByCourse: Record<CourseId, number> = { text: 0, image: 0, music: 0, finetune: 0 };
let lastCourse: CourseId | null = null;

let primed = false;
course.subscribe((value) => {
	if (typeof localStorage !== 'undefined') localStorage.setItem('te-course', value);
	const pages = getActivePages();
	if (!primed) {
		primed = true;
		lastCourse = value;
		const id = get(textbookCurrentPageId);
		if (pages[0] && !pages.some((p) => p.id === id)) {
			textbookCurrentPage.set(0);
			textbookPreviousPage.set(-1);
			textbookCurrentPageId.set(pages[0].id);
		}
		if (value === 'finetune') {
			isTextbookOpen.set(false);
			// Contrast overlay already hides the coach. Do not clear a
			// same-visit hide-for-view (slim bar) by forcing coachVisible.
		}
		return;
	}
	if (lastCourse) {
		coachIdxByCourse[lastCourse] = get(coachLessonIdx);
	}
	coachLessonIdx.set(coachIdxByCourse[value] ?? 0);
	lastCourse = value;
	textbookCurrentPage.set(0);
	textbookPreviousPage.set(-1);
	if (pages[0]) textbookCurrentPageId.set(pages[0].id);
	// Switching courses must not keep the previous textbook overlay
	// covering the new first eye. Do not auto-open the new course's book.
	isTextbookOpen.set(false);
	// Keep hide-for-view (slim bar) across course switches in the same visit.
	// Hard refresh still starts expanded because coachVisible defaults to true
	// and is not persisted. The contrast curtain hides the coach via
	// courseContrastOpen, not by forcing this store.
});

export function switchCourse(next: CourseId) {
	const prev = get(course);
	if (next === prev) return;
	// Teaching hashes belong to one course; leaving must not keep #ft-depth pinning the user back.
	if (typeof location !== 'undefined') {
		const h = location.hash;
		if (next !== 'finetune' && isFtLaterHash(h)) {
			replaceTeachingHash('');
		}
		if (next !== 'text' && h === '#lora-contrast') {
			replaceTeachingHash('');
		}
	}
	// Always close a leftover contrast overlay so it cannot block the course switcher or locale toggle.
	courseContrastOpen.set(false);
	courseContrastTarget.set(null);
	if (next !== 'text' && shouldShowContrast(next)) {
		courseContrastTarget.set(next);
		courseContrastOpen.set(true);
	}
	course.set(next);
}
