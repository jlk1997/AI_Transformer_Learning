import { get } from 'svelte/store';
import { locale, coachLessonIdx, mathWalkExpanded, messages, workbenchOpen } from '~/i18n';
import { formatTokenForDisplay } from '~/utils/gpt2Tokens';
import { course, courseContrastOpen } from '~/store/course';
import {
	attentionHeadIdx,
	blockIdx,
	highlightedToken,
	inputText,
	isFetchingModel,
	modelData,
	sampling,
	temperature,
	tokens,
	weightPopover,
	textbookCurrentPageId,
	isTextbookOpen
} from '~/store';
import {
	imageKnobsUnlocked,
	musicKnobsUnlocked,
	samplingUnlocked,
	textPathDone
} from '~/store/beginnerPath';
import { currentTextPathId, TEXT_PATH_IDS } from '~/courses/textPath';
import { imageCfg, imageStep, imageSteps, imagePromptIdx } from '~/courses/image/store';
import { musicNotes, musicExampleIdx, musicSampling, musicTemp, musicModeOverride } from '~/courses/music/store';
import { MUSIC_EXAMPLES } from '~/courses/music/melodies';
import { nextDistributions } from '~/courses/music/model';
import {
	finetuneSpineView,
	finetuneTokenPreview,
	finetuneExplainStep,
	finetuneStatus,
	finetuneBaselineSaved
} from '~/courses/finetune/store';
import { recentTutorQA, tutorTarget, lastTutorAction, recentTaughtIds } from './store';
import { defaultTextMathId, textMathUnlocked, textTempWalkUnlocked, musicTempWalkUnlocked } from '~/courses/mathWalk';
import { contrastOverlayVisible } from '~/tutor/suggestions';
import { researchDoorOpen } from '~/courses/researchDoor';

export type TutorSnapshot = Record<string, unknown>;

function displayTok(token: string): string {
	return formatTokenForDisplay(token, get(locale) !== 'en');
}

function topCandidates(): { token: string; percent: number; score?: number }[] {
	const c = get(course);
	if (c === 'text') {
		const rows = ((get(modelData) as any)?.probabilities || []) as any[];
		return rows.slice(0, 8).map((r) => {
			const token = displayTok(String(r?.token ?? r?.name ?? ''));
			const probability = Number(r?.probability);
			const score = r?.logit ?? r?.scaledLogit;
			const item: { token: string; percent: number; score?: number; kept?: boolean } = {
				token,
				percent: Number.isFinite(probability) ? probability * 100 : 0
			};
			if (typeof score === 'number' && Number.isFinite(score)) item.score = Number(score.toFixed(2));
			if (Number.isFinite(probability)) item.kept = probability > 0;
			return item;
		});
	}
	if (c === 'music') {
		const ex = MUSIC_EXAMPLES[get(musicExampleIdx)] ?? MUSIC_EXAMPLES[0];
		const dist = nextDistributions(
			ex,
			get(musicNotes) || [],
			get(musicTemp),
			get(musicSampling),
			get(musicModeOverride) ?? undefined
		);
		return (dist.pitchProbs || []).slice(0, 8).map((r) => {
			const probability = Number(r.prob);
			const item: { token: string; percent: number; score?: number; kept?: boolean } = {
				token: displayTok(String(r.name)),
				percent: Number.isFinite(probability) ? probability * 100 : 0
			};
			if (typeof r.score === 'number' && Number.isFinite(r.score)) item.score = Number(r.score.toFixed(2));
			else if (typeof r.logit === 'number' && Number.isFinite(r.logit)) item.score = Number(r.logit.toFixed(2));
			if (Number.isFinite(probability)) item.kept = probability > 0;
			return item;
		});
	}
	return [];
}

function currentTokenLabel(): string {
	const toks = get(tokens) || [];
	const ht = get(highlightedToken) as any;
	const idx =
		typeof ht?.index === 'number' ? ht.index : typeof ht?.idx === 'number' ? ht.idx : toks.length - 1;
	return displayTok(String(toks[idx] ?? toks[toks.length - 1] ?? get(inputText) ?? ''));
}

function overlayStation(): { id: string; title: string } | null {
	const zh = get(locale) !== 'en';
	if (get(courseContrastOpen) && contrastOverlayVisible()) {
		return { id: 'contrast', title: zh ? '先看对照帘' : 'The contrast curtain' };
	}
	if (get(researchDoorOpen) && get(course) !== 'finetune') {
		return { id: 'explore', title: zh ? '走向研究' : 'Toward research' };
	}
	if (get(isTextbookOpen)) {
		const page = String(get(textbookCurrentPageId) || '');
		if (page === 'further-reading') {
			return { id: 'research', title: zh ? '走向研究' : 'Toward research' };
		}
	}
	if (get(workbenchOpen)) {
		return { id: 'workbench', title: zh ? '学习工作台' : 'Learning workbench' };
	}
	return null;
}

