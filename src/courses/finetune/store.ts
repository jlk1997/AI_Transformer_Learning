import { get, writable } from 'svelte/store';
import { coachLessonIdx, locale } from '~/i18n';
import { stationIndexById } from '~/tutor/pathMap';
import {
	cloneRecipe,
	DEFAULT_PROMPTS,
	FT_TRAIN_LOOP,
	panelForSelector,
	recommendedFor,
	RECOMMENDED,
	type FtPanel,
	type Recipe
} from './presets';
import { TEXT_PACKS, type PackId } from './packs';
import {
	fetchHealth,
	listRuns,
	type CompareItem,
	type Health,
	type RunSummary,
	type TokenPreview,
	type TrainEvent
} from './api';

export type Sample = { id: string; text: string };

let sampleSeq = 1;
export function newSample(text = ''): Sample {
	return { id: `s${Date.now().toString(36)}-${sampleSeq++}`, text };
}

export const finetuneExplainStep = writable(0);
export const finetunePanel = writable<FtPanel>('explain');
export const finetuneAdvanced = writable(false);
export const finetuneRecipe = writable<Recipe>(cloneRecipe(RECOMMENDED));
export const finetuneSamples = writable<Sample[]>([]);
export const finetunePackId = writable<PackId | null>(null);
export const finetuneHealth = writable<Health | null>(null);
export const finetuneConnected = writable(false);
export const finetuneRunId = writable<string | null>(null);
export const finetuneStatus = writable<'idle' | 'running' | 'paused' | 'stopping' | 'done' | 'error'>('idle');
export const finetuneLogs = writable<string[]>([]);
export const finetuneMetrics = writable<TrainEvent[]>([]);
export const finetuneError = writable<string | null>(null);
export const finetuneRuns = writable<RunSummary[]>([]);
export const finetuneCompareIds = writable<[string | null, string | null]>([null, null]);
export const finetunePrompts = writable<string[]>(DEFAULT_PROMPTS.map((p) => p.zh));
export const finetuneGenTemp = writable(RECOMMENDED.genTemp);
export const finetuneGenTopK = writable(RECOMMENDED.genTopK);
export const finetuneGenTopP = writable(RECOMMENDED.genTopP);
export const finetuneGenMaxLen = writable(RECOMMENDED.genMaxLen);
export const finetuneGenerations = writable<CompareItem[]>([]);
export const finetuneTokenPreview = writable<(TokenPreview | { count: number; approx: true; tokens?: string[] })[]>(
	[]
);
export const finetuneBaselineSaved = writable(false);
export const finetuneComparedAfter = writable(false);
export const finetuneJustFinished = writable(false);
export const finetuneSawLine = writable(false);
export const finetuneSawLoss = writable(false);
export const finetuneSawMethod = writable(false);
export const finetuneExploreOpen = writable(false);
export type SpineId = 'see' | 'preview' | 'baseline' | 'train' | 'watching' | 'compare' | 'loss' | 'method' | 'explore';
export const finetuneSpineView = writable<SpineId>('see');

export const FT_SPINE_STOPS = [
	{ id: 'see' as const, zh: '分清', en: 'See the line' },
	{ id: 'preview' as const, zh: '看见分词', en: 'See tokens' },
	{ id: 'baseline' as const, zh: '存基线', en: 'Save a baseline' },
	{ id: 'train' as const, zh: '极短跑', en: 'Short run' },
	{ id: 'compare' as const, zh: '看见差别', en: 'See the change' },
	{ id: 'loss' as const, zh: '损失是什么', en: 'What loss is' },
	{ id: 'method' as const, zh: '改哪一块', en: 'What we change' },
	{ id: 'explore' as const, zh: '再深挖', en: 'Go deeper' }
];

export function spineIndex(id: string): number {
	if (id === 'watching') return 3;
	const i = FT_SPINE_STOPS.findIndex((s) => s.id === id);
	return i < 0 ? 0 : i;
}

