import { get, writable } from 'svelte/store';

export const classroomReady = writable(false);

const READY_ATTR = 'data-te-classroom';
const FALLBACK_MS = 12000;
let armed = false;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

export function markClassroomReady() {
	if (get(classroomReady)) return;
	classroomReady.set(true);
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute(READY_ATTR, 'ready');
		const cover = document.getElementById('te-opening-cover');
		if (cover) {
			cover.setAttribute('data-te-opening', 'done');
			cover.setAttribute('aria-hidden', 'true');
		}
	}
	if (fallbackTimer) {
		clearTimeout(fallbackTimer);
		fallbackTimer = null;
	}
}

export function armClassroomReveal() {
	if (armed) return;
	armed = true;
	if (typeof document !== 'undefined' && document.documentElement.getAttribute(READY_ATTR) === 'ready') {
		classroomReady.set(true);
		return;
	}
	if (typeof window === 'undefined') return;
	fallbackTimer = setTimeout(() => {
		markClassroomReady();
	}, FALLBACK_MS);
}

const DIAGRAM_SEL = [
	'[data-te-diagram]',
	'.text-studio',
	'[data-te-studio]',
	'[data-te-contrast="overlay"]',
	'[data-te-ft="now"]',
	'.ft-now',
	'.embedding',
	'[data-te-tok-label]'
].join(', ');

export function isDiagramVisible(): boolean {
	if (typeof document === 'undefined') return false;
	const nodes = document.querySelectorAll(DIAGRAM_SEL);
	for (const node of Array.from(nodes)) {
		const el = node as HTMLElement;
		const r = el.getBoundingClientRect();
		if (r.width < 32 || r.height < 24) continue;
		const cs = getComputedStyle(el);
		if (cs.visibility === 'hidden' || cs.display === 'none') continue;
		if (parseFloat(cs.opacity || '1') < 0.2) continue;
		const section = el.closest('.main-section') as HTMLElement | null;
		if (section) {
			const ps = getComputedStyle(section);
			if (parseFloat(ps.opacity || '1') < 0.5) continue;
		}
		return true;
	}
	return false;
}

export function revealIfDiagramVisible(): boolean {
	if (get(classroomReady)) return true;
	if (isDiagramVisible()) {
		markClassroomReady();
		return true;
	}
	return false;
}