function stationFor(courseId: string): { id: string; title: string; index: number } {
	const idx = get(coachLessonIdx) || 0;
	const over = overlayStation();
	if (over) return { id: over.id, title: over.title, index: idx };
	const m = get(messages) as any;
	if (courseId === 'text') {
		const id = currentTextPathId();
		const lesson = m?.coach?.lessons?.[idx];
		return { id, title: lesson?.title || id, index: idx };
	}
	if (courseId === 'finetune') {
		const spine = get(finetuneSpineView);
		const lessons = (m as any)?.finetuneCoach?.lessons || [];
		const coach = lessons[idx];
		const lossIdx = lessons.findIndex((l: { id?: string }) => l?.id === 'loss');
		// Method / 再深挖 are optional later stops, not new required coach stations.
		// Prefer the spine when the student has entered them, even if the coach is still on 损失是什么 (第6/6关).
		if (spine === 'method' || spine === 'explore') {
			const zh = get(locale) !== 'en';
			const title =
				spine === 'method'
					? zh
						? '看改的是哪一块'
						: 'See which piece we change'
					: zh
						? '再深挖'
						: 'Go deeper';
			return { id: spine, title, index: idx };
		}
		const id = spine === 'loss' || coach?.id === 'loss' ? 'loss' : coach?.id || spine || 'map';
		const index = id === 'loss' && lossIdx >= 0 ? lossIdx : idx;
		const title =
			id === 'loss'
				? coach?.title || (get(locale) !== 'en' ? '损失是什么' : 'What loss is')
				: coach?.title || id;
		return { id, title, index };
	}
	if (courseId === 'image') {
		const lesson = (m as any)?.imageCoach?.lessons?.[idx];
		return { id: lesson?.id || 'map', title: lesson?.title || 'map', index: idx };
	}
	const lesson = (m as any)?.musicCoach?.lessons?.[idx];
	return { id: lesson?.id || 'map', title: lesson?.title || 'map', index: idx };
}

function allowedMathWalks(courseId: string, stationIndex: number): string[] {
	const out: string[] = [];
	if (courseId === 'text') {
		const done = get(textPathDone);
		if (textMathUnlocked('cut', stationIndex, done)) out.push('cut');
		if (textMathUnlocked('prob', stationIndex, done)) out.push('prob');
		if (textMathUnlocked('lmhead', stationIndex, done)) out.push('lmhead');
		if (textMathUnlocked('attn', stationIndex, done)) out.push('attn');
		if (textMathUnlocked('layers', stationIndex, done)) out.push('layers');
		if (textMathUnlocked('mask', stationIndex, done)) out.push('mask');
		if (textMathUnlocked('residual', stationIndex, done)) out.push('residual');
		if (textTempWalkUnlocked(stationIndex, done, get(samplingUnlocked))) {
			out.push('temp');
			out.push('cutoff');
		}
		const preferred = defaultTextMathId(stationIndex, done, get(samplingUnlocked));
		if (preferred) {
			const i = out.indexOf(preferred);
			if (i > 0) {
				out.splice(i, 1);
				out.unshift(preferred);
			}
		}
	} else if (courseId === 'image') {
		if (get(imageStep) > 0) out.push('denoise');
		if (get(imageStep) > 0) out.push('forward');
		if (get(imageKnobsUnlocked) && get(imageStep) > 0) out.push('cfg');
	} else if (courseId === 'music') {
		const ex = MUSIC_EXAMPLES[get(musicExampleIdx)] ?? MUSIC_EXAMPLES[0];
		const generated = (get(musicNotes)?.length || 0) > (ex?.notes?.length || 0);
		if (generated || stationIndex >= 2) out.push('musicProb');
		if (musicTempWalkUnlocked(stationIndex, get(musicKnobsUnlocked))) {
			out.push('temp');
			out.push('cutoff');
		}
	} else if (courseId === 'finetune') {
		const lessons = ((get(messages) as any)?.finetuneCoach?.lessons || []) as { id?: string }[];
		const coachId = lessons[stationIndex]?.id;
		if (get(finetuneSpineView) === 'loss' || coachId === 'loss') {
			out.push('loss');
			out.push('weight');
		}
	}
	return out;
}