export function panelForSpine(id: SpineId): FtPanel {
	if (id === 'see' || id === 'loss' || id === 'method') return 'explain';
	if (id === 'preview') return 'data';
	if (id === 'baseline' || id === 'compare') return 'play';
	if (id === 'train' || id === 'watching') return 'train';
	return 'recipe';
}

export function setSpineView(id: SpineId) {
	finetuneSpineView.set(id);
	if (id === 'explore') {
		// The deeper path is a spine stop, not the workshop tab bar.
		finetuneExploreOpen.set(false);
	} else {
		finetunePanel.set(panelForSpine(id));
	}
	if (id !== 'see') finetuneSawLine.set(true);
	syncFinetuneCoachToSpine(id);
}


const SPINE_TO_COACH: Record<SpineId, string> = {
	see: 'map',
	preview: 'pack',
	baseline: 'baseline',
	train: 'start',
	watching: 'start',
	compare: 'compare',
	loss: 'loss',
	method: 'method',
	explore: 'explore'
};

const MAIN_LINE: SpineId[] = ['see', 'preview', 'baseline', 'train', 'compare', 'loss', 'method', 'explore'];

export function isFinetuneBeatsLevel(view?: SpineId): boolean {
	const id = view ?? get(finetuneSpineView);
	return id === 'loss';
}

export function syncFinetuneCoachToSpine(id: SpineId) {
	const station = SPINE_TO_COACH[id];
	if (!station) return;
	coachLessonIdx.set(stationIndexById('finetune', station));
}

function lineIndex(id: SpineId): number {
	const key = id === 'watching' ? 'train' : id;
	const i = MAIN_LINE.indexOf(key);
	return i < 0 ? 0 : i;
}

export function lastEarnedMainSpine(): SpineId {
	// Method / explore are not "earned" by an early alsoOpen / hook jump.
	// Trainer history (old runs on this machine) must not skip the short path:
	// hasFinishedRun can be true from a previous day even when this visit is
	// still on 看见分词 / 存基线.
	if (get(finetuneSawLoss)) return 'loss';
	if (get(finetuneComparedAfter)) return 'compare';
	if (get(finetuneBaselineSaved)) return 'baseline';
	if (get(finetuneTokenPreview).length > 0 || get(finetuneSawLine)) return 'preview';
	return 'see';
}

export function rewindFinetuneMain() {
	const view = get(finetuneSpineView);
	if (view === 'explore') {
		// Early 再深挖 must not walk a beginner into method/loss.
		setSpineView(get(finetuneSawMethod) ? 'method' : lastEarnedMainSpine());
		return;
	}
	if (view === 'method') {
		setSpineView(get(finetuneSawLoss) ? 'loss' : lastEarnedMainSpine());
		return;
	}
	const next = MAIN_LINE[Math.max(0, lineIndex(view) - 1)];
	setSpineView(next);
}

export function canRewindFinetuneMain(): boolean {
	return lineIndex(get(finetuneSpineView)) > 0;
}

export function canAdvanceFinetuneMain(): boolean {
	const view = get(finetuneSpineView);
	if (view === 'see') return true;
	if (view === 'preview') return get(finetuneTokenPreview).length > 0;
	if (view === 'baseline') return get(finetuneBaselineSaved);
	if (view === 'train' || view === 'watching') return hasFinishedRun(get(finetuneStatus), get(finetuneRuns));
	if (view === 'compare') return get(finetuneComparedAfter);
	if (view === 'loss' || view === 'method') return true;
	return false;
}

