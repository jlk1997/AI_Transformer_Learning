import { get, writable } from 'svelte/store';
import {
	inputText,
	isTextbookOpen,
	selectedExampleIdx,
	modelData,
	tokens,
	tokenIds,
	predictedToken,
	temperature,
	sampling,
	isModelRunning,
	blockIdx,
	blockIdxTemp,
	attentionHeadIdx,
	attentionHeadIdxTemp
} from '~/store';
import { switchCourse } from '~/store/course';
import { BRIDGE_EXAMPLE_IDX, BRIDGE_SENTENCE_ZH, isBridgeSentence } from '~/courses/bridge';
import { displayLabelsFromIds } from '~/utils/gpt2Tokens';
import { replaceTeachingHash } from '~/utils/teachingHash';
import { fetchSankeyForward, type SankeyForwardResponse, type SankeyPack, type SankeyMeta } from '~/courses/finetune/api';
import { finetuneRunId } from '~/courses/finetune/store';

export const PREFERRED_LORA_RUN = '20261110-212809-032a06';
export const LORA_CONTRAST_HASH = '#lora-contrast';

export type LoraSide = 'base' | 'lora';

export type LoraContrastState = {
	active: boolean;
	loading: boolean;
	error: string | null;
	side: LoraSide;
	runId: string | null;
	text: string;
	base: SankeyPack | null;
	tuned: SankeyPack | null;
	meta: SankeyMeta | null;
	requestId: number;
};

const empty: LoraContrastState = {
	active: false,
	loading: false,
	error: null,
	side: 'lora',
	runId: null,
	text: '',
	base: null,
	tuned: null,
	meta: null,
	requestId: 0
};

export const loraContrast = writable<LoraContrastState>({ ...empty });

/** Xenova tokenizer, set by the text-course page once it is ready. */
export const textTokenizer = writable<any>(null);

export function isLoraContrastActive() {
	return get(loraContrast).active;
}

export async function packToModelData(pack: SankeyPack, tokenizer: any, temp: number, samp: { type: 'top-k' | 'top-p'; value: number }) {
	const { getProbabilities } = await import('~/utils/data');
	const { probabilities, sampled } = getProbabilities({
		tokenizer,
		logits: pack.logits,
		temperature: temp,
		sampling: samp
	});
	return {
		logits: pack.logits,
		outputs: pack.outputs,
		probabilities,
		sampled
	};
}


export function focusFromPacks(base: SankeyPack | null, tuned: SankeyPack | null) {
	let best = { suggestBlock: 0, suggestHead: 0, maxAttnDelta: 0 };
	if (!base?.outputs || !tuned?.outputs) return best;
	const re = /^block_(\d+)_attn_head_(\d+)_attn_dropout$/;
	for (const key of Object.keys(base.outputs)) {
		const m = re.exec(key);
		if (!m) continue;
		const other = tuned.outputs[key];
		if (!other) continue;
		const bd = base.outputs[key].data;
		const td = other.data;
		let mx = 0;
		for (let i = 0; i < bd.length; i++) {
			const row = bd[i];
			const orow = td[i];
			if (!row || !orow) continue;
			for (let j = 0; j < row.length; j++) {
				const a = row[j];
				const b = orow[j];
				if (a == null && b == null) continue;
				const d = Math.abs((a ?? 0) - (b ?? 0));
				if (d > mx) mx = d;
			}
		}
		if (mx > best.maxAttnDelta) {
			best = { suggestBlock: Number(m[1]), suggestHead: Number(m[2]), maxAttnDelta: Number(mx.toFixed(6)) };
		}
	}
	return best;
}

export async function applyLoraSide(side: LoraSide, tokenizer?: any) {
	const state = get(loraContrast);
	const pack = side === 'lora' ? state.tuned : state.base;
	const tok = tokenizer ?? get(textTokenizer);
	if (!pack || !tok) return false;
	const data = await packToModelData(pack, tok, get(temperature), get(sampling));
	let tokenLabels = displayLabelsFromIds(pack.tokenIds, tok, (pack as any).tokenInfos);
	if (!tokenLabels?.length) tokenLabels = pack.tokens;
	modelData.set(data as any);
	tokens.set(tokenLabels);
	tokenIds.set(pack.tokenIds);
	predictedToken.set(data.sampled);
	const latest = get(loraContrast);
	const focus = focusFromPacks(latest.base, latest.tuned);
	const suggestBlock = focus.maxAttnDelta > 0 ? focus.suggestBlock : latest.meta?.suggestBlock;
	const suggestHead = focus.maxAttnDelta > 0 ? focus.suggestHead : latest.meta?.suggestHead;
	if (typeof suggestBlock === 'number') {
		blockIdx.set(suggestBlock);
		blockIdxTemp.set(suggestBlock);
		const head = typeof suggestHead === 'number' ? suggestHead : 0;
		attentionHeadIdx.set(head);
		attentionHeadIdxTemp.set(head);
	}
	loraContrast.update((s) => ({
		...s,
		side,
		error: s.error,
		meta: s.meta ? { ...s.meta, ...focus } : s.meta
	}));
	return true;
}

