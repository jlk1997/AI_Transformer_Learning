export const API_BASE = '/finetune-api';

export type Health = {
	ok: boolean;
	torch: boolean;
	cuda: boolean;
	device: string;
	vramTotalMb?: number;
	vramUsedMb?: number;
	message?: string;
};

export type TokenChipInfo = {
	text: string;
	id?: number;
	group?: string;
	incomplete?: boolean;
};

export type TokenProb = {
	token: string;
	display?: string;
	id?: number;
	prob: number;
};

export type TokenPreview = {
	count: number;
	tokens: string[];
	truncated: boolean;
	approx?: boolean;
	totalCount?: number;
	tokenInfos?: TokenChipInfo[];
	dropped?: string[];
	droppedInfos?: TokenChipInfo[];
	keptHidden?: number;
	droppedHidden?: number;
};

export type CompareItem = {
	prompt: string;
	base: string;
	tuned: string;
	baseProbs?: TokenProb[];
	tunedProbs?: TokenProb[];
	hasTuned?: boolean;
};

export type TrainEvent = {
	type: 'log' | 'metric' | 'status' | 'error' | 'done';
	ts?: number;
	message?: string;
	step?: number;
	epoch?: number;
	trainLoss?: number;
	valLoss?: number;
	lr?: number;
	vramMb?: number;
	status?: string;
	runId?: string;
};

export type RunSummary = {
	id: string;
	createdAt: string;
	recipe: Record<string, unknown>;
	status: string;
	metrics: { step: number; epoch?: number; trainLoss?: number; valLoss?: number; lr?: number; vramMb?: number }[];
	logs: string[];
	generations?: { prompt: string; base: string; tuned: string; baseProbs?: unknown; tunedProbs?: unknown }[];
	samplesCount?: number;
	stoppedReason?: string;
	leakVal?: boolean;
	split?: { train?: number; val?: number; test?: number; leaked?: boolean };
	bestValLoss?: number | null;
	bestValStep?: number | null;
	testLoss?: number | null;
	usedCheckpoint?: string;
	lastStep?: number;
	evalCard?: {
		reading?: string;
		readingEn?: string;
		valLoss?: number | null;
		testLoss?: number | null;
		items?: Record<string, unknown>[];
		kind?: string;
		savedAt?: string;
	};
};

async function parseJson(res: Response) {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		throw new Error(text || res.statusText);
	}
}

export class TrainerTimeoutError extends Error {
	constructor(message = 'TIMEOUT') {
		super(message);
		this.name = 'TrainerTimeoutError';
	}
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 20000): Promise<{ ok: boolean; status: number; data: any; res: Response }> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { ...init, signal: ctrl.signal });
		const data = await parseJson(res);
		return { ok: res.ok, status: res.status, data, res };
	} catch (err: any) {
		if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
			throw new TrainerTimeoutError();
		}
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

export async function fetchHealth(timeoutMs = 2500): Promise<Health | null> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
		if (!res.ok) return null;
		return (await parseJson(res)) as Health;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

export async function previewTokenize(
	texts: string[],
	seqLen: number,
	timeoutMs = 30000
): Promise<TokenPreview[] | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${API_BASE}/tokenize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ texts, seqLen }),
			signal: ctrl.signal
		});
		if (!res.ok) return null;
		const data = await parseJson(res);
		const previews = data.previews as TokenPreview[];
		return Array.isArray(previews) ? previews : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function startTrain(payload: Record<string, unknown>, timeoutMs = 30000): Promise<{ runId: string }> {
	const { ok, data } = await fetchJson(
		`${API_BASE}/train/start`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
		timeoutMs
	);
	if (!ok) throw new Error(data.detail || data.message || '无法开始训练');
	return data;
}

export async function saveEvalCard(runId: string, payload: Record<string, unknown>, timeoutMs = 15000) {
	const { ok, data } = await fetchJson(
		`${API_BASE}/runs/${encodeURIComponent(runId)}/eval`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
		timeoutMs
	);
	if (!ok) throw new Error(data.detail || data.message || '无法保存评测卡');
	return data;
}