export function advanceFinetuneMain(delta: number) {
	if (!delta) return;
	const view = get(finetuneSpineView);
	if (delta < 0) {
		rewindFinetuneMain();
		return;
	}
	// Forward: move the spine, now-do card, and coach together.
	// Never start a train or write a baseline / comparison from this button.
	if (view === 'see') {
		setSpineView('preview');
		return;
	}
	if (view === 'preview') {
		setSpineView('baseline');
		return;
	}
	if (view === 'baseline') {
		if (get(finetuneBaselineSaved)) setSpineView('train');
		return;
	}
	if (view === 'train' || view === 'watching') {
		if (hasFinishedRun(get(finetuneStatus), get(finetuneRuns))) setSpineView('compare');
		return;
	}
	if (view === 'compare') {
		if (get(finetuneComparedAfter)) setSpineView('loss');
		return;
	}
	if (view === 'loss') {
		setSpineView('method');
		return;
	}
	if (view === 'method') {
		setSpineView('explore');
	}
}


export function loadPack(id: PackId) {
	const pack = TEXT_PACKS[id];
	finetunePackId.set(id);
	finetuneSamples.set(pack.texts.map((t) => newSample(t)));
}

export function restoreRecommended() {
	const method = get(finetuneRecipe).method;
	finetuneRecipe.set(recommendedFor(method));
	finetuneAdvanced.set(false);
}

export function applyMethod(method: Recipe['method']) {
	finetuneRecipe.update((r) => {
		const next = recommendedFor(method);
		// keep data-related and generation knobs already set
		next.valRatio = r.valRatio;
		next.testRatio = r.testRatio;
		next.genTemp = r.genTemp;
		next.genTopK = r.genTopK;
		next.genTopP = r.genTopP;
		next.genMaxLen = r.genMaxLen;
		next.base = r.base;
		return next;
	});
}

export function splitSamples(samples: Sample[], ratio: number, seed: number, testRatio = 0.1) {
	const empty = { train: [] as Sample[], val: [] as Sample[], test: [] as Sample[] };
	const clean = samples.filter((s) => s.text.trim());
	if (!clean.length) return empty;
	let x = seed >>> 0 || 1;
	const rng = () => {
		x ^= x << 13;
		x >>>= 0;
		x ^= x >> 17;
		x ^= x << 5;
		x >>>= 0;
		return (x >>> 0) / 4294967296;
	};
	const idx = clean.map((_, i) => i);
	for (let i = idx.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[idx[i], idx[j]] = [idx[j], idx[i]];
	}
	const nTest =
		testRatio > 0 && clean.length >= 3
			? Math.max(1, Math.min(clean.length - 2, Math.round(clean.length * testRatio)))
			: 0;
	const nVal = Math.max(1, Math.min(clean.length - 1 - nTest, Math.round(clean.length * ratio)));
	const testIds = new Set(idx.slice(0, nTest));
	const valIds = new Set(idx.slice(nTest, nTest + nVal));
	return {
		train: clean.filter((_, i) => !valIds.has(i) && !testIds.has(i)),
		val: clean.filter((_, i) => valIds.has(i)),
		test: clean.filter((_, i) => testIds.has(i))
	};
}

export function prepareFinetuneFlash(selector: string) {
	const panel = panelForSelector(selector);
	if (panel === 'recipe' || panel === 'archive') finetuneExploreOpen.set(true);
	if (panel !== 'explain') finetunePanel.set(panel);
}

export function stepExplain(delta: number) {
	const n = FT_TRAIN_LOOP.length;
	finetuneExplainStep.update((s) => Math.max(0, Math.min(n - 1, s + delta)));
}

export function appendLog(line: string) {
	finetuneLogs.update((xs) => [...xs.slice(-400), line]);
}

export function applyTrainEvent(ev: TrainEvent) {
	if (ev.message) appendLog(ev.message);
	if (ev.type === 'metric' || ev.trainLoss != null || ev.valLoss != null) {
		finetuneMetrics.update((xs) => [...xs, ev]);
	}
	if (ev.status) finetuneStatus.set(ev.status as any);
	if (ev.type === 'error') {
		finetuneError.set(ev.message || '训练出错');
		finetuneStatus.set('error');
	}
	if (ev.type === 'done') {
		finetuneStatus.set('done');
		finetuneJustFinished.set(true);
		setSpineView('compare');
	}
	if (ev.runId) finetuneRunId.set(ev.runId);
}

