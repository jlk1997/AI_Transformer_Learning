import { get } from 'svelte/store';
import {
	rememberTaughtIds,
	rememberTutorQA,
	tutorError,
	tutorMessages,
	tutorNextHint,
	tutorServiceDown,
	tutorSettings,
	tutorStreaming,
	tutorThinking,
	type AskTarget,
	type TutorSettingsPublic
} from './store';
import { inlinedWalkRequest, mathWalkRequest, tutorHighlightSel } from './store';
import { flashSel } from '~/courses/textPath';
import { contrastOverlayVisible } from './suggestions';

const BASES = ['http://127.0.0.1:8787/tutor-api', '/tutor-api'];

const SECRET_KEYS = new Set([
	'apikey',
	'apiKey',
	'api_key',
	'authorization',
	'baseUrl',
	'base_url',
	'keyLast4',
	'keylast4',
	'secret',
	'secrets',
	'accessToken',
	'password'
]);

function sanitizeSnapshot(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
	const src = raw && typeof raw === 'object' ? raw : {};
	const out: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(src)) {
		if (SECRET_KEYS.has(key) || SECRET_KEYS.has(key.replace(/-/g, ''))) continue;
		const low = key.replace(/-/g, '').toLowerCase();
		if (low === 'apikey' || low === 'baseurl' || low === 'keylast4' || low === 'authorization') continue;
		out[key] = val;
	}
	return out;
}



function contrastCurtainReply(zh: boolean, courseId: string): string {
	const labels: Record<string, { zh: string; en: string }> = {
		image: { zh: '开始看图', en: 'Start the image course' },
		music: { zh: '开始看谱', en: 'Start the music course' },
		finetune: { zh: '开始微调课', en: 'Start the fine-tune course' }
	};
	const lab = labels[courseId] || labels.image;
	if (zh) {
		return `请先点「${lab.zh}」。对照帘收起之后，再问这个画面在干什么，我会按你眼前的画面来讲。`;
	}
	return `Please click “${lab.en}” first. After the contrast curtain closes, ask again and I will teach from the screen in front of you.`;
}

function yieldTick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function safeHighlightSelector(raw: unknown): string | null {
	const sel = String(raw || '').trim();
	if (!sel || sel.length > 300) return null;
	if (sel === '*' || sel === 'html' || sel === 'body' || sel === ':root') return null;
	return sel;
}

function downMessage(zh: boolean) {
	return zh
		? '本机教学服务还没连上。教材、自测和提问界面仍可使用。要问导师，需要先启动本机教学服务。'
		: 'The local teaching service is not connected. You can still use the textbook, self-checks, and the question box. Asking the tutor needs the local teaching service started first.';
}

async function fetchOk(url: string, timeoutMs = 2000): Promise<Response | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const resp = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
		return resp;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function firstReachable(timeoutMs = 2000): Promise<string | null> {
	// Prefer the local teaching service so a stale Vite proxy cannot hang the tutor UI.
	for (const base of BASES) {
		const resp = await fetchOk(`${base}/health`, timeoutMs);
		if (resp && resp.ok) return base;
	}
	return null;
}

export async function loadTutorSettings(): Promise<TutorSettingsPublic | null> {
	const base = await firstReachable();
	if (!base) {
		tutorServiceDown.set(true);
		return null;
	}
	tutorServiceDown.set(false);
	const resp = await fetch(`${base}/settings`, { cache: 'no-store' });
	if (!resp.ok) throw new Error('settings_failed');
	const data = (await resp.json()) as TutorSettingsPublic;
	tutorSettings.set(data);
	return data;
}