export async function trainControl(action: 'pause' | 'resume' | 'stop', runId?: string, timeoutMs = 15000) {
	const { ok, data } = await fetchJson(
		`${API_BASE}/train/${action}`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }) },
		timeoutMs
	);
	if (!ok) throw new Error(data.detail || data.message || action);
	return data;
}

export async function listRuns(timeoutMs = 8000): Promise<RunSummary[]> {
	try {
		const { ok, data } = await fetchJson(`${API_BASE}/runs`, {}, timeoutMs);
		if (!ok) return [];
		return (data.runs as RunSummary[]) || [];
	} catch {
		return [];
	}
}

export async function getRun(id: string, timeoutMs = 8000): Promise<RunSummary | null> {
	try {
		const { ok, data } = await fetchJson(`${API_BASE}/runs/${encodeURIComponent(id)}`, {}, timeoutMs);
		if (!ok) return null;
		return data as RunSummary;
	} catch {
		return null;
	}
}

export async function generateCompare(
	payload: Record<string, unknown>,
	timeoutMs = 90000
): Promise<{
	items: CompareItem[];
}> {
	const { ok, data } = await fetchJson(
		`${API_BASE}/generate`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
		timeoutMs
	);
	if (!ok) throw new Error(data.detail || data.message || '续写失败');
	return data;
}

export async function fetchNextToken(
	payload: Record<string, unknown>,
	timeoutMs = 60000
): Promise<{ items: CompareItem[] }> {
	const { ok, data } = await fetchJson(
		`${API_BASE}/next-token`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
		timeoutMs
	);
	if (!ok) throw new Error(data.detail || data.message || '概率排行失败');
	return data;
}