let healthTimer: ReturnType<typeof setInterval> | null = null;

export async function refreshHealth() {
	const h = await fetchHealth();
	finetuneHealth.set(h);
	finetuneConnected.set(!!h?.ok);
	if (h?.ok) {
		const runs = await listRuns();
		finetuneRuns.set(runs);
	}
	return h;
}

export function startHealthLoop() {
	if (healthTimer) return;
	refreshHealth();
	healthTimer = setInterval(() => {
		refreshHealth();
	}, 4000);
}

export function stopHealthLoop() {
	if (healthTimer) clearInterval(healthTimer);
	healthTimer = null;
}

// Load a modest default pack so the desk is not empty.
if (typeof window !== 'undefined' && get(finetuneSamples).length === 0) {
	loadPack('notes');
}


export type GuideStep = {
	id: SpineId;
	panel: FtPanel;
	sel: string;
	titleZh: string;
	titleEn: string;
	whyZh: string;
	whyEn: string;
	goZh: string;
	goEn: string;
};

function hasFinishedRun(
	status: string,
	runs: RunSummary[]
): boolean {
	if (status === 'done') return true;
	return runs.some((r) => r.status === 'done' || r.stoppedReason === 'completed');
}

export function computeGuide(input: {
	sawLine: boolean;
	previewed: boolean;
	baselineSaved: boolean;
	status: string;
	runs: RunSummary[];
	compared: boolean;
	sawLoss?: boolean;
	sawMethod?: boolean;
}): GuideStep {
	if (!input.sawLine) {
		return {
			id: 'see',
			panel: 'explain',
			sel: '.ft-contrast-lead',
			titleZh: '先看这句会被切成哪些词片',
			titleEn: 'First see how this sentence is cut into chips',
			whyZh: '刚才那台猜词机还在。拧温度只改怎么抽。这一课才会用你喂的文字改权重。先看见这句被切开的样子，后面的名字先不用记。',
			whyEn: 'The guessing machine is still here. Temperature only changes how a word is drawn. This course is the one that changes weights with the text you feed it. First see how this sentence is cut — later names can wait.',
			goZh: '预览分词',
			goEn: 'Preview tokens'
		};
	}
	if (!input.previewed) {
		return {
			id: 'preview',
			panel: 'data',
			sel: '.ft-tokenize',
			titleZh: '看见文本会被切成哪些词片',
			titleEn: 'See how the text is split into token chips',
			whyZh: '训练真正吃进去的是词片，不是整句汉字。先看原句，再看能读的字块。预览不会开训。',
			whyEn: 'Training sees token chips, not whole sentences. Read the original sentence first, then the readable chips. Previewing does not start training.',
			goZh: '预览分词',
			goEn: 'Preview tokens'
		};
	}
	if (!input.baselineSaved) {
		return {
			id: 'baseline',
			panel: 'play',
			sel: '.ft-baseline',
			titleZh: '先存下微调前的续写',
			titleEn: 'Save a before-training continuation',
			whyZh: '没有「前」，开训后就没法对照。要训练器真正写出句子才算存好。',
			whyEn: 'Without a before, you cannot compare after. A real continuation from the trainer counts as saved.',
			goZh: '存下微调前的续写',
			goEn: 'Save the before-training continuation'
		};
	}
	if (input.status === 'running') {
		return {
			id: 'watching',
			panel: 'train',
			sel: '.ft-curve',
			titleZh: '极短跑正在进行，同时看两条曲线',
			titleEn: 'The short run is going — watch both curves',
			whyZh: '训练损失越低不一定越好。若验证损失变差，多半是过拟合。不要只看风扇是不是在转。',
			whyEn: 'A lower training loss is not always better. If validation loss gets worse, that is often overfitting. Do not just watch whether the fan is spinning.',
			goZh: '看两条曲线',
			goEn: 'Watch both curves'
		};
	}
	if (input.status === 'paused') {
		return {
			id: 'watching',
			panel: 'train',
			sel: '.ft-resume',
			titleZh: '训练已暂停，可继续或先看曲线',
			titleEn: 'Training is paused — resume or watch the curves',
			whyZh: '可以从检查点继续，不必从头再来。多训几轮也不一定更好。',
			whyEn: 'You can resume from the checkpoint instead of starting over. More passes are not automatically better.',
			goZh: '回到曲线这边',
			goEn: 'Back to the curves'
		};
	}
	if (!hasFinishedRun(input.status, input.runs)) {
		return {
			id: 'train',
			panel: 'train',
			sel: '.ft-short',
			titleZh: '做一次极短跑，确认循环能跑通',
			titleEn: 'Do a short run and confirm the loop works',
			whyZh: '只有开训才会改权重。先跑两步即可，不必一开始就训很久。只看着按钮，还不能算做过。',
			whyEn: 'Only starting a run changes the weights. Two steps are enough to confirm the loop — you do not need a long run yet. Looking at the button is not enough.',
			goZh: '先跑 2 步，确认能通',
			goEn: 'Run 2 steps to confirm it works'
		};
	}
	if (!input.compared) {
		return {
			id: 'compare',
			panel: 'play',
			sel: '.ft-compare',
			titleZh: '用同一批提示词看前后差别',
			titleEn: 'Compare the same prompts before and after',
			whyZh: '损失只说明数字在动。要看续写有没有跟着语料走。两段话像不像不是完整评测。',
			whyEn: 'Loss only says the numbers moved. The continuations show whether the voice followed the corpus. Two snippets looking alike is not a full evaluation.',
			goZh: '对照同一批提示词的前后续写',
			goEn: 'Compare the same prompts before and after'
		};
	}
	if (!input.sawLoss) {
		return {
			id: 'loss',
			panel: 'explain',
			sel: '.ft-loss-path',
			titleZh: '损失就是概率表上那一行',
			titleEn: 'Loss is a row on the probability table',
			whyZh: '刚才看见了续写有没有变。现在把「损失」指回那张概率表：正确答案那一行够不够高。还不要记公式。',
			whyEn: 'You have seen whether the continuation changed. Now point “loss” back at the probability table: did the correct next chip get enough probability? No formula yet.',
			goZh: '看损失怎样对着概率表',
			goEn: 'See how loss maps to the table'
		};
	}
	if (!input.sawMethod) {
		return {
			id: 'method',
			panel: 'explain',
			sel: '.ft-method-path',
			titleZh: '把方法画在同一套块上',
			titleEn: 'Draw the method on the same blocks',
			whyZh: '要改权重，不必一次改全部。本课默认在旁边加一小块，这一小块就叫 LoRA。看懂图之后，可以带上它回文字课对照桑基图。',
			whyEn: 'You do not have to change every weight. The default in this course is to add a small piece beside the original — that piece is called LoRA. After you see the diagram, you can take it back to the text course and contrast it on the Sankey.',
			goZh: '看改的是哪一块',
			goEn: 'See which piece we change'
		};
	}
	return {
		id: 'explore',
		panel: 'train',
		sel: '.ft-depth',
		titleZh: '再深挖：看清差别从哪里来',
		titleEn: 'Go deeper: see where the difference comes from',
		whyZh: '过拟合、检查点、遗忘、评测卡和最小问答格式，现在都在这条主线上。先看图和对照，不必自己翻工作室标签。',
		whyEn: 'Overfitting, checkpoints, forgetting, the eval card, and a minimal Q/A format are now on this path. Start with the figures and contrasts; you do not have to hunt through workshop tabs.',
		goZh: '去看过拟合、检查点、遗忘、评测和问答',
		goEn: 'See overfitting, checkpoints, forgetting, eval, and Q/A'
	};
}

