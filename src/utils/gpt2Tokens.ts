/** GPT-2 byte-level tokenization helpers for readable CJK display. */

export type TokenChip = {
	text: string;
	id?: number;
	group?: string;
	incomplete?: boolean;
	pieceIndex?: number;
	pieceCount?: number;
	raw?: string;
};

/** Inverse of the OpenAI GPT-2 bytes_to_unicode map. */
const BYTE_DECODER: Record<string, number> = (() => {
	const bs: number[] = [];
	for (let i = 33; i <= 126; i++) bs.push(i);
	for (let i = 161; i <= 172; i++) bs.push(i);
	for (let i = 174; i <= 255; i++) bs.push(i);
	const cs = bs.slice();
	let n = 0;
	for (let b = 0; b < 256; b++) {
		if (!bs.includes(b)) {
			bs.push(b);
			cs.push(256 + n);
			n += 1;
		}
	}
	const map: Record<string, number> = {};
	for (let i = 0; i < bs.length; i++) map[String.fromCharCode(cs[i])] = bs[i];
	return map;
})();

const NEWLINE_LABEL_ZH = '换行';
const NEWLINE_LABEL_EN = 'line break';

/** Human-readable labels for special / whitespace tokens. Never leak [NEWLINE]. */
export function specialTokenLabel(kind: 'newline' | 'tab' | 'cr', zh = true): string {
	if (kind === 'newline') return zh ? NEWLINE_LABEL_ZH : NEWLINE_LABEL_EN;
	if (kind === 'tab') return zh ? '制表符' : 'tab';
	return zh ? '回车' : 'carriage return';
}

export function formatTokenForDisplay(token: string, zh = true): string {
	const newline = specialTokenLabel('newline', zh);
	const tab = specialTokenLabel('tab', zh);
	const cr = specialTokenLabel('cr', zh);
	return (token || '')
		.replace(/\[NEWLINE\]/g, newline)
		.replace(/\n/g, newline)
		.replace(/\[TAB\]/g, tab)
		.replace(/\t/g, tab)
		.replace(/\[CR\]/g, cr)
		.replace(/\r/g, cr)
		.replace(/\s{2,}/g, (match) => (zh ? `${match.length} 个空格` : `[${match.length} SPACES]`));
}

/** Map a displayed special token back to the character that should be written into the sentence. */
export function tokenTextForCommit(token: string | null | undefined): string {
	const raw = String(token ?? '');
	if (!raw) return '';
	if (
		raw === NEWLINE_LABEL_ZH ||
		raw === NEWLINE_LABEL_EN ||
		raw === '[NEWLINE]' ||
		raw === '↵' ||
		raw === `↵${NEWLINE_LABEL_ZH}` ||
		raw === `↵ ${NEWLINE_LABEL_ZH}` ||
		raw === `↵ ${NEWLINE_LABEL_EN}`
	) {
		return '\n';
	}
	if (raw === '制表符' || raw === 'tab' || raw === '[TAB]') return '\t';
	if (raw === '回车' || raw === 'carriage return' || raw === '[CR]') return '\r';
	return raw
		.replace(/\[NEWLINE\]/g, '\n')
		.replace(/换行/g, '\n')
		.replace(/line break/g, '\n')
		.replace(/\[TAB\]/g, '\t')
		.replace(/\[CR\]/g, '\r');
}

/** Replace leaked internal token names in a tutor bubble or other prose. */
export function humanizeSpecialTokensInText(text: string, zh = true): string {
	const newline = specialTokenLabel('newline', zh);
	const tab = specialTokenLabel('tab', zh);
	const cr = specialTokenLabel('cr', zh);
	return (text || '')
		.replace(/\[NEWLINE\]/g, newline)
		.replace(/\[TAB\]/g, tab)
		.replace(/\[CR\]/g, cr);
}

export function isBrokenTokenText(t: string | null | undefined): boolean {
	if (t == null || t === '') return true;
	if (t === '…' || t === '...' || t === '⋯') return true;
	if (t.includes('\uFFFD')) return true;
	return false;
}