function laterLabId(): string | undefined {
	if (get(finetuneSpineView) !== 'explore') return undefined;
	if (typeof document !== 'undefined') {
		const panel = document.querySelector('[data-te-horizon-panel]');
		const open = panel?.getAttribute('data-te-horizon-panel');
		if (open === 'dpo' || open === 'qlora' || open === 'map') return open;
		const depth = document.querySelector('.card.on[data-te-depth], [data-te-depth].on');
		const stop = depth?.getAttribute('data-te-depth');
		if (stop) return stop;
	}
	if (typeof location !== 'undefined') {
		const h = location.hash;
		if (h === '#ft-dpo') return 'dpo';
		if (h === '#ft-qlora') return 'qlora';
		if (h === '#ft-eval') return 'eval';
		if (h === '#ft-map') return 'map';
	}
	return 'overfit';
}

function visibleRegions(courseId: string): string[] {
	const regions = ['task-cluster', 'guide-slot'];
	if (courseId === 'text') regions.push('left-tokens', 'mid-attention', 'right-probs');
	else if (courseId === 'image') regions.push('image-canvas', 'image-condition', 'image-output');
	else if (courseId === 'music') regions.push('music-roll', 'music-probs');
	else if (courseId === 'finetune') {
		regions.push('ft-board', 'ft-tokenize');
		const spine = get(finetuneSpineView);
		if (spine === 'loss') regions.push('ft-loss', 'ft-weight-move');
		if (spine === 'method') regions.push('ft-method');
		if (spine === 'explore') regions.push('ft-explore', 'ft-depth');
	}
	return regions;
}

function tokenPreviewDigest() {
	const rows = get(finetuneTokenPreview) || [];
	const first = rows[0];
	if (!first) return undefined;
	const count = typeof (first as any).count === 'number' ? (first as any).count : 0;
	const tokens = Array.isArray((first as any).tokens) ? (first as any).tokens.slice(0, 8).map((t: unknown) => String(t)) : [];
	return { count, tokens, approx: !!(first as any).approx };
}


function currentAttnDigest() {
	const toks = get(tokens) || [];
	const b = get(blockIdx) ?? 0;
	const h = get(attentionHeadIdx) ?? 0;
	const data = get(modelData) as any;
	const matrix =
		data?.outputs?.[`block_${b}_attn_head_${h}_attn_dropout`]?.data ||
		data?.outputs?.[`block_${b}_attn_head_${h}_attn`]?.data;
	const ht = get(highlightedToken) as any;
	const last = (toks.length || 1) - 1;
	const q =
		typeof ht?.index === 'number' ? ht.index : typeof ht?.idx === 'number' ? ht.idx : last;
	const row = Array.isArray(matrix?.[q]) ? matrix[q] : [];
	const pairs: { token: string; percent: number; w: number }[] = [];
	let sum = 0;
	for (let i = 0; i <= q && i < toks.length; i++) {
		const w = Number(row[i]);
		if (Number.isFinite(w) && w > 0) {
			pairs.push({ token: displayTok(String(toks[i])), percent: w * 100, w });
			sum += w;
		}
	}
	const ready = Boolean(matrix) && sum > 0.5;
	pairs.sort((a, c) => c.w - a.w);
	return {
		attnReady: ready,
		modelReady: !get(isFetchingModel) || ready,
		attnWeights: ready
			? pairs.slice(0, 4).map(({ token, percent }) => ({
					token,
					percent: Math.round(percent * 10) / 10
				}))
			: []
	};
}