export async function saveTutorSettings(body: Record<string, unknown>): Promise<TutorSettingsPublic> {
	const base = await firstReachable();
	if (!base) {
		tutorServiceDown.set(true);
		throw new Error('service_down');
	}
	const resp = await fetch(`${base}/settings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = await resp.json();
	if (!resp.ok) throw new Error(data?.detail || 'save_failed');
	tutorSettings.set(data);
	return data;
}

export async function testTutorConnection(): Promise<{ ok: boolean; messageZh?: string; messageEn?: string }> {
	const base = await firstReachable();
	if (!base) {
		tutorServiceDown.set(true);
		return { ok: false, messageZh: downMessage(true), messageEn: downMessage(false) };
	}
	const resp = await fetch(`${base}/test`, { method: 'POST' });
	return resp.json();
}

function applyTool(tool: any) {
	if (!tool || typeof tool !== 'object') return;
	if (tool.name === 'highlight_ui' && tool.selector) {
		const sel = safeHighlightSelector(tool.selector);
		if (!sel) return;
		tutorHighlightSel.set(sel);
		try {
			void flashSel(sel, 2400);
		} catch {
			/* a bad selector must never freeze the lesson */
		}
	} else if (tool.name === 'open_math_walk' && tool.cardId) {
		const cardId = String(tool.cardId);
		if (cardId === 'loss' || cardId === 'weight') {
			// Inlined on the loss spine (FtLossAsTable / weight-move), not the shared dock.
			const sel =
				cardId === 'weight'
					? '[data-te-math="weight-walk"], [data-te-ft="weight-move"], [data-te-bridge="loss-table"], [data-te-ft="loss"]'
					: '[data-te-math="loss-walk"], [data-te-bridge="loss-table"], [data-te-ft="loss"]';
			tutorHighlightSel.set(sel);
			try {
				void flashSel(sel, 2400);
			} catch {
				/* a missing sketch must never freeze the lesson */
			}
			if (cardId === 'weight') inlinedWalkRequest.set('weight');
			return;
		}
		mathWalkRequest.set(cardId);
	} else if (tool.name === 'suggest_next_step' && tool.hint) {
		tutorNextHint.set(String(tool.hint));
	}
}

function parseSseChunk(buffer: string, onEvent: (ev: string, data: any) => void): string {
	let rest = buffer;
	while (true) {
		const split = rest.indexOf('\n\n');
		if (split < 0) break;
		const raw = rest.slice(0, split);
		rest = rest.slice(split + 2);
		let event = 'message';
		const dataLines: string[] = [];
		for (const line of raw.split('\n')) {
			if (line.startsWith('event:')) event = line.slice(6).trim();
			else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
		}
		if (!dataLines.length) continue;
		try {
			onEvent(event, JSON.parse(dataLines.join('\n')));
		} catch {
			/* ignore bad chunk */
		}
	}
	return rest;
}

export async function askTutor(opts: {
	question: string;
	snapshot: Record<string, unknown>;
	target?: AskTarget | null;
	zh: boolean;
}): Promise<void> {
	const question = opts.question.trim();
	if (!question) return;
	await yieldTick();
	tutorError.set('');
	tutorNextHint.set('');
	tutorThinking.set('');
	const alreadyDown = get(tutorServiceDown);
	// Do not show "正在讲…" while probing a down service, or after we already know it is down.
	tutorMessages.update((list) => [...list, { role: 'user', text: question }]);
	await yieldTick();
	if (typeof document !== 'undefined' && contrastOverlayVisible()) {
		const courseId = typeof opts.snapshot?.course === 'string' ? String(opts.snapshot.course) : '';
		const msg = contrastCurtainReply(opts.zh, courseId);
		tutorStreaming.set(false);
		tutorMessages.update((list) => [...list, { role: 'tutor', text: msg, source: 'corpus' }]);
		rememberTutorQA(question, msg, courseId);
		return;
	}
	const base = await firstReachable(alreadyDown ? 600 : 2000);
	if (!base) {
		tutorServiceDown.set(true);
		tutorStreaming.set(false);
		const msg = downMessage(opts.zh);
		tutorMessages.update((list) => [...list, { role: 'tutor', text: msg, source: 'service_down' }]);
		return;
	}
	tutorServiceDown.set(false);
	tutorStreaming.set(true);
	tutorMessages.update((list) => [...list, { role: 'tutor', text: '', source: 'pending' }]);
	await yieldTick();

	let gathered = '';
	let needKey = false;
	let replySource = 'pending';
	let tokenPaint = 0;
	const paintTokens = (immediate = false) => {
		const apply = () => {
			tokenPaint = 0;
			tutorMessages.update((list) => {
				const next = list.slice();
				const last = next[next.length - 1];
				if (last && last.role === 'tutor') {
					last.text = gathered;
					last.source = replySource;
				}
				return next;
			});
		};
		if (immediate) {
			if (tokenPaint && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tokenPaint);
			tokenPaint = 0;
			apply();
			return;
		}
		if (tokenPaint) return;
		const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: any) => setTimeout(cb, 0);
		tokenPaint = raf(apply) as unknown as number;
	};
	try {
		const resp = await fetch(`${base}/ask`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
			body: JSON.stringify({
				question,
				snapshot: sanitizeSnapshot(opts.snapshot),
				target: opts.target || undefined
			})
		});
		if (!resp.ok || !resp.body) {
			throw new Error(resp.status === 404 ? 'service_down' : `ask_failed_${resp.status}`);
		}
		const reader = resp.body.getReader();
		const dec = new TextDecoder();
		let buf = '';
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			buf = parseSseChunk(buf, (ev, data) => {
				if (ev === 'token' && data?.text) {
					gathered += String(data.text);
					paintTokens(false);
				} else if (ev === 'tool') {
					applyTool(data);
				} else if (ev === 'thinking' && data?.text) {
					tutorThinking.update((t) => t + String(data.text));
				} else if (ev === 'meta') {
					needKey = !!(data?.needKey);
					if (data?.source) replySource = String(data.source);
					const taught = data?.taughtId ? [data.taughtId] : Array.isArray(data?.ids) && data.ids.length ? [data.ids[0]] : [];
					if (taught.length) rememberTaughtIds(taught);
				} else if (ev === 'done') {
					needKey = needKey || !!(data?.needKey);
					if (data?.source) replySource = String(data.source);
				}
			});
		}
		paintTokens(true);
		if (!gathered) {
			gathered = opts.zh ? '这一次没有收到讲解，请再问一次。' : 'No explanation arrived. Please ask again.';
			tutorMessages.update((list) => {
				const next = list.slice();
				const last = next[next.length - 1];
				if (last && last.role === 'tutor') last.text = gathered;
				return next;
			});
		}
		if (needKey) {
			tutorMessages.update((list) => {
				const next = list.slice();
				const last = next[next.length - 1];
				if (last && last.role === 'tutor') last.needKey = true;
				return next;
			});
		}
		rememberTutorQA(question, gathered, typeof opts.snapshot?.course === 'string' ? String(opts.snapshot.course) : '');
	} catch (err: any) {
		const msg =
			String(err?.message || '') === 'service_down'
				? downMessage(opts.zh)
				: opts.zh
					? '问导师时出错了。请确认本机教学服务正在运行。'
					: 'Something went wrong. Check that the local teaching service is running.';
		tutorError.set(msg);
		tutorMessages.update((list) => {
			const next = list.slice();
			const last = next[next.length - 1];
			if (last && last.role === 'tutor') last.text = last.text || msg;
			return next;
		});
	} finally {
		tutorStreaming.set(false);
	}
}

export { get };