export function rawTokenString(tokenizer: any, id: number): string | null {
	const tryOne = (value: unknown): string | null => {
		if (typeof value === 'string' && value.length) return value;
		if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
		return null;
	};
	try {
		if (typeof tokenizer?.convert_ids_to_tokens === 'function') {
			const got = tryOne(tokenizer.convert_ids_to_tokens(id));
			if (got) return got;
			const gotList = tryOne(tokenizer.convert_ids_to_tokens([id]));
			if (gotList) return gotList;
		}
	} catch {
		/* fall through */
	}
	try {
		const got = tryOne(tokenizer?.model?.convert_ids_to_tokens?.([id]));
		if (got) return got;
	} catch {
		/* fall through */
	}
	try {
		const got = tryOne(tokenizer?.model?.idToToken?.(id) ?? tokenizer?.model?.id_to_token?.(id));
		if (got) return got;
	} catch {
		/* fall through */
	}
	return null;
}

function tokenBytes(raw: string): Uint8Array | null {
	const out: number[] = [];
	for (const ch of raw) {
		const b = BYTE_DECODER[ch];
		if (b === undefined) return null;
		out.push(b);
	}
	return new Uint8Array(out);
}

function utf8Decode(bytes: Uint8Array): string | null {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

function annotatePieces(infos: TokenChip[]): TokenChip[] {
	const out = infos.map((x) => ({ ...x }));
	let i = 0;
	while (i < out.length) {
		const g = out[i].group;
		if (g) {
			let j = i;
			while (j < out.length && out[j].group === g) j += 1;
			const n = j - i;
			for (let k = 0; k < n; k++) {
				out[i + k].pieceIndex = k + 1;
				out[i + k].pieceCount = n;
			}
			i = j;
		} else {
			i += 1;
		}
	}
	return out;
}

/** Rebuild readable UTF-8 groups from GPT-2 token ids (one chip per token, like the trainer). */
export function tokenInfosFromIds(ids: number[], tokenizer?: any, given?: TokenChip[] | null): TokenChip[] {
	if (given && given.length === ids.length) return annotatePieces(given);
	if (!ids?.length) return [];
	if (!tokenizer) {
		return (given || []).map((x) => ({ ...x }));
	}
	const infos: TokenChip[] = [];
	let pending = new Uint8Array(0);
	let groupStart: number | null = null;
	for (const tid of ids) {
		const raw = rawTokenString(tokenizer, tid);
		const chunk = raw ? tokenBytes(raw) : null;
		if (!chunk) {
			let text = '';
			try {
				text = tokenizer.decode([tid]);
			} catch {
				text = raw || '';
			}
			infos.push({
				text: isBrokenTokenText(text) ? '…' : text,
				id: tid,
				raw: raw || undefined
			});
			pending = new Uint8Array(0);
			groupStart = null;
			continue;
		}
		const merged = new Uint8Array(pending.length + chunk.length);
		merged.set(pending, 0);
		merged.set(chunk, pending.length);
		const text = utf8Decode(merged);
		if (text != null) {
			const item: TokenChip = { text, id: tid, raw: raw || undefined };
			if (groupStart != null) {
				item.group = text;
				for (let j = groupStart; j < infos.length; j++) {
					infos[j].group = text;
					infos[j].incomplete = true;
				}
				groupStart = null;
			}
			infos.push(item);
			pending = new Uint8Array(0);
		} else {
			if (groupStart == null) groupStart = infos.length;
			infos.push({ text: '…', id: tid, incomplete: true, raw: raw || undefined });
			pending = merged;
		}
	}
	return annotatePieces(infos);
}

export function displayLabelForChip(chip: TokenChip, zh = true): string {
	const group = chip.group;
	if (group && (chip.pieceCount || 0) > 1) {
		return `${formatTokenForDisplay(group)}·${chip.pieceIndex}/${chip.pieceCount}`;
	}
	if (isBrokenTokenText(chip.text)) {
		if (group) return formatTokenForDisplay(group);
		return zh ? '半截' : '…';
	}
	return formatTokenForDisplay(chip.text);
}

export function displayLabelsFromIds(ids: number[], tokenizer?: any, given?: TokenChip[] | null, zh = true): string[] {
	return tokenInfosFromIds(ids, tokenizer, given).map((c) => displayLabelForChip(c, zh));
}

export function hasSplitGroups(infos: TokenChip[]): boolean {
	return infos.some((c) => !!c.group && (c.pieceCount || 0) > 1);
}

export function displayDecodedToken(tokenizer: any, id: number, zh = true): string {
	let text = '';
	try {
		text = tokenizer?.decode?.([id]) ?? '';
	} catch {
		text = '';
	}
	if (!isBrokenTokenText(text)) return formatTokenForDisplay(text);
	const infos = tokenInfosFromIds([id], tokenizer);
	if (infos[0]) return displayLabelForChip(infos[0], zh);
	return zh ? '半截词片' : 'byte piece';
}

export const TOKEN_CUT_NOTE_ZH =
	'中文一个字常被切成多片，不是界面故障。这些小片就叫词片，也就是常说的 token。';
export const TOKEN_CUT_NOTE_EN =
	'A Chinese character is often split into several chips — that is not a display bug. These pieces are called 词片, the everyday name for tokens.';

export type TokenChipGroup = {
	group: string | null;
	items: Array<TokenChip & { index: number }>;
};

const PIECE_LABEL_RE = /^(.*)·(\d+)\/(\d+)$/;

/** Parse a display label such as 「残·1/3」 into one character and its piece index. */
export function parsePieceLabel(
	label: string | null | undefined
): { group: string; pieceIndex: number; pieceCount: number } | null {
	const m = PIECE_LABEL_RE.exec(String(label ?? ''));
	if (!m) return null;
	const group = m[1];
	const pieceIndex = Number(m[2]);
	const pieceCount = Number(m[3]);
	if (!group || !Number.isFinite(pieceIndex) || !Number.isFinite(pieceCount) || pieceCount <= 1 || pieceIndex < 1) {
		return null;
	}
	return { group, pieceIndex, pieceCount };
}

export function labelsHaveSplitGroups(labels: string[] | null | undefined): boolean {
	return (labels || []).some((t) => parsePieceLabel(String(t)) != null);
}

/** Group consecutive chips that belong to the same character, as the fine-tune course does. */
export function groupTokenChips(list: Array<TokenChip & { index?: number }>): TokenChipGroup[] {
	const groups: TokenChipGroup[] = [];
	let i = 0;
	while (i < list.length) {
		const g = list[i].group;
		const n = list[i].pieceCount || 0;
		if (g && n > 1) {
			let j = i;
			while (j < list.length && list[j].group === g) j += 1;
			groups.push({
				group: g,
				items: list.slice(i, j).map((item, k) => ({
					...item,
					index: item.index ?? i + k
				}))
			});
			i = j;
		} else {
			groups.push({
				group: null,
				items: [{ ...list[i], index: list[i].index ?? i }]
			});
			i += 1;
		}
	}
	return groups;
}

/** Recover fine-tune-style groups from already-rendered labels such as 「残·1/3」. */
export function groupDisplayLabels(labels: string[] | null | undefined): TokenChipGroup[] {
	const chips = (labels || []).map((text, index) => {
		const parsed = parsePieceLabel(text);
		if (parsed) {
			return {
				text,
				index,
				group: parsed.group,
				pieceIndex: parsed.pieceIndex,
				pieceCount: parsed.pieceCount
			};
		}
		return { text, index };
	});
	return groupTokenChips(chips);
}


/** Mid-column / float labels: show the character once, then only the piece index. */
export function midLabelForChip(label: string, zh = true): string {
	const parsed = parsePieceLabel(label);
	if (!parsed) return formatTokenForDisplay(label, zh);
	if (parsed.pieceIndex === 1) {
		return `${formatTokenForDisplay(parsed.group, zh)} ${parsed.pieceIndex}/${parsed.pieceCount}`;
	}
	return `${parsed.pieceIndex}/${parsed.pieceCount}`;
}

/** True when a displayed GPT-2 token is punctuation, a dash, or a line break. */

export function isPunctOrBreakToken(token: string | null | undefined): boolean {
	if (token == null) return false;
	const raw = String(token);
	if (/\[NEWLINE\]|\[CR\]|\[TAB\]/.test(raw)) return true;
	if (raw === NEWLINE_LABEL_ZH || raw === NEWLINE_LABEL_EN || raw.includes('换行') || raw.includes('line break')) return true;
	if (/[\n\r]/.test(raw) && raw.replace(/[\n\r\sĠ]/g, '') === '') return true;
	let t = raw.replace(/^[Ġ\s\u00A0\u0120]+/, '').replace(/Ġ/g, '').trim();
	if (t === 'Ċ' || t === 'ĉ') return true;
	if (!t) return false;
	if (t === '<|endoftext|>') return false;
	return /^[\p{P}\p{S}]+$/u.test(t);
}
