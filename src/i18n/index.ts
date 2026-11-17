import { writable, derived } from 'svelte/store';
import { zhCN } from './zh-CN';
import { en } from './en';
import { zhCourses } from './courses-zh';
import { enCourses } from './courses-en';
import { zhFinetune } from './courses-ft-zh';
import { enFinetune } from './courses-ft-en';

export type Locale = 'zh-CN' | 'en';

const dictionaries: Record<Locale, any> = {
	'zh-CN': { ...zhCN, ...zhCourses, ...zhFinetune },
	en: { ...en, ...enCourses, ...enFinetune }
};

const saved =
	typeof localStorage !== 'undefined' ? (localStorage.getItem('te-locale') as Locale | null) : null;


const htmlLang = (loc: Locale) => (loc === 'en' ? 'en' : 'zh-CN');

const META = {
	'zh-CN': {
		title: '蚁算Transformer',
		description:
			'看见 Transformer 怎么猜下一个词。文字、图像、音乐与微调四门可交互的课，在同一间教室里学完。'
	},
	en: {
		title: '蚁算Transformer',
		description:
			'Watch a Transformer guess the next word. Four interactive courses — text, image, music, and fine-tuning — in one teaching studio.'
	}
} as const;

function setMeta(kind: 'name' | 'property', key: string, value: string) {
	const sel = kind === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`;
	let el = document.head.querySelector(sel) as HTMLMetaElement | null;
	if (!el) {
		el = document.createElement('meta');
		el.setAttribute(kind, key);
		document.head.appendChild(el);
	}
	el.setAttribute('content', value);
}

function removeMeta(kind: 'name' | 'property', key: string) {
	const sel = kind === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`;
	document.head.querySelectorAll(sel).forEach((node) => node.remove());
}

function previewImageUrl() {
	try {
		return new URL('preview/summary.png', document.baseURI).href;
	} catch {
		return 'preview/summary.png';
	}
}

function applyDocumentLocale(loc: Locale) {
	if (typeof document === 'undefined') return;
	const meta = META[loc] ?? META['zh-CN'];
	const lang = htmlLang(loc);
	document.documentElement.lang = lang;
	document.documentElement.setAttribute('data-te-locale', loc);
	document.title = meta.title;
	setMeta('name', 'title', meta.title);
	setMeta('name', 'description', meta.description);
	setMeta('property', 'og:type', 'website');
	setMeta('property', 'og:locale', loc === 'en' ? 'en_US' : 'zh_CN');
	setMeta('property', 'og:site_name', meta.title);
	setMeta('property', 'og:title', meta.title);
	setMeta('property', 'og:description', meta.description);
	setMeta('property', 'og:image', previewImageUrl());
	setMeta('property', 'og:image:alt', meta.title);
	setMeta('name', 'twitter:card', 'summary_large_image');
	setMeta('name', 'twitter:title', meta.title);
	setMeta('name', 'twitter:description', meta.description);
	setMeta('name', 'twitter:image', previewImageUrl());
	setMeta('name', 'twitter:image:alt', meta.title);
	// Drop leftover Polo Club / twitter:url aliases if a cached shell still has them.
	removeMeta('property', 'og:url');
	removeMeta('property', 'twitter:url');
	removeMeta('name', 'twitter:url');
	const twitterTitle = document.head.querySelector('meta[property="twitter:title"]');
	if (twitterTitle) twitterTitle.setAttribute('content', meta.title);
	const twitterDesc = document.head.querySelector('meta[property="twitter:description"]');
	if (twitterDesc) twitterDesc.setAttribute('content', meta.description);
	const twitterImage = document.head.querySelector('meta[property="twitter:image"]');
	if (twitterImage) twitterImage.setAttribute('content', previewImageUrl());
}

export const locale = writable<Locale>(saved === 'en' ? 'en' : 'zh-CN');

locale.subscribe((value) => {
	if (typeof localStorage !== 'undefined') localStorage.setItem('te-locale', value);
	applyDocumentLocale(value);
});

export const messages = derived(locale, ($locale) => dictionaries[$locale] ?? zhCN);

/** Lesson coach progress (0-based). */
export const coachLessonIdx = writable<number>(0);
// Verify-only hook so a walk can jump to 第2/6关 and later stations
// without clicking 推进一步.
if (typeof window !== 'undefined') {
	(window as any).__teSetCoachLessonIdx = (n: number) => coachLessonIdx.set(Number(n) || 0);
}
export const coachVisible = writable<boolean>(true);
export const mathWalkExpanded = writable<boolean>(false);
export const showEmbeddingLessonHint = writable<boolean>(false);

export type WorkbenchTab = 'path' | 'labs' | 'glossary' | 'quiz' | 'spaced';
export const workbenchOpen = writable(false);
export const workbenchTab = writable<WorkbenchTab>('path');