export function exitLoraContrast() {
	loraContrast.update((s) => ({
		...empty,
		requestId: s.requestId + 1,
		runId: s.runId,
		meta: null
	}));
}

export async function refreshLoraContrast(text: string, runId?: string | null, opts?: { keepSide?: boolean }) {
	const tok = get(textTokenizer);
	const prompt = (text || '').trim();
	if (!prompt) return;
	const prev = get(loraContrast);
	const requestId = prev.requestId + 1;
	const side = opts?.keepSide ? prev.side : prev.side || 'lora';
	const resolvedHint = (runId || prev.runId || get(finetuneRunId) || PREFERRED_LORA_RUN) ?? null;
	loraContrast.set({
		...prev,
		active: true,
		loading: true,
		error: null,
		text: prompt,
		runId: resolvedHint,
		requestId
	});
	isModelRunning.set(true);
	try {
		const res: SankeyForwardResponse = await fetchSankeyForward({ text: prompt, runId: resolvedHint }, 180000);
		if (get(loraContrast).requestId !== requestId) return;
		if (!res?.base) {
			throw new Error('trainer returned no baseline pack');
		}
		const next: LoraContrastState = {
			active: true,
			loading: false,
			error: res.meta?.hasTuned ? null : 'NO_TUNED',
			side: res.tuned && res.meta?.hasTuned ? side : 'base',
			runId: res.meta?.resolvedRunId || resolvedHint,
			text: res.text || prompt,
			base: res.base,
			tuned: res.tuned,
			meta: res.meta,
			requestId
		};
		loraContrast.set(next);
		// Flush "loading finished" to the bar before applying large maps to the Sankey.
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(() => applyLoraSide(next.side, tok));
		} else {
			applyLoraSide(next.side, tok);
		}
	} catch (err: any) {
		if (get(loraContrast).requestId !== requestId) return;
		const message = err?.name === 'TrainerTimeoutError' ? 'TIMEOUT' : err?.message || String(err);
		loraContrast.update((s) => ({
			...s,
			loading: false,
			error: message,
			active: true
		}));
	} finally {
		if (get(loraContrast).requestId === requestId) {
			isModelRunning.set(false);
		}
	}
}

export function goToTextCourseWithLora(runId?: string | null) {
	const rid = (runId || get(finetuneRunId) || PREFERRED_LORA_RUN) ?? null;
	isTextbookOpen.set(false);
	// Do not set loading=true here. The text-course subscriber starts
	// refreshLoraContrast after remount; a pre-set loading flag would
	// make it return early and leave the bar stuck on loading.
	loraContrast.update((s) => ({
		...s,
		active: true,
		loading: false,
		error: null,
		runId: rid,
		text: BRIDGE_SENTENCE_ZH,
		side: 'lora'
	}));
	selectedExampleIdx.set(BRIDGE_EXAMPLE_IDX);
	inputText.set(BRIDGE_SENTENCE_ZH);
	try {
		predictedToken.set({ token: '', tokenId: -1, probability: 0, rank: -1 } as any);
	} catch {
		/* ignore */
	}
	switchCourse('text');
	replaceTeachingHash(LORA_CONTRAST_HASH);
	// The text-course inputText subscriber starts the trainer forward pass.
}

export function maybeOpenLoraContrastFromHash() {
	if (typeof location === 'undefined') return;
	if (location.hash !== LORA_CONTRAST_HASH) return;
	const state = get(loraContrast);
	if (state.active && (state.base || state.loading)) return;
	goToTextCourseWithLora(state.runId || get(finetuneRunId) || PREFERRED_LORA_RUN);
}

export function shouldHoldOnnx(text?: string) {
	const state = get(loraContrast);
	if (!state.active) return false;
	const t = (text ?? get(inputText) ?? '').trim();
	// Stay in contrast for the shared sentence, or for a generate-next-token continuation
	// that started from this contrast.
	if (isBridgeSentence(t) || t.startsWith(state.text.slice(0, 8)) || t === state.text) return true;
	return state.active && t.length > 0;
}