export type FtNoticeTone = 'info' | 'warn' | 'ok';
export type FtNotice = { tone: FtNoticeTone; text: string } | null;
export const finetuneNotice = writable<FtNotice>(null);

export function setFinetuneNotice(tone: FtNoticeTone, text: string) {
	finetuneNotice.set({ tone, text });
}

export function clearFinetuneNotice() {
	finetuneNotice.set(null);
}

export function scrollFinetuneIntoView(el: Element | null) {
	if (!el || typeof document === 'undefined') return;
	const node = el as HTMLElement;
	const scrollParentOf = (el: HTMLElement): HTMLElement | null => {
		let p = el.parentElement;
		while (p) {
			const st = getComputedStyle(p);
			const oy = st.overflowY;
			if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight + 1) {
				return p;
			}
			p = p.parentElement;
		}
		return null;
	};
	const place = () => {
		const header = document.querySelector('#landing header') as HTMLElement | null;
		const spine = document.querySelector('.ft-spine-sticky') as HTMLElement | null;
		const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
		const spineBottom = spine ? spine.getBoundingClientRect().bottom : headerBottom;
		const desiredTop = Math.max(headerBottom, spineBottom) + 8;
		const er = node.getBoundingClientRect();
		const delta = er.top - desiredTop;
		if (Math.abs(delta) < 2) return;
		const scroller = scrollParentOf(node);
		if (scroller) {
			scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
		} else {
			window.scrollTo(0, Math.max(0, window.scrollY + delta));
		}
	};
	place();
	requestAnimationFrame(() => {
		place();
		requestAnimationFrame(place);
	});
}

