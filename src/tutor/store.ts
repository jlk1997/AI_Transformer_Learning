import { get, writable } from 'svelte/store';

export type TutorRole = 'user' | 'tutor';

export type TutorMessage = {
	role: TutorRole;
	text: string;
	source?: string;
	needKey?: boolean;
};

export type TutorSettingsPublic = {
	configured: boolean;
	keyLast4: string;
	platform: 'cn' | 'overseas' | 'custom' | string;
	baseUrl: string;
	model: string;
	reasoningEffort: string;
	showThinking: boolean;
	privacyNoteZh?: string;
	privacyNoteEn?: string;
	platformDocs?: { cn: string; overseas: string };
	defaults?: { cn: string; overseas: string; model: string; reasoningEffort: string };
};

export type AskTarget = {
	label: string;
	region?: string;
	selector?: string;
	selected?: string;
};

export const tutorSettingsOpen = writable(false);
export const tutorPanelOpen = writable(false);
export const tutorMapOpen = writable(false);
export const tutorStreaming = writable(false);
export const tutorServiceDown = writable(false);
export const tutorSettings = writable<TutorSettingsPublic | null>(null);
export const tutorMessages = writable<TutorMessage[]>([]);
export const tutorDraft = writable('');
export const tutorError = writable('');
export const tutorNextHint = writable('');
export const tutorHighlightSel = writable('');
export const mathWalkRequest = writable<string | null>(null);
/** Inlined finetune walks (loss / weight). The shared dock must not swallow these. */
export const inlinedWalkRequest = writable<string | null>(null);
export const tutorTarget = writable<AskTarget | null>(null);
export const tutorThinking = writable('');
export const tutorTestResult = writable('');

export type TutorAction = { kind: string; label: string; at: number };

export const lastTutorAction = writable<TutorAction | null>(null);

export function noteTutorAction(kind: string, label: string) {
	lastTutorAction.set({ kind: String(kind || '').slice(0, 40), label: String(label || '').slice(0, 80), at: Date.now() });
}

const QA_KEY = 'te-tutor-qa';
const TAUGHT_KEY = 'te-tutor-taught';


function readQa(): { q: string; a: string }[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(QA_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.slice(-6) : [];
	} catch {
		return [];
	}
}

function writeQa(items: { q: string; a: string }[]) {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(QA_KEY, JSON.stringify(items.slice(-6)));
	} catch {
		/* this machine only; ignore quota */
	}
}

export function recentTutorQA(): { q: string; a: string }[] {
	return readQa();
}

export function rememberTutorQA(q: string, a: string, course?: string) {
	const items = readQa();
	const compactA = (a || '').replace(/\s+/g, ' ').trim().slice(0, 240);
	const row: { q: string; a: string; course?: string } = { q: (q || '').slice(0, 160), a: compactA };
	if (course) row.course = String(course).slice(0, 20);
	items.push(row);
	writeQa(items);
}

function readTaught(): string[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(TAUGHT_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.map((x: unknown) => String(x)).filter(Boolean).slice(-12) : [];
	} catch {
		return [];
	}
}

export function recentTaughtIds(): string[] {
	return readTaught();
}

export function rememberTaughtIds(ids: unknown) {
	if (!Array.isArray(ids) || !ids.length) return;
	const items = readTaught();
	for (const id of ids) {
		const s = String(id || '').trim();
		if (s && !items.includes(s)) items.push(s);
	}
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(TAUGHT_KEY, JSON.stringify(items.slice(-12)));
	} catch {
		/* ignore quota */
	}
}

export function openTutorSettings() {
	tutorMapOpen.set(false);
	tutorSettingsOpen.set(true);
}

export function openTutorPanel(opts?: { ask?: string; target?: AskTarget | null; forceSettingsIfNoKey?: boolean }) {
	tutorMapOpen.set(false);
	const settings = get(tutorSettings);
	if (opts?.forceSettingsIfNoKey && settings && !settings.configured) {
		tutorSettingsOpen.set(true);
		tutorPanelOpen.set(true);
		return;
	}
	if (opts?.ask) tutorDraft.set(opts.ask);
	if (opts?.target !== undefined) tutorTarget.set(opts.target);
	tutorPanelOpen.set(true);
}

export function closeTutorPanel() {
	tutorPanelOpen.set(false);
	tutorStreaming.set(false);
}

export function openTutorMap() {
	tutorMapOpen.update((v) => !v);
}