export async function downloadExport(runId: string, timeoutMs = 20000): Promise<{ fileName: string }> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/export`, { signal: ctrl.signal });
		if (!res.ok) {
			let detail = res.statusText;
			try {
				const data = await parseJson(res);
				detail = data.detail || data.message || detail;
			} catch {
				/* keep statusText */
			}
			throw new Error(detail || '导出失败');
		}
		const blob = await res.blob();
		const cd = res.headers.get('content-disposition') || '';
		const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
		const fileName = (m && decodeURIComponent(m[1].replace(/"/g, ''))) || `adapter-${runId}.zip`;
		const href = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = href;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(href), 2000);
		return { fileName };
	} catch (err: any) {
		if (err?.name === 'AbortError' || err?.name === 'TimeoutError') throw new TrainerTimeoutError();
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

export function exportUrl(runId: string) {
	return `${API_BASE}/runs/${encodeURIComponent(runId)}/export`;
}

export function openEventSource(runId: string, onEvent: (ev: TrainEvent) => void): EventSource {
	const es = new EventSource(`${API_BASE}/train/events?runId=${encodeURIComponent(runId)}`);
	es.onmessage = (m) => {
		try {
			onEvent(JSON.parse(m.data) as TrainEvent);
		} catch {
			onEvent({ type: 'log', message: m.data });
		}
	};
	return es;
}

export function approxTokenCount(text: string) {
	const zh = (text.match(/[\u4e00-\u9fff]/g) || []).length;
	const other = text.length - zh;
	return Math.max(1, Math.round(zh / 1.5 + other / 4));
}

export function approxPieces(text: string, limit = 32): string[] {
	const parts: string[] = [];
	const re = /[\u4e00-\u9fff]|[A-Za-z0-9]+|\S/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) && parts.length < limit) parts.push(m[0]);
	return parts;
}

export type SankeyTensor = { data: (number | null)[][]; dims: number[]; size: number };

export type SankeyPack = {
	tokens: string[];
	tokenIds: number[];
	tokenInfos?: TokenChipInfo[];
	logits: number[];
	outputs: Record<string, SankeyTensor>;
	truncated?: boolean;
	seqLen?: number;
};

export type SankeyMeta = {
	runId?: string | null;
	requestedRunId?: string | null;
	resolvedRunId?: string | null;
	hasTuned?: boolean;
	baseName?: string;
	r?: number | null;
	alpha?: number | null;
	dropout?: number | null;
	recipeModules?: string[];
	actualModules?: string[];
	peftTargets?: string[];
	method?: string;
	base?: string;
	engine?: string;
	onnxUsed?: boolean;
	maxSeq?: number;
	suggestBlock?: number;
	suggestHead?: number;
	maxAttnDelta?: number;
	attnScale?: number;
	scaleAttnByInverseLayerIdx?: boolean;
	payloadSlim?: boolean;
	cached?: boolean;
};

export type SankeyForwardResponse = {
	text: string;
	base: SankeyPack;
	tuned: SankeyPack | null;
	meta: SankeyMeta;
};


function isRawAttnKey(key: string) {
	return /_attn_head_\d+_attn$/.test(key);
}

/** Rebuild scaled / masked / softmax maps the trainer omitted to shrink the payload. */
export function expandSankeyPack(pack: SankeyPack | null | undefined, meta?: SankeyMeta | null): SankeyPack | null {
	if (!pack) return pack ?? null;
	const outs = pack.outputs || {};
	const scale = typeof meta?.attnScale === 'number' && meta.attnScale > 0 ? meta.attnScale : 1 / Math.sqrt(64);
	const inv = !!meta?.scaleAttnByInverseLayerIdx;
	const next: Record<string, SankeyTensor> = { ...outs };
	for (const key of Object.keys(outs)) {
		if (!isRawAttnKey(key)) continue;
		const raw = outs[key];
		if (!raw?.data) continue;
		const prefix = key.slice(0, -'_attn'.length);
		const layerM = /^block_(\d+)_attn_head_/.exec(key);
		const layerIdx = layerM ? Number(layerM[1]) : 0;
		const layerScale = inv ? scale / (layerIdx + 1) : scale;
		const keyScaled = `${prefix}_attn_scaled`;
		const keyMasked = `${prefix}_attn_masked`;
		const keySoft = `${prefix}_attn_softmax`;
		const keyDrop = `${prefix}_attn_dropout`;
		if (!next[keyScaled]) {
			const scaledData = raw.data.map((row) =>
				row.map((v) => (v == null ? null : Math.round((Number(v) * layerScale + Number.EPSILON) * 1e6) / 1e6))
			);
			next[keyScaled] = { data: scaledData, dims: raw.dims, size: raw.size };
		}
		if (!next[keyMasked]) {
			const src = next[keyScaled].data;
			const maskedData = src.map((row, i) => row.map((v, j) => (j > i ? null : v)));
			next[keyMasked] = { data: maskedData, dims: raw.dims, size: raw.size };
		}
		if (!next[keySoft] && next[keyDrop]) {
			next[keySoft] = next[keyDrop];
		}
	}
	return { ...pack, outputs: next };
}

export async function fetchSankeyForward(
	payload: { text: string; runId?: string | null },
	timeoutMs = 180000
): Promise<SankeyForwardResponse> {
	const { ok, data } = await fetchJson(
		`${API_BASE}/sankey-forward`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
		timeoutMs
	);
	if (!ok) throw new Error((data && (data.detail || data.message)) || '桑基图前向失败');
	const res = data as SankeyForwardResponse;
	if (res?.base) res.base = expandSankeyPack(res.base, res.meta) as SankeyPack;
	if (res?.tuned) res.tuned = expandSankeyPack(res.tuned, res.meta);
	return res;
}

export type PreferenceScoreItem = {
	id?: string;
	prompt: string;
	chosen: string;
	rejected: string;
	baseChosen?: number | null;
	baseRejected?: number | null;
	baseMargin?: number | null;
	tunedChosen?: number | null;
	tunedRejected?: number | null;
	tunedMargin?: number | null;
	hasTuned?: boolean;
};

export async function fetchPreferenceScores(
	payload: {
		runId?: string | null;
		pairs: { id?: string; prompt: string; chosen: string; rejected: string }[];
	},
	timeoutMs = 180000
): Promise<{ items: PreferenceScoreItem[]; meta?: { runId?: string; hasTuned?: boolean; engine?: string } }> {
	const { ok, data } = await fetchJson(
		`${API_BASE}/preference-score`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
		timeoutMs
	);
	if (!ok) throw new Error((data && (data.detail || data.message)) || 'Preference scoring failed');
	return data as { items: PreferenceScoreItem[]; meta?: { runId?: string; hasTuned?: boolean; engine?: string } };
}