export function flashFinetune(selector: string): Promise<boolean> {

	prepareFinetuneFlash(selector);
	return new Promise((resolve) => {
		if (typeof document === 'undefined') {
			resolve(false);
			return;
		}
		const tryFind = (attempt: number) => {
			const el = document.querySelector(selector) as HTMLElement | null;
			if (el) {
				el.classList.add('te-lab-flash');
				scrollFinetuneIntoView(el);
				setTimeout(() => el.classList.remove('te-lab-flash'), 1800);
				resolve(true);
				return;
			}
			if (attempt >= 10) {
				resolve(false);
				return;
			}
			setTimeout(() => tryFind(attempt + 1), 80);
		};
		setTimeout(() => tryFind(0), 60);
	});
}

export async function tourFinetuneWorkbench(): Promise<void> {
	const steps: { panel: FtPanel; sel: string }[] = [
		{ panel: 'data', sel: '.ft-data' },
		{ panel: 'recipe', sel: '.ft-recommend' },
		{ panel: 'train', sel: '.ft-start' },
		{ panel: 'play', sel: '.ft-playground' },
		{ panel: 'archive', sel: '.ft-archive' }
	];
	const zh = get(locale) !== 'en';
	setFinetuneNotice(
		'info',
		zh
			? '正在带你把工作室五个主要标签看一遍，先不用改旋钮。'
			: 'Walking you through the five main studio tabs. You do not need to change any knobs yet.'
	);
	for (const step of steps) {
		finetunePanel.set(step.panel);
		const ok = await flashFinetune(step.sel);
		if (!ok) {
			await new Promise((r) => setTimeout(r, 700));
		} else {
			await new Promise((r) => setTimeout(r, 850));
		}
	}
	setFinetuneNotice(
		'ok',
		zh
			? '五个主要标签都看过一遍了：数据台、方法与参数、训练监控、对照游乐场、实验档案。先不改旋钮也没关系。'
			: 'You have now seen the five main tabs: Data, Recipe, Monitor, Playground, and Archive. It is fine not to change any knobs yet.'
	);
}