function liveFigures(courseId: string) {
	const live: Record<string, unknown> = {};
	if (courseId === 'text') {
		live.topCandidates = topCandidates();
		live.token = currentTokenLabel();
		live.layer = get(blockIdx);
		live.head = get(attentionHeadIdx);
		const attn = currentAttnDigest();
		live.attnReady = attn.attnReady;
		live.modelReady = attn.modelReady;
		if (attn.attnWeights.length) live.attnWeights = attn.attnWeights;
		if (get(samplingUnlocked)) {
			live.temperature = get(temperature);
			const samp = get(sampling) as { type?: string; value?: number };
			if (samp?.type) live.samplingType = samp.type;
			if (typeof samp?.value === 'number' && Number.isFinite(samp.value)) {
				live.samplingValue = samp.value;
				if (samp.type === 'top-k') live.topK = samp.value;
				if (samp.type === 'top-p') live.topP = samp.value;
			}
			const rows = ((get(modelData) as any)?.probabilities || []) as any[];
			const kept = rows.filter((r) => Number(r?.probability) > 0).length;
			if (kept) live.candidateKept = kept;
		}
		const text = String(get(inputText) || '');
		if (text) live.inputPreview = text.slice(0, 80);
		const pop = get(weightPopover);
		if (pop) live.popover = String(pop);
		if (get(isTextbookOpen)) {
			live.textbookOpen = true;
			const page = get(textbookCurrentPageId);
			if (page) live.textbookPage = page;
		}
	} else if (courseId === 'image') {
		live.imageStep = get(imageStep);
		live.imageSteps = get(imageSteps);
		live.promptIndex = get(imagePromptIdx);
		// Name-bearing knobs stay out of the digest until unlocked.
		if (get(imageKnobsUnlocked)) live.imageCfg = get(imageCfg);
	} else if (courseId === 'music') {
		live.topCandidates = topCandidates();
		const notes = get(musicNotes) || [];
		live.noteCount = notes.length;
		const ex = MUSIC_EXAMPLES[get(musicExampleIdx)] ?? MUSIC_EXAMPLES[0];
		live.seedCount = ex?.notes?.length || 0;
		if (get(musicKnobsUnlocked)) {
			live.musicTemp = get(musicTemp);
			const samp = get(musicSampling) as { type?: string; value?: number };
			if (samp?.type) live.samplingType = samp.type;
			if (typeof samp?.value === 'number' && Number.isFinite(samp.value)) {
				live.samplingValue = samp.value;
				if (samp.type === 'top-k') live.topK = samp.value;
				if (samp.type === 'top-p') live.topP = samp.value;
			}
			const exOn = MUSIC_EXAMPLES[get(musicExampleIdx)] ?? MUSIC_EXAMPLES[0];
			const distOn = nextDistributions(
				exOn,
				get(musicNotes) || [],
				get(musicTemp),
				get(musicSampling),
				get(musicModeOverride) ?? undefined
			);
			const kept = (distOn.pitchProbs || []).filter((r) => Number(r.prob) > 0).length;
			if (kept) live.candidateKept = kept;
		}
	} else if (courseId === 'finetune') {
		live.ftSpine = get(finetuneSpineView);
		live.ftLater = laterLabId();
		live.ftExplainStep = get(finetuneExplainStep);
		live.ftStatus = get(finetuneStatus);
		live.ftBaselineSaved = get(finetuneBaselineSaved);
		if (get(finetuneSpineView) === 'loss') live.ftWeightMove = true;
		const preview = tokenPreviewDigest();
		if (preview) live.ftTokenPreview = preview;
		// Never send recipe / learning-rate / generation knobs in the snapshot.
	}
	return live;
}

export function buildTutorSnapshot(): TutorSnapshot {
	const courseId = get(course);
	const st = stationFor(courseId);
	const allowed = allowedMathWalks(courseId, st.index);
	const loc = get(locale);
	const target = get(tutorTarget);
	const musicEx = MUSIC_EXAMPLES[get(musicExampleIdx)] ?? MUSIC_EXAMPLES[0];
	const generated =
		courseId === 'text'
			? st.index >= 1 || get(textPathDone)
			: courseId === 'image'
				? get(imageStep) > 0
				: courseId === 'music'
					? (get(musicNotes)?.length || 0) > (musicEx?.notes?.length || 0)
					: true;
	const action = get(lastTutorAction);
	const live = liveFigures(courseId);
	if (get(workbenchOpen)) live.workbenchOpen = true;
	if (get(courseContrastOpen) && contrastOverlayVisible()) live.contrastOpen = true;
	if (get(isTextbookOpen)) {
		live.textbookOpen = true;
		const page = get(textbookCurrentPageId);
		if (page) live.textbookPage = page;
	}
	const snapshot: TutorSnapshot = {
		course: courseId,
		station: st.id,
		stationTitle: st.title,
		stationIndex: st.index,
		pathBeat: { id: st.id, title: st.title, index: st.index },
		locale: loc,
		unlocked: {
			sampling: get(samplingUnlocked),
			imageKnobs: get(imageKnobsUnlocked),
			musicKnobs: get(musicKnobsUnlocked),
			textPathDone: get(textPathDone)
		},
		token: currentTokenLabel(),
		layer: get(blockIdx),
		head: get(attentionHeadIdx),
		topCandidates: topCandidates(),
		visibleRegions: visibleRegions(courseId),
		live,
		visibleMathWalk: get(mathWalkExpanded) && allowed.length ? allowed[0] : null,
		allowedMathWalks: allowed,
		recentQA: recentTutorQA(),
		taughtIds: recentTaughtIds(),
		generated,
		textStations: TEXT_PATH_IDS,
		spineView: courseId === 'finetune' ? get(finetuneSpineView) : undefined
	};
	if (action) snapshot.lastAction = { kind: action.kind, label: action.label };
	if (target) snapshot.target = target;
	return snapshot;
}
