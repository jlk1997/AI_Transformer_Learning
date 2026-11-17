import { TEXT_PATH_IDS, flashSel, textPathIdAt } from '~/courses/textPath';
import { groupDisplayLabels } from '~/utils/gpt2Tokens';

export type MathCardId = 'cut' | 'prob' | 'attn' | 'layers' | 'residual' | 'denoise' | 'cfg' | 'musicProb' | 'loss' | 'temp' | 'weight' | 'lmhead' | 'cutoff' | 'mask' | 'forward' | 'nextWord';

export type MathStep = { talk: string; expr: string };

export type MathCardModel = {
	id: MathCardId;
	title: string;
	/** Optional door kicker; default is 「看见这一步怎么算」. */
	kicker?: string;
	now: string;
	steps: MathStep[];
	pointsTo: string;
	myth: string;
	source: 'real' | 'sketch';
	sourceNote: string;
	highlightSel: string;
	nextLayer?: { title: string; body: string } | null;
	/** pending = scores are extreme (e.g. model still downloading); stale = sentence changed, do not recite old numbers. */
	scale?: 'pending' | 'ready' | 'stale';
};

export function fmt(n: number, d = 2): string {
	if (!Number.isFinite(n)) return '—';
	const a = Math.abs(n);
	if (a !== 0 && (a >= 10000 || a < 0.005)) return n.toExponential(2);
	return n.toFixed(d);
}

export function fmtPct(p: number, d = 1): string {
	if (!Number.isFinite(p)) return '—';
	return `${(p * 100).toFixed(d)}%`;
}

/** Scores outside this range make e^score unreadable (scientific notation or underflow). */
export const HUMAN_LOGIT_ABS = 20;

export function scoresNeedPendingWalk(scores: number[]): boolean {
	return scores.some((s) => !Number.isFinite(s) || Math.abs(s) > HUMAN_LOGIT_ABS);
}

export function tokLabel(raw: string): string {
	const t = (raw ?? '').replace(/\s/g, '');
	if (!t) return '␣';
	return t.length > 12 ? `${t.slice(0, 10)}…` : t;
}

/** Visible suffix added after a generate click, used while scores are still stale. */
export function appendedTextSuffix(live: string, scored: string): string {
	const liveRaw = String(live ?? '');
	const scoredRaw = String(scored ?? '');
	if (!liveRaw.trim() || !scoredRaw.trim()) return '';
	if (liveRaw.startsWith(scoredRaw)) return liveRaw.slice(scoredRaw.length);
	const liveT = liveRaw.trimEnd();
	const scoredT = scoredRaw.trimEnd();
	if (liveT.startsWith(scoredT)) return liveT.slice(scoredT.length);
	return '';
}

export type TextMathOpts = { hasDrawnWord?: boolean; chineseCut?: boolean };

export function textMathUnlocked(
	id: 'cut' | 'prob' | 'attn' | 'layers' | 'residual' | 'lmhead' | 'mask' | 'nextWord',
	idx: number,
	pathDone: boolean,
	opts?: TextMathOpts
): boolean {
	if (id === 'nextWord') {
		// After the first generated word, and only while still on that first
		// stop — once the learner is on 词片, the door is the cut.
		if (opts?.chineseCut) return false;
		return !!opts?.hasDrawnWord && (pathDone ? false : idx < 1);
	}
	if (pathDone) return true;
	if (id === 'cut' && opts?.chineseCut) return true;
	if (id === 'cut' || id === 'prob' || id === 'lmhead') return idx >= 1;
	if (id === 'attn' || id === 'mask') return idx >= 2;
	if (id === 'layers') return idx >= 3;
	if (id === 'residual') return idx >= 4;
	return false;
}

export function textTempWalkUnlocked(idx: number, pathDone: boolean, knobsOn: boolean): boolean {
	const id = textPathIdAt(idx);
	// This station itself invites the learner to twist the knobs, even if the
	// verify jump only set the lesson index and has not yet opened the panel.
	if (id === 'knobs' || id === 'invite') return true;
	if (!knobsOn) return false;
	if (pathDone) return true;
	return false;
}

export function musicTempWalkUnlocked(idx: number, knobsOn: boolean): boolean {
	if (!knobsOn) return false;
	// map, step, listen, knobs, invite
	return idx >= 3;
}

export function defaultTextMathId(
	idx: number,
	pathDone: boolean,
	knobsOn = false,
	opts?: TextMathOpts
): MathCardId | null {
	// Pick the walk that matches this station so the quiet door names the
	// current idea. The text path still must not auto-expand the dock
	// (one idea at a time); MathWalkDock keeps cardOpen false on text.
	const id = textPathIdAt(idx);
	if (id === 'generate') {
		if (opts?.chineseCut && textMathUnlocked('cut', idx, pathDone, opts)) return 'cut';
		if (opts?.hasDrawnWord && textMathUnlocked('nextWord', idx, pathDone, opts)) return 'nextWord';
		return null;
	}
	if (id === 'tokens' && textMathUnlocked('cut', idx, pathDone, opts)) return 'cut';
	if (id === 'attention' && textMathUnlocked('attn', idx, pathDone, opts)) return 'attn';
	if (id === 'layers') {
		if (textMathUnlocked('layers', idx, pathDone, opts)) return 'layers';
		if (textMathUnlocked('attn', idx, pathDone, opts)) return 'attn';
	}
	if (id === 'residual' && textMathUnlocked('residual', idx, pathDone, opts)) return 'residual';
	if (id === 'knobs' || id === 'invite') {
		if (textTempWalkUnlocked(idx, pathDone, knobsOn)) return 'temp';
		if (textMathUnlocked('prob', idx, pathDone, opts)) return 'prob';
		return null;
	}
	if (textMathUnlocked('cut', idx, pathDone, opts) && id === 'tokens') return 'cut';
	if (textMathUnlocked('prob', idx, pathDone, opts)) return 'prob';
	return null;
}

export function defaultImageMathId(
	idx: number,
	step: number,
	knobsUnlocked: boolean
): MathCardId | null {
	if (step <= 0) return null;
	const id = ['map', 'step', 'again', 'knobs', 'invite'][Math.min(Math.max(idx, 0), 4)];
	if (id === 'knobs' && knobsUnlocked) return 'cfg';
	// After one denoise step, the optional door stays about that step —
	// including first-eye (map) and the later invite stop.
	return 'denoise';
}

export function defaultMusicMathId(idx: number, hasGenerated: boolean, knobsOn = false): MathCardId | null {
	if (musicTempWalkUnlocked(idx, knobsOn) && idx === 3) return 'temp';
	if (!hasGenerated) return null;
	// After a note appears, the optional door points at that note / score,
	// including first-eye (idx 0).
	return 'musicProb';
}

export function flashMathTarget(sel: string) {
	if (sel) void flashSel(sel);
}

export type ProbRow = {
	token?: string;
	logit?: number;
	scaledLogit?: number;
	probability?: number;
	topKLogit?: number;
	cutoffIndex?: number;
	rank?: number;
};


export function buildNextWordCard(
	toks: string[],
	opts: { zh: boolean; stale?: boolean; word?: string; live?: string; scored?: string }
): MathCardModel {
	const { zh, stale } = opts;
	const locked = String(opts.word ?? '');
	const suffix = appendedTextSuffix(opts.live || '', opts.scored || '');
	// While scores belong to the previous sentence, do not name its last token
	// (that was the bug: the door said 「to」 after 「make」 had already been appended).
	const last = stale
		? ''
		: (toks || []).map((t) => String(t ?? '')).filter((t) => t.length > 0).slice(-1)[0] || '';
	const raw = String(locked || suffix || last || '');
	const word = raw ? tokLabel(raw) : '';
	const named = !!(word && word !== '␣');
	const title = named
		? zh
			? `刚才出现的「${word}」是怎么来的`
			: `Where the word that just appeared, “${word}”, came from`
		: zh
			? '刚才出现的这个词是怎么来的'
			: 'Where the word that just appeared came from';
	const kicker = zh ? '看见刚才出现的词怎么算' : 'See how the word I just saw was chosen';

	if (stale || !named) {
		return {
			id: 'nextWord',
			title,
			kicker,
			now: zh
				? '现在先等一等：新词已经接到句子后面，但这一句的词片和百分比还在重算。等「正在按新句子重算」结束，再对上刚才出现的那个词。'
				: 'What to do now: wait. The new word is already on the sentence, but the chips and percentages for this sentence are still being recomputed. When “Recomputing for the new sentence” finishes, this walk will point at the word that just appeared.',
			steps: [
				{
					talk: zh
						? '先不要读右边上一句留下来的百分比。那些数不是刚才这个新词的得分，也还不是下一句的新排名。'
						: 'Do not read the percentages still on the right. Those numbers are not the score of the word that just appeared, and they are not the new ranking yet.',
					expr: zh ? '先等重算，不读上一句的百分比' : 'wait for the rescore; do not read the previous percentages'
				},
				{
					talk: zh
						? '重算完成后，再看句子末尾刚才接上的那一个词。右边的表那时已经在猜再下一个词，不要把它当成刚才那个词的得分。'
						: 'After the rescore, look at the word that was just appended at the end of the sentence. The table on the right will already be guessing the next word after that, so do not read it as the score of the word you just saw.',
					expr: zh ? '先对上末尾那个词，再讲它是怎么被选出来的' : 'first find the word at the end, then how it was chosen'
				}
			],
			pointsTo: zh
				? '得到画面上哪一块：先看角落里「正在按新句子重算」的提示。重算结束后，再看输入框里句子的末尾。'
				: 'Where it shows up: first the “Recomputing for the new sentence” banner. After the rescore, look at the end of the sentence in the input box.',
			myth: zh
				? '常见误解：重算时右边留下来的百分比，不是刚才出现的那个词的得分。'
				: 'A common mix-up: the percentages left on the right during a rescore are not the score of the word that just appeared.',
			source: 'sketch',
			sourceNote: zh
				? '这一步先对上刚才出现的词，不念上一句的百分比。'
				: 'This step first points at the word that just appeared. It does not read percentages from the previous sentence.',
			highlightSel: '[data-te-score="banner"], [data-te-score="title"], [data-te-input="committed"]',
			scale: stale ? 'stale' : 'pending'
		};
	}

	return {
		id: 'nextWord',
		title,
		kicker,
		now: zh
			? `现在算什么：你刚才看见「${word}」被接到句子后面。先对上这个词，再看它是怎样被选出来的。`
			: `What we are computing: you just saw “${word}” appended to the sentence. First find that word, then see how it was chosen.`,
		steps: [
			{
				talk: zh
					? `看输入框里句子的末尾：「${word}」已经接在后面。这就是你刚才点「生成下一个词」之后看见的那一步。`
					: `Look at the end of the sentence in the input box: “${word}” is already appended. That is the step you just saw after clicking “Generate the next word”.`,
				expr: zh ? `句子末尾刚才出现的词：「${word}」` : `word that just appeared at the end: “${word}”`
			},
			{
				talk: zh
					? '它是从当时的候选名单里抽出来的。右边现在这张百分比表，已经在猜再下一个词，不是刚才「' + word + '」的得分。不要把表上的数读成这个词的成绩。'
					: 'It was drawn from the candidate list at that moment. The percentage table on the right is already guessing the next word after this one, not the score of “' + word + '”. Do not read those numbers as this word’s grade.',
				expr: zh
					? `右边的表 ≠ 「${word}」的得分（已在猜再下一个）`
					: `the table on the right ≠ the score of “${word}” (it is already guessing the next word)`
			},
			{
				talk: zh
					? '先把这个词对上，再往下看这句话是怎样被切成词片的。那是下一步要看见的现象，不是现在这张表上的百分比。'
					: 'First match this word, then look at how this sentence is cut into 词片. That is the next phenomenon to see, not the percentages on the table now.',
				expr: zh ? '先对上刚才出现的词，再看切开' : 'first the word that just appeared, then the cut'
			}
		],
		pointsTo: zh
			? '得到画面上哪一块：输入框里句子末尾刚才接上的那个词，以及左边词片列最后一片。'
			: 'Where it shows up: the word just appended at the end of the input box, and the last chip in the left-hand column.',
		myth: zh
			? '常见误解：右边的百分比是刚才那个新词的得分。其实表已经往前走了；预览里「它正要猜的下一个词」也还不是刚才出现的那个。'
			: 'A common mix-up: thinking the percentages on the right are the score of the word that just appeared. The table has already moved on, and the “next word it is about to guess” preview is also not the word you just saw.',
		source: 'sketch',
		sourceNote: zh
			? '刚才那一次抽词的名单已经从画面上翻过去了，所以这一步用句子末尾的真词来对现象，标示意。'
			: 'The ranking from that draw has already left the screen, so this step uses the real word at the end of the sentence to point at the phenomenon, and is marked as a sketch.',
		highlightSel: '[data-te-input="committed"], [data-te-tok="group-chip"]:last-child, [data-te-tok-label]:last-of-type',
		scale: 'ready'
	};
}

export function buildCutCard(
	toks: string[],
	opts: { zh: boolean; stale?: boolean }
): MathCardModel {
	const { zh, stale } = opts;
	const labels = (toks || []).map((t) => String(t ?? '')).filter((t) => t.length > 0);
	const groups = stale ? [] : groupDisplayLabels(labels);
	const splits = groups.filter((g) => g.group && g.items.length > 1);
	const example = splits.find((g) => g.group === '残') || splits[0];
	const pieceCount = labels.length;
	const title = !stale && example?.group
		? zh
			? `「${example.group}」是怎么切成 ${example.items.length} 片的`
			: `How “${example.group}” was cut into ${example.items.length} pieces`
		: zh
			? '这句话是怎么切成词片的'
			: 'How this sentence was cut into 词片';

	if (stale || pieceCount < 1) {
		return {
			id: 'cut',
			title,
			now: zh
				? '现在先等一等：句子已经换了，左边的词片还是上一句的。等「正在按新句子重算」结束，再看这一句是怎么切的。'
				: 'What to do now: wait. The sentence has changed, but the chips on the left still belong to the previous sentence. When “Recomputing for the new sentence” finishes, this walk will show how this sentence was cut.',
			steps: [
				{
					talk: zh
						? '先不要读左边现在还留着的字，也不要读右边上一句的百分比。那些数还不是这一句的。'
						: 'Do not read the chips still on the left, and do not read the percentages on the right. Those numbers still belong to the previous sentence.',
					expr: zh ? '先等重算，不读上一句的词片或百分比' : 'wait for the rescore; do not read the previous sentence'
				},
				{
					talk: zh
						? '重算完成后，左边会换成这一句的词片。一个汉字常被切成好几片，那不是界面故障。'
						: 'After the rescore, the left column will show this sentence’s 词片. A Chinese character is often split into several chips — that is not a display bug.',
					expr: zh ? '下一句的切法会按屏幕上的真词片来讲' : 'the cut will use the live chips on the screen'
				}
			],
			pointsTo: zh
				? '得到画面上哪一块：先看角落里「正在按新句子重算」的提示。词片换上之后，再看左边那一列。'
				: 'Where it shows up: first the “Recomputing for the new sentence” banner. After the chips update, look at the left-hand column.',
			myth: zh
				? '常见误解：重算时留下来的上一帧，不是这一句已经被切好的结果。'
				: 'A common mix-up: the last frame left on screen during a rescore is not the cut of this new sentence.',
			source: 'sketch',
			sourceNote: zh
				? '词片还没按新句子换上，这一步先不讲切法，也不念上一句的百分比。'
				: 'The chips have not been updated for the new sentence yet. This step does not explain the cut, and it does not read percentages from the previous sentence.',
			highlightSel: '[data-te-score="banner"], [data-te-score="title"]',
			scale: 'stale'
		};
	}

	const single = groups.find((g) => !g.group || g.items.length === 1);
	const singleName = tokLabel(single?.items[0]?.text || (zh ? '的' : 'the'));
	const exampleName = example?.group ? String(example.group) : '';
	const exampleN = example?.items.length || 0;
	const examplePieces = example
		? example.items
			.map((item, i) => `${exampleName}·${item.pieceIndex ?? i + 1}/${item.pieceCount ?? exampleN}`)
			.join('，')
		: '';
	const groupList = splits
		.slice(0, 4)
		.map((g) => (zh ? `「${g.group}」${g.items.length} 片` : `“${g.group}” × ${g.items.length}`))
		.join(zh ? '，' : ', ');

	const steps: MathStep[] = [
		{
			talk: zh
				? `左边这一列，是当前这句话被切开后的词片，一共 ${pieceCount} 片。模型读的是这些小片，不一定是一个完整的字或词。`
				: `The left-hand column is this sentence after it was cut into 词片 — ${pieceCount} pieces in all. The model reads these pieces; a piece is not always a whole word or character.`,
			expr: zh ? `当前一句：${pieceCount} 个词片` : `this sentence: ${pieceCount} 词片`
		}
	];
	if (example) {
		steps.push({
			talk: zh
				? `以「${exampleName}」为例：它被切成了 ${exampleN} 片（${examplePieces}）。左边收成一枚「${exampleName}」芯片，角上的 ${exampleN} 表示有几片，不是把同一个字又抄了几遍。`
				: `Take “${exampleName}”: it was cut into ${exampleN} pieces (${examplePieces}). On the left they sit in one “${exampleName}” chip, and the ${exampleN} marks how many pieces there are — it is not the same character copied over and over.`,
			expr: zh
				? `「${exampleName}」→ ${exampleN} 片：${examplePieces}`
				: `“${exampleName}” → ${exampleN} pieces: ${examplePieces}`
		});
		if (groupList && splits.length > 1) {
			steps.push({
				talk: zh
					? `这句里还有其他被切开的字：${groupList}。有的字只需一片，比如「${singleName}」，所以只出现一次。`
					: `Other characters in this sentence were also split: ${groupList}. Some need only one piece, such as “${singleName}”, so they appear once.`,
				expr: groupList
			});
		} else if (single) {
			steps.push({
				talk: zh
					? `有的字只需一片，比如「${singleName}」，所以只出现一次。被切开不是故障；这些小片就叫词片，也就是常说的 token。`
					: `Some characters need only one piece, such as “${singleName}”, so they appear once. A split is not a display bug: these pieces are called 词片, the everyday name for tokens.`,
				expr: zh ? `整字只需一片：${singleName}` : `one-piece character: ${singleName}`
			});
		}
	} else {
		steps.push({
			talk: zh
				? '英文例句常常看起来更整，是因为这台模型主要按英文训练，一个词往往就是一片。即便如此，词片仍然是 token，不一定等于语法上的一个词。'
				: 'English examples often look tidier because this model was trained mainly on English, so a word is often one piece. Even then, a 词片 is a token, not always a grammatical word.',
			expr: zh ? '英文也按词片读，只是常常一片就是一个词' : 'English is also read as 词片; a piece often looks like a word'
		});
	}
	steps.push({
		talk: zh
			? '中文一个字常被切成多片，不是界面故障。这些小片就叫词片，也就是常说的 token。'
			: 'A Chinese character is often split into several chips — that is not a display bug. These pieces are called 词片, the everyday name for tokens.',
		expr: zh ? '词片 = token' : '词片 = token'
	});

	return {
		id: 'cut',
		title,
		now: zh
			? example
				? `现在算什么：当前这句话是怎样被切成词片的。先看「${exampleName}」为什么会变成 ${exampleN} 片。`
				: '现在算什么：当前这句话是怎样被切成词片的。左边每一片，就是模型实际读写的一小片。'
			: example
				? `What we are computing: how this sentence was cut into 词片. First see why “${exampleName}” became ${exampleN} pieces.`
				: 'What we are computing: how this sentence was cut into 词片. Each chip on the left is a piece the model actually reads and writes.',
		steps,
		pointsTo: zh
			? '得到画面上哪一块：左边词片那一列，以及「不是界面故障」那一行说明。'
			: 'Where it shows up: the 词片 column on the left, and the “not a display bug” note.',
		myth: zh
			? '常见误解：左边同一字出现好几行，不是显示重复，也不是把句子又抄了几遍。那是一个字被切成了好几片。'
			: 'A common mix-up: seeing the same character on several rows is not a display glitch, and not the sentence copied over and over. It is one character cut into several pieces.',
		source: 'real',
		sourceNote: zh
			? '切法来自当前左边这一列已经显示出来的词片（真数）。换一句，切开的片数也会变。'
			: 'The cut comes from the 词片 already shown in the left-hand column (real values). A new sentence can be cut differently.',
		highlightSel:
			'[data-te-tok-label], .embedding .column, [data-te-zone="left"], .cut-note',
		scale: 'ready'
	};
}

export function buildProbCard(
	rows: ProbRow[],
	opts: { zh: boolean; knobsOn: boolean; temperature: number; stale?: boolean }
): MathCardModel | null {
	const { zh, knobsOn, temperature: T, stale } = opts;
	if (stale) {
		return {
			id: 'prob',
			title: zh ? '右边的百分比是怎么来的' : 'Where the percentages on the right come from',
			now: zh
				? '现在先等一等：句子已经换了，右边的百分比还是上一句的。等「正在按新句子重算」结束，再用这一句的表走一遍。'
				: 'What to do now: wait. The sentence has changed, but the percentages on the right still belong to the previous sentence. When “Recomputing for the new sentence” finishes, this walk will use this sentence’s table.',
			steps: [
				{
					talk: zh
						? '先不要读右边现在还留着的百分比。那些数还不是这一句的，念出来会对不上你刚换上的句子。'
						: 'Do not read the percentages still on the right. Those numbers still belong to the previous sentence, and reciting them would not match the sentence you just switched to.',
					expr: zh ? '先等重算，不读上一句的百分比' : 'wait for the rescore; do not read the previous percentages'
				},
				{
					talk: zh
						? '重算完成后，再走「先看分数 → 变成正数 → 加成 100%」。那一步才叫 softmax。'
						: 'After the rescore, we will walk through “look at the scores → turn them positive → make them add to 100%”. That step is called softmax.',
					expr: zh ? '下一句的百分比会按屏幕上的真数来讲' : 'the percentages will use the live table on the screen'
				}
			],
			pointsTo: zh
				? '得到画面上哪一块：先看角落里「正在按新句子重算」的提示。表换上之后，再看右边「要猜的下一个词」。'
				: 'Where it shows up: first the “Recomputing for the new sentence” banner. After the table updates, look at the next-word table on the right.',
			myth: zh
				? '常见误解：重算时留下来的上一帧百分比，不是新句子的机会大小。'
				: 'A common mix-up: percentages left on screen during a rescore are not the chances for the new sentence.',
			source: 'sketch',
			sourceNote: zh
				? '百分比还没按新句子换上，这一步先不念上一句的数。'
				: 'The percentages have not been updated for the new sentence yet. This step does not read numbers from the previous sentence.',
			highlightSel: '[data-te-score="banner"], [data-te-score="title"]',
			scale: 'stale'
		};
	}
	const visible = (rows || [])
		.filter((r) => Number.isFinite(Number(r.scaledLogit ?? r.logit)) && Number(r.probability) > 0)
		.slice(0, 4);
	if (visible.length < 2) return null;

	const scores = visible.map((r) => Number(r.scaledLogit ?? r.logit));
	const probs = visible.map((r) => Number(r.probability));
	const names = visible.map((r) => tokLabel(String(r.token ?? '')));
	const pending = scoresNeedPendingWalk(scores);
	const exps = scores.map((s) => Math.exp(s));
	const p0 = probs[0];
	const sum = p0 > 0 && Number.isFinite(exps[0]) ? exps[0] / p0 : exps.reduce((a, b) => a + b, 0);
	const check = exps.map((e) => e / sum);
	const source: 'real' | 'sketch' = Number.isFinite(sum) && sum > 0 ? 'real' : 'sketch';

	const scoreList = names.map((n, i) => `${n} ${fmt(scores[i])}`).join('，');
	const expList = names.map((n, i) => `e^${fmt(scores[i])} ≈ ${fmt(exps[i], 0)}`).join('，');
	const pctFromTable = names.map((n, i) => `${n} ${fmtPct(probs[i])}`).join('，');
	const pctList = names
		.map(
			(n, i) =>
				`${n}：${fmt(exps[i], 0)} ÷ ${fmt(sum, 0)} ≈ ${fmtPct(check[i])}（${zh ? '表上' : 'on the table'} ${fmtPct(probs[i])}）`
		)
		.join('\n');

	const steps: MathStep[] = pending
		? [
				{
					talk: zh
						? `右边这张表上，已经写出了每个词的百分比。先看最上面几个：${pctFromTable}。整张表加起来是 100%。`
						: `The table on the right already shows a percentage for each word. The top ones are: ${pctFromTable}. The whole table adds up to 100%.`,
					expr: zh ? `${pctFromTable}。整张表合计 100%` : `${pctFromTable}. The whole table sums to 100%.`
				},
				{
					talk: zh
						? '分数还在准备，先看表上的百分比。等分数回到人能读的尺度，再走「先看分数 → 变成正数 → 加成 100%」，那一步才叫 softmax。'
						: 'The scores are still being prepared. For now, read the percentages on the table. When the scores return to a human-readable scale, we will walk through “look at the scores → turn them positive → make them add to 100%”. That step is called softmax.',
					expr: zh ? '先看表上的百分比，暂不展开分数' : 'Read the table percentages first; scores come later'
				}
			]
		: [
		{
			talk: zh
				? `右边这张表上，每个词先有一个分数，还不是百分比。先看最上面几个：${scoreList}。`
				: `On the right-hand table, each word first has a score, not a percentage. The top ones are: ${scoreList}.`,
			expr: scoreList
		},
		{
			talk: zh
				? '把分数变成都是正的、越大越突出的数。分数只高一点，这个数就会大很多。不必先会 e，只要看见这个拉开的效果。'
				: 'Turn each score into a positive number that grows fast: a slightly higher score becomes much larger. You do not need to know e yet — just see how the gap widens.',
			expr: expList
		},
		{
			talk: zh
				? '把词表里所有词的这些正数加起来，得到总和。表上没列出来的词也算在内，所以我们用表上的百分比把总和还原出来。'
				: 'Add up those positive numbers for every word in the vocabulary to get a total. Words not shown in the table still count, so we recover the total from a percentage on the table.',
			expr: zh
				? `${names[0]}：${fmt(exps[0], 0)} ÷ ${fmtPct(p0)} ≈ ${fmt(sum, 0)}`
				: `${names[0]}: ${fmt(exps[0], 0)} ÷ ${fmtPct(p0)} ≈ ${fmt(sum, 0)}`
		},
		{
			talk: zh
				? '每个词的百分比 = 它的正数 ÷ 总和。加起来一定是 100%。请对照右边表上的数。'
				: 'Each word’s percentage = its positive number ÷ the total. They add up to 100%. Check this against the table on the right.',
			expr: pctList
		}
	];

	if (!pending && knobsOn) {
		steps.push({
			talk: zh
				? `你已经见过抽词旋钮。温度会先把分数除一下再做上面的加法。现在温度是 ${fmt(T, 1)}，所以用的是「除过以后」的分数。`
				: `You have already seen the sampling knobs. Temperature divides the scores before the addition above. Temperature is now ${fmt(T, 1)}, so the numbers used here are the divided scores.`,
			expr: zh ? `参与计算的分数 = 原始分数 ÷ ${fmt(T, 1)}` : `score used = raw score ÷ ${fmt(T, 1)}`
		});
	}

	return {
		id: 'prob',
		title: zh ? '右边的百分比是怎么来的' : 'Where the percentages on the right come from',
		now: zh
			? pending
				? '现在算什么：右边「要猜的下一个词」表上已经给出了百分比。分数还在准备，先读表上的数。'
				: '现在算什么：右边「要猜的下一个词」表上的百分比，是怎样从分数算出来的。'
			: pending
				? 'What we are computing: the “next word” table on the right already shows percentages. The scores are still being prepared, so we read the table first.'
				: 'What we are computing: how the percentages in the “next word” table are made from scores.',
		steps,
		pointsTo: zh
			? '得到画面上哪一块：右边那张下一个词的表。把分数变成加起来为 100% 的百分比，这一步叫做 softmax。'
			: 'Where it shows up: the next-word table on the right. This step — turning scores into percentages that add to 100% — is called softmax.',
		myth: zh
			? '常见误解：第一名的分数最高，并不等于下一步一定抽它。百分比只是机会大小。'
			: 'A common mix-up: the top score does not mean that word must be drawn next. A percentage is only a chance.',
		source,
		sourceNote: pending
			? zh
				? '百分比来自当前右侧表（真数）。分数还在准备，这一步先不展开 e 的计算。'
				: 'The percentages come from the current right-hand table (real values). The scores are still being prepared, so this step does not expand the e calculation.'
			: zh
				? source === 'real'
					? '数字来自当前右侧表的分数和百分比（真数）。总和使用表上的百分比还原，所以能和画面对上。'
					: '这一组数对不上当前表，下面只做示意。'
				: source === 'real'
					? 'The numbers come from the scores and percentages on the current right-hand table (real values). The total is recovered from a table percentage so it can match the screen.'
					: 'These numbers do not match the current table; this is only a sketch.',
		highlightSel: '[data-te-zone="right"], .softmax .content, .step.softmax, [data-click="prob-step"]',
		scale: pending ? 'pending' : 'ready'
	};
}

export function buildAttnCard(
	toks: string[],
	matrix: number[][] | undefined,
	opts: { zh: boolean; queryIndex: number; block: number; head: number; stale?: boolean }
): MathCardModel | null {
	const { zh, block: b, head: h } = opts;
	if (opts.stale) {
		return {
			id: 'attn',
			title: zh ? '回头看，是怎么变成一条亮线的' : 'How “looking back” becomes a lit line',
			now: zh
				? '现在先等一等：句子已经换了，中间的亮线和权重还是上一句的。等「正在按新句子重算」结束，再用这一句的线走一遍。'
				: 'What to do now: wait. The sentence has changed, but the lit lines and weights still belong to the previous sentence. When “Recomputing for the new sentence” finishes, this walk will use this sentence’s lines.',
			steps: [
				{
					talk: zh
						? '先不要读中间现在还留着的亮线，也不要念上一句的权重百分比。那些数还不是这一句的。'
						: 'Do not read the lit lines still in the middle, and do not recite weights from the previous sentence. Those numbers are not for this sentence yet.',
					expr: zh ? '先等重算，不读上一句的亮线或权重' : 'wait for the rescore; do not read the previous weights'
				}
			],
			pointsTo: zh
				? '得到画面上哪一块：先看角落里「正在按新句子重算」的提示。线换上之后，再看中间那些亮着的线。'
				: 'Where it shows up: first the “Recomputing for the new sentence” banner. After the lines update, look at the lit lines in the middle.',
			myth: zh
				? '常见误解：重算时留下来的上一帧亮线，不是新句子正在回头看的结果。'
				: 'A common mix-up: lit lines left on screen during a rescore are not the new sentence looking back.',
			source: 'sketch',
			sourceNote: zh
				? '权重还没按新句子换上，这一步先不念上一句的百分比。'
				: 'The weights have not been updated for the new sentence yet. This step does not read percentages from the previous sentence.',
			highlightSel: '[data-te-score="banner"], [data-te-score="title"]',
			scale: 'stale'
		};
	}
	if (!toks?.length) return null;
	let q = opts.queryIndex;
	if (q < 0 || q >= toks.length) q = toks.length - 1;
	const row: number[] = Array.isArray(matrix?.[q]) ? matrix[q].map((x) => Number(x)) : [];
	const pairs = toks
		.map((t, i) => ({ t: tokLabel(t), w: Number.isFinite(row[i]) ? row[i] : 0, i }))
		.filter((p) => p.i <= q);
	const sumReal = pairs.reduce((a, p) => a + (p.w > 0 ? p.w : 0), 0);
	const ready = Boolean(matrix) && sumReal > 0.5;
	const source: 'real' | 'sketch' = ready ? 'real' : 'sketch';
	const shown = ready ? pairs : [];
	const top = [...shown].sort((a, c) => c.w - a.w).slice(0, 4);
	const qName = tokLabel(toks[q]);
	const weightList = top.map((p) => `${p.t} ${fmtPct(p.w)}`).join('，');
	const sumStr = ready
		? fmt(
				shown.reduce((a, p) => a + p.w, 0),
				2
			)
		: '—';
	const layerName = zh ? `第 ${b + 1} 层` : `layer ${b + 1}`;
	const headName = zh ? `第 ${h + 1} 个头` : `head ${h + 1}`;

	const weightStep: MathStep = ready
		? {
				talk: zh
					? `再把这些分变成加起来为 1 的权重，也可以看成 100%。当前头、当前层里，看「${qName}」时大约是：${weightList}。加起来约 ${sumStr}。`
					: `Those scores are then turned into weights that add up to 1, which you can also read as 100%. In this head and layer, looking from “${qName}”, they are about: ${weightList}. They sum to about ${sumStr}.`,
				expr: weightList + (zh ? `  合计 ${sumStr}` : `  sum ${sumStr}`)
			}
		: {
				talk: zh
					? '再把这些分变成加起来为 100% 的权重。眼下权重还没落到屏幕上（可能还在准备），我不会编一套假的百分比。权重出现以后，这一行会加起来是 100%，更亮的线就是被多看的词。'
					: 'Those scores then become weights that add up to 100%. The weights are not on the screen yet (they may still be preparing), so I will not invent fake percentages. When they appear they add to 100%, and the brighter line is the word looked at more.',
				expr: zh ? '权重还在准备' : 'weights still being prepared'
			};

	const mixStep: MathStep = ready
		? {
				talk: zh
					? `最后按权重把前面词带来的内容混合。权重最大的「${top[0]?.t ?? ''}」混进来最多。`
					: `Finally the content from earlier words is mixed by these weights. “${top[0]?.t ?? ''}”, with the largest weight, is mixed in the most.`,
				expr: zh
					? `混合 ≈ ${top.map((p) => `${fmtPct(p.w)} × ${p.t}的内容`).join(' + ')}`
					: `mix ≈ ${top.map((p) => `${fmtPct(p.w)} × content of ${p.t}`).join(' + ')}`
			}
		: {
				talk: zh
					? '混合的道理不变：权重更大的前面词，混进来更多。等权重出现后，推演会用屏幕上的真数带你看。'
					: 'The mix works the same way: earlier words with larger weights are mixed in more. When the weights appear, this walk will use the real numbers on the screen.',
				expr: zh ? '先等权重出现再读真数' : 'wait for live weights'
			};

	const steps: MathStep[] = [
		{
			talk: zh
				? `先看中间被点亮的那些线。写到「${qName}」时，模型会回头看已经出现的词。线更亮的，就是这一步多看了一眼的地方。`
				: `First look at the lit lines in the middle. When writing “${qName}”, the model looks back at the words already there. A brighter line is the word this step looks at more.`,
			expr: zh ? `当前词：${qName}（第 ${q + 1} 片）` : `Current word: ${qName} (piece ${q + 1})`
		},
		{
			talk: zh
				? '它先给每个前面的词打一个分：更相关的分数更高。分还不是权重。'
				: 'It first gives each earlier word a score: more related words get a higher score. A score is not yet a weight.',
			expr: zh ? '打分：谁更相关，分越高' : 'Scoring: more related → higher score'
		},
		weightStep,
		mixStep,
		{
			talk: zh
				? `再看层和头：现在是${layerName}、${headName}。旁边的箭头可以换一层或换一个头。同一件事做多遍，换一组，中间的亮线会换一副样子。`
				: `Then look at the layer and head: you are on ${layerName}, ${headName}. The arrows let you switch a layer or a head. The same job is done many times; change the set, and the lit lines take on a new pattern.`,
			expr: zh ? `${layerName} · ${headName}` : `${layerName} · ${headName}`
		}
	];

	return {
		id: 'attn',
		title: zh ? '回头看，是怎么变成一条亮线的' : 'How “looking back” becomes a lit line',
		now: zh
			? ready
				? '现在算什么：写到当前这个词时，前面哪些词被多看一眼，又怎样混合进来。'
				: '现在算什么：先看当前词和中间的亮线。权重还在准备，这一步先不编假的百分比。'
			: ready
				? 'What we are computing: when writing the current word, which earlier words are looked at more, and how they are mixed in.'
				: 'What we are computing: first look at the current word and the lit lines. The weights are still being prepared, so this step does not invent percentages.',
		steps,
		pointsTo: zh
			? '得到画面上哪一块：中间那些亮着的线，左边当前这个词，以及换层、换头的箭头。'
			: 'Where it shows up: the lit lines in the middle, the current word on the left, and the layer and head arrows.',
		myth: zh
			? '常见误解：亮线不是「这个词被删掉或被复制」，只是混合时占的份数更大。'
			: 'A common mix-up: a bright line does not mean that word is deleted or copied. It only gets a larger share in the mix.',
		source,
		sourceNote: ready
			? zh
				? `数字来自当前${layerName}、${headName}、当前亮着的这一行（真数）。换层或换头，权重会变。`
				: `The numbers come from the current row in ${layerName}, ${headName} (real values). Changing the layer or head changes the weights.`
			: zh
				? '当前没读到这一行的真数，或模型还在准备。下面不编假的百分比，先看亮线和层、头。'
				: 'The real row could not be read, or the model is still being prepared. This walk does not invent percentages; first look at the lit lines, then the layer and head.',
		highlightSel:
			'[data-te-zone="left"], [data-te-zone="mid"], [data-click="attention-step"], [data-click="transformer-bounding-title"], [data-click="attention-head"], .attention, .sankey',
		scale: ready ? 'ready' : 'pending',
		nextLayer: {
			title: zh
				? '走完这一步后：提问、标签、内容是什么（可展开）'
				: 'After this step: question, label, and content (expandable)',
			body: zh
				? '每个词的向量会被写成三种用途：提问（我在找什么）、标签（我是什么索引）、内容（真正被按权重混进来的东西）。先把「打分 → 变成加起来为 1 的权重 → 混合」看熟，再去展开中间的 Q、K、V。公式可以先不看。'
				: 'Each word’s vector is written into three uses: a question (what am I looking for), a label (how can I be found), and content (what is actually mixed in by the weights). Get comfortable with “score → weights that add to 1 → mix” before opening Q, K, and V in the middle. You can leave the formulas for later.'
		}
	};
}


export function buildLayersCard(
	toks: string[],
	matrix: number[][] | undefined,
	opts: {
		zh: boolean;
		queryIndex: number;
		block: number;
		head: number;
		fromBlock: number;
		fromHead: number;
		stale?: boolean;
	}
): MathCardModel | null {
	const { zh, block: b, head: h, fromBlock, fromHead } = opts;
	const layerName = zh ? `第 ${b + 1} 层` : `layer ${b + 1}`;
	const headName = zh ? `第 ${h + 1} 个头` : `head ${h + 1}`;
	const fromLayerName = zh ? `第 ${fromBlock + 1} 层` : `layer ${fromBlock + 1}`;
	const fromHeadName = zh ? `第 ${fromHead + 1} 个头` : `head ${fromHead + 1}`;
	const switchedLayer = b !== fromBlock;
	const switchedHead = h !== fromHead;
	const switched = switchedLayer || switchedHead;
	const highlightSel =
		'[data-click="transformer-bounding-title"], [data-click="transformer-block-next-btn"], [data-click="transformer-block-prev-btn"], [data-click="attention-head"], [data-click="attention-head-next-btn"], [data-click="attention-head-prev-btn"], [data-te-zone="mid"], .attention, .sankey, .attention-matrix';

	if (opts.stale) {
		return {
			id: 'layers',
			title: zh
				? '换一层或换一个头，哪条线和哪张表会变'
				: 'Switch a layer or a head — which line and which table change',
			now: zh
				? '现在先等一等：句子已经换了，中间的亮线和权重还是上一句的。等「正在按新句子重算」结束，再点旁边的箭头，看哪一条线和哪一张表会跟着变。'
				: 'What to do now: wait. The sentence has changed, but the lit lines and weights still belong to the previous sentence. When “Recomputing for the new sentence” finishes, use the arrows to see which line and which table follow the switch.',
			steps: [
				{
					talk: zh
						? '先不要读中间现在还留着的亮线，也不要念上一句的权重。等这一句换上之后，再点「第 1 个 Transformer 块」旁的箭头换一层，或换一个头。'
						: 'Do not read the lit lines still in the middle, and do not recite weights from the previous sentence. When this sentence is on screen, use the arrows beside the block title to switch a layer, or switch a head.',
					expr: zh ? '先等重算，再点换层、换头的箭头' : 'wait for the rescore, then use the layer and head arrows'
				}
			],
			pointsTo: zh
				? '得到画面上哪一块：先看角落里「正在按新句子重算」的提示。换上之后，再看块标题旁的箭头、头标题旁的箭头、中间的亮线，以及这一头的权重表。'
				: 'Where it shows up: first the “Recomputing for the new sentence” banner. After the update, look at the arrows beside the block title and the head title, the lit lines in the middle, and this head’s weight table.',
			myth: zh
				? '常见误解：重算时留下来的上一帧亮线，不是你刚换的那一层或那一个头正在看的结果。'
				: 'A common mix-up: lit lines left on screen during a rescore are not the layer or head you just switched to.',
			source: 'sketch',
			sourceNote: zh
				? '权重还没按新句子换上，这一步先不念上一句的百分比。'
				: 'The weights have not been updated for the new sentence yet. This step does not read percentages from the previous sentence.',
			highlightSel: '[data-te-score="banner"], [data-te-score="title"], [data-click="transformer-bounding-title"], [data-click="attention-head"]',
			scale: 'stale'
		};
	}

	if (!toks?.length) return null;
	let q = opts.queryIndex;
	if (q < 0 || q >= toks.length) q = toks.length - 1;
	const row: number[] = Array.isArray(matrix?.[q]) ? matrix[q].map((x) => Number(x)) : [];
	const pairs = toks
		.map((t, i) => ({ t: tokLabel(t), w: Number.isFinite(row[i]) ? row[i] : 0, i }))
		.filter((p) => p.i <= q);
	const sumReal = pairs.reduce((a, p) => a + (p.w > 0 ? p.w : 0), 0);
	const ready = Boolean(matrix) && sumReal > 0.5;
	const source: 'real' | 'sketch' = ready ? 'real' : 'sketch';
	const shown = ready ? pairs : [];
	const top = [...shown].sort((a, c) => c.w - a.w).slice(0, 4);
	const qName = tokLabel(toks[q]);
	const weightList = top.map((p) => `${p.t} ${fmtPct(p.w)}`).join('，');

	const changeTalk = switched
		? zh
			? switchedLayer && switchedHead
				? `你刚才把层从${fromLayerName}换到了${layerName}，又把头从${fromHeadName}换到了${headName}。请先看中间那些亮着的线：同一句，换一组，线就换了一副样子。`
				: switchedLayer
					? `你刚才用块标题旁的箭头，从${fromLayerName}换到了${layerName}（现在仍是${headName}）。请先看中间那些亮着的线：换一层，回头看的路线就换了。`
					: `你刚才用头标题旁的箭头，从${fromHeadName}换到了${headName}（现在仍是${layerName}）。请先看中间那些亮着的线：同一层里换一个头，线也换了一副样子。`
			: switchedLayer && switchedHead
				? `You just switched the layer from ${fromLayerName} to ${layerName}, and the head from ${fromHeadName} to ${headName}. First look at the lit lines in the middle: same sentence, a new set, a new pattern.`
				: switchedLayer
					? `You just used the arrows beside the block title to switch from ${fromLayerName} to ${layerName} (still ${headName}). First look at the lit lines in the middle: a new layer looks back along a new route.`
					: `You just used the arrows beside the head title to switch from ${fromHeadName} to ${headName} (still ${layerName}). First look at the lit lines in the middle: another head in the same layer draws a new pattern.`
		: zh
			? `先看「第 ${b + 1} 个 Transformer 块」旁边的箭头，再看注意力标题旁的箭头。眼下是${layerName}、${headName}。先点一次箭头，不要先记名词。`
			: `First look at the arrows beside “Transformer Block ${b + 1}”, then the arrows beside the attention title. You are on ${layerName}, ${headName}. Click an arrow once before trying to memorize the names.`;

	const tableTalk = switched
		? ready
			? zh
				? `跟着变的还有这一头的权重表。写到「${qName}」时，现在大约是：${weightList}。换层或换头，是这张表和中间的亮线一起换，不是右边下一个词的总表在单独改模型。`
				: `This head’s weight table changed with the lines. Looking from “${qName}”, the weights are now about: ${weightList}. Switching a layer or a head changes this table and the lit lines together; it is not the next-word table on the right rewriting the model.`
			: zh
				? '跟着变的还有这一头的权重表。眼下权重还没落到屏幕上（可能还在准备），我不会编一套假的百分比。权重出现以后，这一行会告诉你哪几条线更亮。'
				: "This head’s weight table changes with the lines. The weights are not on the screen yet (they may still be preparing), so I will not invent fake percentages. When they appear, this row will show which lines are brighter."
		: ready
			? zh
				? `换一次之后，请对照中间的亮线，以及这一头的权重表。眼下写到「${qName}」时，大约是：${weightList}。换完再看，线和表都会换一副样子。`
				: `After one switch, compare the lit lines in the middle with this head’s weight table. Looking from “${qName}” right now, they are about: ${weightList}. After you switch, both the lines and this table take on a new pattern.`
			: zh
				? '换一次之后，请对照中间的亮线，以及这一头的权重表。眼下权重还没落到屏幕上，我不会编假的百分比。先看线有没有换。'
				: "After one switch, compare the lit lines in the middle with this head’s weight table. The weights are not on the screen yet, so I will not invent percentages. First watch whether the lines change.";

	const steps: MathStep[] = [
		{ talk: changeTalk, expr: zh ? `${layerName} · ${headName}` : `${layerName} · ${headName}` },
		{
			talk: tableTalk,
			expr: ready
				? weightList || (zh ? '权重表已换' : 'weight table updated')
				: zh
					? '权重还在准备，先看亮线有没有换'
					: 'weights still being prepared; watch the lines first'
		},
		{
			talk: zh
				? '同一件事会做很多遍：每一层、每一个头都是在回头看已经有的词。换一组，只是换一副看法，不是把句子删掉，也不是另开一个模型。'
				: 'The same job is done many times: every layer and every head is looking back at the words already there. Switching the set only changes the view. It does not delete the sentence or start a new model.',
			expr: zh ? '换层、换头 = 换一副看法，不是换模型' : 'switching layer or head = another view, not a new model'
		}
	];

	return {
		id: 'layers',
		title: zh
			? '换一层或换一个头，哪条线和哪张表会变'
			: 'Switch a layer or a head — which line and which table change',
		now: switched
			? zh
				? `你刚才换到了${layerName}、${headName}。请看中间的亮线，还有这一头的权重表，是不是跟着换了一副样子。`
				: `You just switched to ${layerName}, ${headName}. Look at the lit lines in the middle, and this head’s weight table, to see whether both followed the switch.`
			: zh
				? '现在做这件事：点「Transformer 块」旁的箭头换一层，再换一个头。看中间哪一条亮线换了，哪一张权重表跟着变。'
				: 'What to do now: use the arrows beside the Transformer block title to switch a layer, then switch a head. Watch which lit line changes, and which weight table follows.',
		steps,
		pointsTo: zh
			? '得到画面上哪一块：块标题旁的箭头、头标题旁的箭头、中间那些亮着的线，以及这一头的权重表。'
			: 'Where it shows up: the arrows beside the block title, the arrows beside the head title, the lit lines in the middle, and this head’s weight table.',
		myth: zh
			? '常见误解：换层或换头不是把句子删掉，也不是另开一个模型。右边下一个词的总表也不会因此单独改模型；先看中间的线和这一头的权重表。'
			: 'A common mix-up: switching a layer or a head does not delete the sentence or start a new model. The next-word table on the right also does not rewrite the model by itself. First look at the lines in the middle and this head’s weight table.',
		source,
		sourceNote: ready
			? zh
				? `数字来自当前${layerName}、${headName}、当前亮着的这一行（真数）。你刚换过之后，这里会改成新的一层或一个头。`
				: `The numbers come from the current row in ${layerName}, ${headName} (real values). After you switch, this walk updates to the new layer or head.`
			: zh
				? '当前没读到这一行的真数，或模型还在准备。下面不编假的百分比，先看箭头、亮线和有没有换层、换头。'
				: 'The real row could not be read, or the model is still being prepared. This walk does not invent percentages; first look at the arrows, the lit lines, and whether the layer or head changed.',
		highlightSel,
		scale: ready ? 'ready' : 'pending'
	};
}

export function buildResidualCard(zh: boolean): MathCardModel {
	return {
		id: 'residual',
		title: zh ? '「加到后面」就是字面的加法' : '“Added at the end” is literal addition',
		now: zh
			? '现在算什么：旁路上的信号，怎样和这一层改过的结果合在一起，以及为什么需要这条旁路。'
			: 'What we are computing: how the bypass signal is combined with what this layer just changed, and why that bypass is needed.',
		steps: [
			{
				talk: zh
					? '先看块图上那条旁路和加号。这条旁路（残差连接）把前面的信号原样送过来，不走这一层的加工。'
					: 'First look at the bypass and the plus sign on the block diagram. The bypass (the residual connection) carries the earlier signal forward as-is, without this layer’s processing.',
				expr: zh ? '旁路：前面的信号原样过来' : 'bypass: the earlier signal, unchanged'
			},
			{
				talk: zh
					? '「加到后面」是字面的加法：后面用的信号 = 这一层改过的结果 + 进来时的原信号。不是替换，是叠上去。'
					: '“Added at the end” is literal addition: the signal used next = this layer’s changed result + the original signal that came in. It is not a replacement; it is stacked on top.',
				expr: zh ? '后面用的 = 改过的结果 + 原信号' : 'used next = changed result + original signal'
			},
			{
				talk: zh
					? '用三个示意数看一遍：假如进来是 2.0，这一层改出 0.3，加完就是 2.3。前面有用的 2.0 还在。这三个数是示意，不是现场残差向量。'
					: 'A three-number sketch: if 2.0 comes in and this layer adds a change of 0.3, the sum is 2.3. The useful 2.0 is still there. These three numbers are a sketch, not live residual vectors.',
				expr: '2.0 + 0.3 = 2.3'
			},
			{
				talk: zh
					? '为什么要残差：走得深时，前面有用的信号容易被冲掉。这条旁路把它加回去，所以有用的信息不被冲刷掉。'
					: 'Why a residual: in a deep stack, useful earlier signal can be washed out. The bypass adds it back, so that information is not lost.',
				expr: zh ? '旁路加回原信号，避免被冲掉' : 'bypass adds the original signal back'
			}
		],
		pointsTo: zh
			? '得到画面上哪一块：块里标着残差的加号或那条旁路线，对照贯穿例句「残差连接把前面的信号加到后面。」'
			: 'Where it shows up: the residual plus sign or bypass line in the block, matched to the shared sentence “残差连接把前面的信号加到后面.”',
		myth: zh
			? '常见误解：残差不是「把旧的扔掉再换新的」，也不是乘法。它就是把两条路上的数加在一起。'
			: 'A common mix-up: residual is not “throw the old away and replace it”, and it is not multiplication. It adds the two paths together.',
		source: 'sketch',
		sourceNote: zh
			? '2.0 和 0.3 是示意，用来把「加法」说清楚。图上不是现场残差向量。真正的向量很长，道理相同。'
			: '2.0 and 0.3 are a sketch, to make the addition clear. The diagram is not a live residual vector. Real vectors are long; the idea is the same.',
		highlightSel:
			'[data-click="residual-start"], [data-click="residual-end"], .guide-text.residual-text, .residual'
	};
}

export function buildDenoiseCard(zh: boolean, step: number): MathCardModel {
	return {
		id: 'denoise',
		title: zh ? '「再去噪一步」在算什么' : 'What “denoise one step” is computing',
		kicker: zh ? '看见刚才这一步怎么算' : 'See how the step I just saw is calculated',
		now: zh
			? '现在算什么：点一次之后，中间这张吵吵的图怎样往更清楚的方向走一小步。'
			: 'What we are computing: after one click, how the noisy picture in the middle takes a small step toward a cleaner one.',
		steps: [
			{
				talk: zh
					? '中间这张图一开始很吵，像还没洗干净。左边的提示词是条件，右边是这一步的对照。'
					: 'The picture in the middle starts out noisy, as if it has not been cleaned yet. The prompt on the left is the condition; the right side is this step’s comparison.',
				expr: zh ? '起点：一张很吵的图' : 'start: a very noisy picture'
			},
			{
				talk: zh
					? `点一次「再去噪一步」，整张图一起往干净的方向走一小步，不是只改一个点。你现在大约走到第 ${step} 步。`
					: `One click of “Denoise one step” moves the whole picture a little toward a cleaner one, not just one pixel. You are now at about step ${step}.`,
				expr: zh ? `当前步 ${step}：整图一起更新` : `step ${step}: the whole picture is updated`
			},
			{
				talk: zh
					? '可以想像：先猜图上哪些还是噪点，再减掉一点点。减多减少由现在走到第几步决定。'
					: 'One way to picture it: first guess which grains are still noise, then subtract a little. How much is subtracted depends on which step you are on.',
				expr: zh ? '更清楚的图 ≈ 当前图 − 一小步噪声' : 'clearer picture ≈ current picture − a little noise'
			}
		],
		pointsTo: zh
			? '得到画面上哪一块：中间的画布比前一步更清楚一点；画布下「这一步变了什么」在用一句话说这件事。'
			: 'Where it shows up: the middle canvas is a little clearer than the last step, and the one-line “what changed” under the canvas says this in words.',
		myth: zh
			? '常见误解：一步不是只改一个像素，也还不是最后那张成品。它只是往干净图走近了一小步。'
			: 'A common mix-up: one step does not change a single pixel, and it is not yet the finished picture. It is only a small step toward a clean image.',
		source: 'sketch',
		sourceNote: zh
			? '本课画布是按提示词和步数回放的示例轨迹，用来把过程看懂，不是浏览器里现场跑的大模型。推演按你已经走过的步数来讲，标示意。'
			: 'The canvas replays a designed trajectory from the prompt and step count, so you can see the process. It is not a large live model in the browser. This walkthrough follows the steps you have already taken, and is marked as a sketch.',
		highlightSel: '[data-te-image="canvas"], .image-studio canvas, .step-hint, [data-te-zone="mid"]'
	};
}

export function buildCfgCard(zh: boolean): MathCardModel {
	return {
		id: 'cfg',
		title: zh ? '两张对照图是怎么合成的' : 'How the two comparison pictures are combined',
		now: zh
			? '现在算什么：已经见过「再去噪一步」之后，听话程度怎样把「有提示」和「没提示」两路合成一张图。'
			: 'What we are computing: after you have seen “denoise one step”, how guidance combines the “with a prompt” and “without a prompt” paths into one picture.',
		steps: [
			{
				talk: zh
					? '模型其实会想两遍：一遍「听左边的提示词」，一遍「权当没看见提示词」。先看右边的对照图，不要先背名字。'
					: 'The model actually thinks twice: once “following the prompt on the left”, and once “as if it had not seen the prompt”. Look at the comparison pictures on the right before memorizing a name.',
				expr: zh ? '一路有条件，一路无条件' : 'one path with a condition, one without'
			},
			{
				talk: zh
					? '听话程度把这两路的差别放大后再合成。越高越贴提示词；太高也可能把图拉得过火。'
					: 'Guidance widens the gap between the two paths and then combines them. Higher follows the prompt more closely; too high can overdo the picture.',
				expr: zh
					? '合成 ≈ 无条件 + 听话程度 ×（有条件 − 无条件）'
					: 'combined ≈ unconditional + guidance × (conditional − unconditional)'
			},
			{
				talk: zh
					? '先对照右边 1 / 7 / 15 三张小图：1 更淡更泛，7 通常更贴题，15 可能过饱和。看过对照，再记住这个名字叫 CFG。'
					: 'First compare the 1 / 7 / 15 thumbnails on the right: 1 is flatter and vaguer, 7 usually follows the prompt, 15 can oversaturate. After that contrast, the name of this knob is CFG.',
				expr: zh ? '先看三张对照，再起名 CFG' : 'see the three thumbnails, then the name CFG'
			}
		],
		pointsTo: zh
			? '得到画面上哪一块：右侧「同一提示词、同一种子，不同听话程度」的三张对照图，以及任务区里的听话程度旋钮。'
			: 'Where it shows up: the three “same prompt and seed, different guidance” thumbnails on the right, and the guidance knob in the task cluster.',
		myth: zh
			? '常见误解：听话程度不是文字课里的温度。温度改的是抽词时分布的尖或平；这里改的是有多听提示词。'
			: 'A common mix-up: guidance is not the temperature from the text course. Temperature changes how sharp or flat a sampling distribution is; this knob changes how closely the picture follows the prompt.',
		source: 'sketch',
		sourceNote: zh
			? '合成式子是示意，用来解释「两路拉开再合」。请先用三张对照图核对现象。本课画布是预先设计的示例轨迹，不是浏览器里现场跑的大模型。'
			: 'The combination formula is a sketch, to explain “pull the two paths apart, then combine”. Check the phenomenon on the three thumbnails first. The canvas is a pre-designed example trajectory, not a live large model running in the browser.',
		highlightSel: '.cfg-compare, [data-te-image="cfg"], [data-te-image="knobs"], [data-te-zone="right"]'
	};
}

export type MusicProbRow = { name?: string; prob?: number; score?: number; logit?: number };

export function buildMusicProbCard(
	rows: MusicProbRow[],
	opts: { zh: boolean; knobsOn: boolean; lastNote?: string }
): MathCardModel | null {
	const { zh, knobsOn } = opts;
	const lastName = String(opts.lastNote || '').trim();
	const visible = (rows || []).slice(0, 4);
	if (visible.length < 2) return null;
	const names = visible.map((r) => String(r.name ?? ''));
	const probs = visible.map((r) => Number(r.prob) || 0);
	const rawScores = visible.map((r) => Number(r.score ?? r.logit));
	const haveScores = rawScores.every((s) => Number.isFinite(s));
	const scores = haveScores ? rawScores : probs.map((p) => (p > 0 ? Math.log(p) : -8));
	const source: 'real' | 'sketch' = haveScores ? 'real' : 'sketch';
	const exps = scores.map((s) => Math.exp(s));
	const p0 = probs[0] || 0;
	const sum = p0 > 0 && Number.isFinite(exps[0]) ? exps[0] / p0 : exps.reduce((a, b) => a + b, 0);
	const scoreList = names.map((n, i) => `${n} ${fmt(scores[i])}`).join('，');
	const pctList = names
		.map(
			(n, i) =>
				`${n}：${fmt(exps[i], 2)} ÷ ${fmt(sum, 2)} ≈ ${fmtPct(exps[i] / sum)}（${zh ? '表上' : 'on the table'} ${fmtPct(probs[i])}）`
		)
		.join('\n');
	const musicTitle = lastName
		? zh
			? `刚才出现的「${lastName}」是怎么来的`
			: `Where the note that just appeared, “${lastName}”, came from`
		: zh
			? '下一个音符的百分比，和文字课是同一套算法'
			: 'Next-note percentages use the same method as the text course';
	const musicNow = lastName
		? zh
			? `现在算什么：你刚才看见「${lastName}」被接到谱上。右边排行上的分数（${scoreList}）已经在猜再下一个音；这套算法就是刚才选出「${lastName}」时用的那一套。`
			: `What we are computing: you just saw “${lastName}” appended to the score. The ranking on the right (scores: ${scoreList}) is already guessing the next note; this is the same method that chose “${lastName}”.`
		: zh
			? '现在算什么：右边「下一个音符」排行上的百分比，怎样从分数算出来。这和文字课猜下一个词是同一件事。'
			: 'What we are computing: how the percentages in the next-note ranking are made from scores. This is the same job as guessing the next word in the text course.';
	return {
		id: 'musicProb',
		title: musicTitle,
		kicker: lastName
			? zh
				? '看见刚才这个音怎么算'
				: 'See how the note I just saw was chosen'
			: undefined,
		now: musicNow,
		steps: [
			{
				talk: zh
					? `右边每个候选音先有一个分数，还不是百分比。最上面几个：${scoreList}。`
					: `Each candidate note on the right first has a score, not a percentage. The top ones are: ${scoreList}.`,
				expr: scoreList
			},
			{
				talk: zh
					? '把分数变成正数、再加总、再除以总和，就得到加起来为 100% 的百分比。这和文字课把分数变成下一个词的百分比是同一步，名字也叫 softmax。'
					: 'Turn the scores into positive numbers, add them up, and divide by the total to get percentages that add to 100%. This is the same step as turning scores into next-word percentages in the text course, and it is also called softmax.',
				expr: pctList
			},
			{
				talk: zh
					? knobsOn
						? '你已经见过意外程度（温度）和 Top-k / Top-p：它们只改怎么从这张排行里抽下一个音，不改模型本身。'
						: '第一名不一定被抽中。百分比只是机会大小，和文字课相同。'
					: knobsOn
						? 'You have already seen surprise (temperature) and Top-k / Top-p: they only change how the next note is drawn from this ranking, not the model itself.'
						: 'The top-ranked note is not always sampled. A percentage is only a chance, just as in the text course.',
				expr: knobsOn
					? zh
						? '抽音旋钮只改抽样，不改分数从哪来'
						: 'sampling knobs only change the draw, not where the scores come from'
					: zh
						? '第一名 ≠ 必中'
						: 'first place ≠ always drawn'
			}
		],
		pointsTo: zh
			? lastName
				? `得到画面上哪一块：卷帘最右边刚才接上的「${lastName}」，以及右边「下一个音符的概率」排行上此刻的分数。`
				: '得到画面上哪一块：右边「下一个音符的概率」排行，以及卷帘最右边新接上的那一格。'
			: lastName
				? `Where it shows up: the “${lastName}” cell just appended at the far right of the piano roll, and the live scores in the next-note ranking on the right.`
				: 'Where it shows up: the next-note probability ranking on the right, and the new cell at the far right of the piano roll.',
		myth: zh
			? '常见误解：这不是在「写情感」，也不是另一套音乐专用公式。它就是在猜下一个音。'
			: 'A common mix-up: this is not “writing emotion”, and it is not a different music-only formula. It is simply guessing the next note.',
		source,
		sourceNote: zh
			? source === 'real'
				? '数字来自当前右侧音高排行的分数和百分比（真数）。'
				: '当前排行只直接给出了百分比，分数是从表上的百分比倒推的，标示意。加法步骤仍和文字课相同。'
			: source === 'real'
				? 'The numbers come from the scores and percentages on the current pitch ranking (real values).'
				: 'The ranking currently exposes percentages directly; the scores are inferred from those percentages and are marked as a sketch. The addition steps are still the same as in the text course.',
		highlightSel: '.music-probs, [data-te-zone="right"], .note-list'
	};
}

export function buildTempCard(
	rows: Array<ProbRow | MusicProbRow>,
	opts: { zh: boolean; temperature: number; domain?: 'text' | 'music'; stale?: boolean }
): MathCardModel | null {
	const { zh, temperature: T, domain = 'text' } = opts;
	if (opts.stale && domain === 'text') return null;
	const visible = (rows || [])
		.map((r) => {
			const token = String((r as ProbRow).token ?? (r as MusicProbRow).name ?? '');
			const probability = Number((r as ProbRow).probability ?? (r as MusicProbRow).prob);
			return { token, probability };
		})
		.filter((r) => r.token && Number.isFinite(r.probability) && r.probability > 0)
		.slice(0, 4);
	if (visible.length < 2) return null;
	const names = visible.map((r) => (domain === 'music' ? r.token : tokLabel(r.token)));
	const pctFromTable = names.map((n, i) => `${n} ${fmtPct(visible[i].probability)}`).join('，');
	const first = names[0];
	const firstPct = fmtPct(visible[0].probability);
	const tLabel = fmt(T, 1);
	const isMusic = domain === 'music';
	const steps: MathStep[] = isMusic
		? [
				{
					talk: zh
						? `先看右边这张已经算好的表。眼下最上面几行是：${pctFromTable}。先只看条形是比较尖，还是比较平。`
						: `First look at the table on the right, which is already computed. The top rows right now are: ${pctFromTable}. Just notice whether the bars look sharp or flat.`,
					expr: pctFromTable
				},
				{
					talk: zh
						? '在任务区拧抽音旋钮时，这张排行会变尖或变平，但分数仍然来自刚才那次计算。旋钮只改「怎么从这张已经算好的表里抽下一个音」，不改分数从哪来。'
						: 'When you turn the sampling knobs in the task cluster, this ranking sharpens or flattens, but the scores still come from the computation that just ran. The knobs only change how the next note is drawn from this already-computed table, not where the scores come from.',
					expr: zh ? '先改抽法，不改分数从哪来' : 'change the draw, not where the scores come from'
				},
				{
					talk: zh
						? `这个让表变尖或变平的旋钮，名字叫意外程度，也就是温度。现在它在 ${tLabel}。温度更低时，更常抽到第一名「${first}」（现在是 ${firstPct}），但第一名仍然不是保证。`
						: `The knob that sharpens or flattens the table is called surprise, also known as temperature. It is ${tLabel} right now. A lower temperature more often draws the first place “${first}” (now ${firstPct}), but first place is still not a guarantee.`,
					expr: zh
						? `温度 ${tLabel}：更低 → 更常抽第一名，但不是保证`
						: `temperature ${tLabel}: lower → first place more often, not a guarantee`
				}
			]
		: [
				{
					talk: zh
						? `抽词旋钮已经出现在画面上了。先看右边这条概率条，眼下最上面几行是：${pctFromTable}。先只看它是比较尖，还是比较平。`
						: `The sampling knobs are on the screen now. First look at the probability bar on the right. The top rows right now are: ${pctFromTable}. Just notice whether the bars look sharp or flat.`,
					expr: pctFromTable
				},
				{
					talk: zh
						? '拖一下温度旋钮，只看这条概率条是变尖还是变平。分数仍然来自刚才那次计算。旋钮只改「怎么从已经算好的表里抽一个词」，不改分数从哪来。'
						: 'Drag the temperature knob a little, and watch only whether this probability bar gets sharper or flatter. The scores still come from the computation that just ran. The knob only changes how a word is drawn from this already-computed table, not where the scores come from.',
					expr: zh ? '先拧旋钮看条形变化，不改分数从哪来' : 'twist the knob and watch the bar; do not change where the scores come from'
				},
				{
					talk: zh
						? `再看 Top-k，它会缩短能抽的那一截名单。你已经看见条形怎么变了，再记住名字：让条变尖或变平的叫温度，现在它在 ${tLabel}。温度更低时，更常抽到第一名「${first}」（现在是 ${firstPct}），但第一名仍然不是保证。`
						: `Then look at Top-k — it shortens the list you can draw from. After you have seen the bar change, keep the names: the knob that sharpens or flattens is called temperature, and it is ${tLabel} right now. A lower temperature more often draws the first place “${first}” (now ${firstPct}), but first place is still not a guarantee.`,
					expr: zh
						? `温度 ${tLabel}，再看 Top-k：更低 → 更常抽第一名，但不是保证`
						: `temperature ${tLabel}, then Top-k: lower → first place more often, not a guarantee`
				}
			];
	return {
		id: 'temp',
		title: zh
			? isMusic
				? '排行怎么变尖、变平'
				: '拧一下，这条概率条怎样变'
			: isMusic
				? 'How the ranking sharpens or flattens'
				: 'Twist the knob and watch this probability bar change',
		now: zh
			? isMusic
				? '现在看什么：先看右边音高排行变尖还是变平，再给这个旋钮起名字。'
				: '现在看什么：拖一下已经出现的温度旋钮，只看右边概率条是变尖还是变平。再看 Top-k。先看见变化，再给旋钮起名字。'
			: isMusic
				? 'What to see: first watch the pitch ranking sharpen or flatten, then name the knob.'
				: 'What to see: drag the temperature knob that is already on screen, watch whether the probability bar on the right gets sharper or flatter, then look at Top-k. See the change first, then name the knob.',
		steps,
		pointsTo: zh
			? isMusic
				? '得到画面上哪一块：任务区里的抽音旋钮，以及右边的音高排行。'
				: '得到画面上哪一块：已经出现的温度旋钮和 Top-k，以及右边这条概率条。'
			: isMusic
				? 'Where it shows up: the sampling knobs in the task cluster, and the pitch ranking on the right.'
				: 'Where it shows up: the temperature and Top-k knobs that are already on screen, and the probability bar on the right.',
		myth: zh
			? '常见误解：拧这个旋钮不是在改模型，也不是第一名就一定会中。它只改怎么从表里抽。'
			: 'A common mix-up: turning this knob does not change the model, and first place is not a guarantee. It only changes how a row is drawn from the table.',
		source: 'real',
		sourceNote: zh
			? isMusic
				? `百分比来自当前右侧表（真数）。现在旋钮在 ${tLabel}。先看表，再记住温度这个名字。`
				: `百分比来自当前右侧概率条（真数）。现在温度在 ${tLabel}。先拧一下看条形变化，再记住温度和 Top-k 这两个名字。`
			: isMusic
				? `The percentages come from the current right-hand table (real values). The knob is at ${tLabel}. See the table first, then keep the name temperature.`
				: `The percentages come from the current probability bar on the right (real values). Temperature is ${tLabel}. Twist it and watch the bar first, then keep the names temperature and Top-k.`,
		highlightSel: isMusic
			? '[data-te-music="knobs-panel"], [data-te-music="knobs"], .music-probs, [data-te-zone="right"]'
			: '[data-te-sampling="temp"], [data-te-sampling="topk"], [data-te-sampling="panel"], [data-te-zone="right"]'
	};
}

export { TEXT_PATH_IDS };

export function buildLmHeadCard(
	rows: ProbRow[],
	opts: { zh: boolean; stale?: boolean }
): MathCardModel | null {
	const { zh, stale } = opts;
	if (stale) return null;
	const visible = (rows || [])
		.map((r) => {
			const token = String(r.token ?? '');
			const probability = Number(r.probability);
			const scoreRaw = r.logit ?? r.scaledLogit;
			const score = typeof scoreRaw === 'number' ? scoreRaw : Number(scoreRaw);
			return { token, probability, score };
		})
		.filter((r) => r.token && Number.isFinite(r.probability) && r.probability > 0)
		.slice(0, 4);
	if (visible.length < 2) return null;
	const names = visible.map((r) => tokLabel(r.token));
	const pctFromTable = names.map((n, i) => `${n} ${fmtPct(visible[i].probability)}`).join('，');
	const scoreReady =
		visible.every((r) => Number.isFinite(r.score)) &&
		!scoresNeedPendingWalk(visible.map((r) => r.score));
	const scoreLine = scoreReady
		? names.map((n, i) => `${n} ${fmt(visible[i].score, 2)}`).join('，')
		: '';
	const steps: MathStep[] = [
		{
			talk: zh
				? `先看右边这张你已经见过的表。眼下最上面几行是：${pctFromTable}。这些百分比不是凭空出现的。`
				: `First look at the right-hand table you have already seen. The top rows right now are: ${pctFromTable}. Those percentages do not appear out of thin air.`,
			expr: pctFromTable
		},
		{
			talk: zh
				? scoreReady
					? `最后一个词的位置会留下一条隐藏向量。它和「每个词一条输出权重」做点积，词表里每一行都会得到一个分数。整张词表矩阵行数太多，不会画在这里。现在表上能看见的分数是：${scoreLine}。这些分数来自当前这次计算（真数），不是编出来的整张矩阵。`
					: '最后一个词的位置会留下一条隐藏向量。它和「每个词一条输出权重」做点积，词表里每一行都会得到一个分数。眼下模型还在准备，这些分数还读不到。我不会编一套假的整张词表矩阵，先只看表上已经出现的百分比。'
				: scoreReady
					? `The last token position leaves a hidden vector. A dot product with one output-weight row per vocabulary entry gives each row a score. The full vocabulary matrix is too large to draw here. The scores visible on the table right now are: ${scoreLine}. Those scores come from the current computation (real values), not from an invented full matrix.`
					: 'The last token position leaves a hidden vector. A dot product with one output-weight row per vocabulary entry gives each row a score. The model is still preparing, so those scores are not readable yet. I will not invent a fake full vocabulary matrix; for now just read the percentages already on the table.',
			expr: scoreReady
				? zh
					? `隐藏向量 · 每行输出权重 → 分数：${scoreLine}`
					: `hidden vector · output-weight row → scores: ${scoreLine}`
				: zh
					? '隐藏向量 · 每行输出权重 → 分数（现在还读不到，不编整张矩阵）'
					: 'hidden vector · output-weight row → scores (not readable yet; no invented matrix)'
		},
		{
			talk: zh
				? `这些分数再变成加起来为 100% 的百分比，就是你看见的这张表：${pctFromTable}。`
				: `Those scores then become percentages that add to 100%, which is the table you see: ${pctFromTable}.`,
			expr: zh ? `分数 → 百分比：${pctFromTable}` : `scores → percentages: ${pctFromTable}`
		},
		{
			talk: zh
				? '这最后一层，把最后那条隐藏向量变成每个词的分数，名字叫输出头（也叫解嵌入；英文里常写成 unembedding 或 lm_head）。'
				: 'This last layer, which turns that last hidden vector into a score for every vocabulary row, is called the output head (also unembedding, or lm_head).',
			expr: zh ? '输出头 = 解嵌入（unembedding / lm_head）' : 'output head = unembedding / lm_head'
		}
	];
	return {
		id: 'lmhead',
		title: zh ? '这些百分比从哪条向量来' : 'Which vector those percentages come from',
		now: zh
			? '现在看什么：先看右边表上的百分比从哪条向量变成分数，再给这一层起名字。'
			: 'What to see: first watch how a vector becomes the scores behind the right-hand percentages, then name this layer.',
		steps,
		pointsTo: zh
			? '得到画面上哪一块：右边下一个词的概率表，以及底部讲解槽里的这条推演。'
			: 'Where it shows up: the next-word table on the right, and this walk near the bottom dock.',
		myth: zh
			? '常见误解：不是先讲一整张嵌入矩阵，也不是第一名就一定会中。先看见「最后一条向量变成每个词的分数」，再记住输出头这个名字。'
			: 'A common mix-up: this is not an embedding-matrix lecture, and first place is not a guarantee. First see that the last hidden vector becomes a score for every word, then keep the name output head.',
		source: scoreReady ? 'real' : 'sketch',
		sourceNote: zh
			? scoreReady
				? '分数和百分比来自当前右侧表（真数）。整张词表矩阵太大，不会画出来，也没有编一套假矩阵。'
				: '模型还在准备，分数还读不到。这里不编整张词表矩阵；请先只看表上已经出现的百分比。'
			: scoreReady
				? 'The scores and percentages come from the current right-hand table (real values). The full vocabulary matrix is too large to draw, and no fake matrix is invented.'
				: 'The model is still preparing, so the scores are not readable yet. No full vocabulary matrix is invented; read the percentages already on the table.',
		highlightSel: '[data-te-zone="right"], [data-te-math="dock"]',
		scale: scoreReady ? 'ready' : 'pending'
	};
}

export type CutoffSampling = { type?: 'top-k' | 'top-p' | string; value?: number };

export function buildCutoffCard(
	rows: Array<ProbRow | MusicProbRow>,
	opts: {
		zh: boolean;
		domain?: 'text' | 'music';
		samplingType?: 'top-k' | 'top-p' | string;
		samplingValue?: number;
		keptCount?: number;
		stale?: boolean;
	}
): MathCardModel | null {
	const { zh, domain = 'text' } = opts;
	if (opts.stale && domain === 'text') return null;
	const isMusic = domain === 'music';
	const kind: 'top-k' | 'top-p' = opts.samplingType === 'top-p' ? 'top-p' : 'top-k';
	const rawVal = Number(opts.samplingValue);
	const hasVal = Number.isFinite(rawVal) && rawVal > 0;
	const mapped = (rows || []).map((r, index) => {
		const token = String((r as ProbRow).token ?? (r as MusicProbRow).name ?? '');
		const probability = Number((r as ProbRow).probability ?? (r as MusicProbRow).prob);
		const topKLogit = (r as ProbRow).topKLogit;
		const cutoffIndex = Number((r as ProbRow).cutoffIndex);
		const rank = Number((r as ProbRow).rank);
		const cutByK =
			typeof topKLogit === 'number' && !Number.isFinite(topKLogit);
		const cutByP = Number.isFinite(cutoffIndex) && Number.isFinite(rank) && rank > cutoffIndex;
		const kept = token && Number.isFinite(probability) && probability > 0 && !cutByK && !cutByP;
		return { token, probability, kept: Boolean(kept), index };
	});
	const labeled = mapped.filter((r) => r.token);
	if (labeled.filter((r) => Number.isFinite(r.probability)).length < 2) return null;
	const keptRows = labeled.filter((r) => r.kept);
	const cutRows = labeled.filter((r) => !r.kept && Number.isFinite(r.probability));
	const keptCount = Number.isFinite(Number(opts.keptCount)) && Number(opts.keptCount) > 0
		? Math.round(Number(opts.keptCount))
		: keptRows.length;
	if (keptCount < 1) return null;
	const lab = (t: string) => (isMusic ? t : tokLabel(t));
	const keptNames = (keptRows.length ? keptRows : labeled.slice(0, keptCount))
		.slice(0, 6)
		.map((r) => lab(r.token));
	const keptLine = keptNames.join('，');
	const cutHint = cutRows.length
		? zh
			? `表上还能看见、但现在抽不到的例如：${cutRows
					.slice(0, 3)
					.map((r) => lab(r.token))
					.join('，')}。`
			: `Rows still visible but not drawable now include: ${cutRows
					.slice(0, 3)
					.map((r) => lab(r.token))
					.join(', ')}.`
		: '';
	const knobLabel = !hasVal
		? kind === 'top-p'
			? 'p'
			: 'k'
		: kind === 'top-p'
			? `p=${fmt(rawVal, rawVal < 1 ? 2 : 1)}`
			: `k=${Math.round(rawVal)}`;
	const unit = isMusic
		? zh
			? '音'
			: 'notes'
		: zh
			? '词'
			: 'words';
	const tableName = isMusic
		? zh
			? '右边的音高排行'
			: 'the pitch ranking on the right'
		: zh
			? '右边这张表'
			: 'the table on the right';
	const steps: MathStep[] = [
		{
			talk: zh
				? `先看${tableName}里，哪些行还留在抽取集合里。眼下还留着 ${keptCount} 个${unit}：${keptLine}。${cutHint}先只看集合变短还是变长，先不记公式。`
				: `First look at ${tableName} and which rows are still in the candidate set. Right now ${keptCount} ${unit} remain: ${keptLine}. ${cutHint} Just notice whether the set shrinks or grows; do not memorize a formula yet.`,
			expr: zh
				? `还留着 ${keptCount} 个：${keptLine}`
				: `${keptCount} still in the set: ${keptLine}`
		},
		{
			talk: zh
				? kind === 'top-p'
					? `你现在拧的是 ${knobLabel}。从最靠前的行往下加百分比，加到刚超过这个 p 就停下，后面的行不再参与抽取。把 p 拧小，还能${isMusic ? '抽的音' : '抽的词'}会变少；拧大，集合会变大。`
					: `你现在拧的是 ${knobLabel}。只留分数最高的 ${hasVal ? Math.round(rawVal) : 'k'} 行，后面的行不再参与抽取。把 k 拧小，还能${isMusic ? '抽的音' : '抽的词'}会变少；拧大，集合会变大。`
				: kind === 'top-p'
					? `The knob is at ${knobLabel} right now. Percentages are added from the top row down until they just pass this p; later rows are dropped from the draw. A smaller p shrinks the set; a larger p grows it.`
					: `The knob is at ${knobLabel} right now. Only the highest-scoring ${hasVal ? Math.round(rawVal) : 'k'} rows stay in the draw; later rows are dropped. A smaller k shrinks the set; a larger k grows it.`,
			expr: zh
				? `${knobLabel}：拧小 → 集合变少，拧大 → 集合变多`
				: `${knobLabel}: smaller → fewer candidates, larger → more`
		},
		{
			talk: zh
				? isMusic
					? `这种「先截断再抽」的做法：留下最高的 k 个音，叫 Top-k；按百分比往下加到 p，叫 Top-p。它们只改怎么从已经算好的排行里抽下一个音，不改分数从哪来，也不改这段示例规则本身。`
					: `这种「先截断再抽」的做法：留下最高的 k 行，叫 Top-k；按百分比往下加到 p，叫 Top-p。它们只改怎么从这张已经算好的表里抽一个词，不改分数从哪来，也不改模型本身。`
				: isMusic
					? 'This “cut first, then draw” idea has two names: keeping the highest k notes is Top-k; adding percentages down to p is Top-p. They only change how the next note is drawn from this already-computed ranking, not where the scores come from, and not the example itself.'
					: 'This “cut first, then draw” idea has two names: keeping the highest k rows is Top-k; adding percentages down to p is Top-p. They only change how a word is drawn from this already-computed table, not where the scores come from, and not the model itself.',
			expr: zh
				? isMusic
					? 'Top-k / Top-p 只改怎么抽音，不改分数从哪来'
					: 'Top-k / Top-p 只改怎么抽词，不改分数从哪来'
				: isMusic
					? 'Top-k / Top-p only change how the note is drawn, not where the scores come from'
					: 'Top-k / Top-p only change how the word is drawn, not where the scores come from'
		}
	];
	return {
		id: 'cutoff',
		title: zh
			? isMusic
				? '候选音怎么变少、变多'
				: '候选怎么变少、变多'
			: isMusic
				? 'How the next-note set shrinks or grows'
				: 'How the candidate set shrinks or grows',
		now: zh
			? isMusic
				? '现在看什么：先看右边音高排行里还能抽的音变少还是变多，再给这种截断起名字。'
				: '现在看什么：先看右边表里还能抽的行变少还是变多，再给这种截断起名字。'
			: isMusic
				? 'What to see: first watch the drawable notes on the pitch ranking shrink or grow, then name this cutoff.'
				: 'What to see: first watch the drawable rows on the right-hand table shrink or grow, then name this cutoff.',
		steps,
		pointsTo: zh
			? isMusic
				? '得到画面上哪一块：任务区里的抽音旋钮，以及右边的音高排行。'
				: '得到画面上哪一块：任务区里的抽词旋钮，以及右边下一个词的概率表。'
			: isMusic
				? 'Where it shows up: the sampling knobs in the task cluster, and the pitch ranking on the right.'
				: 'Where it shows up: the sampling knobs in the task cluster, and the next-word table on the right.',
		myth: zh
			? isMusic
				? '常见误解：截断不是在改这段示例规则，也不是把第一名变成必中。它只改还能抽哪些音。'
				: '常见误解：截断不是在改模型，也不是把第一名变成必中。它只改还能抽哪些行。'
			: isMusic
				? 'A common mix-up: the cutoff does not change the example itself, and first place is not a guarantee. It only changes which notes can still be drawn.'
				: 'A common mix-up: the cutoff does not change the model, and first place is not a guarantee. It only changes which rows can still be drawn.',
		source: 'real',
		sourceNote: zh
			? `集合大小来自当前右侧表（真数）。现在旋钮在 ${knobLabel}。先看集合变少或变多，再记住 Top-k / Top-p 这两个名字。`
			: `The set size comes from the current right-hand table (real values). The knob is at ${knobLabel}. See the set shrink or grow first, then keep the names Top-k / Top-p.`,
		highlightSel: isMusic
			? '[data-te-music="knobs-panel"], [data-te-music="knobs"], .music-probs, [data-te-zone="right"]'
			: '[data-te-sampling="panel"], [data-te-sampling="show"], [data-te-zone="right"], .sampling-input'
	};
}

export function buildMaskCard(
	toks: string[],
	matrix: number[][] | undefined,
	opts: { zh: boolean; queryIndex: number; block: number; head: number; stale?: boolean }
): MathCardModel | null {
	const { zh, block: b, head: h } = opts;
	if (opts.stale) return null;
	if (!toks?.length) return null;
	let q = opts.queryIndex;
	if (q < 0 || q >= toks.length) q = toks.length - 1;
	const row: number[] = Array.isArray(matrix?.[q]) ? matrix[q].map((x) => Number(x)) : [];
	const past = toks
		.map((t, i) => ({ t: tokLabel(t), w: Number.isFinite(row[i]) ? row[i] : 0, i }))
		.filter((p) => p.i <= q);
	const future = toks
		.map((t, i) => ({ t: tokLabel(t), w: Number.isFinite(row[i]) ? row[i] : NaN, i }))
		.filter((p) => p.i > q);
	const sumReal = past.reduce((a, p) => a + (p.w > 0 ? p.w : 0), 0);
	const ready = Boolean(matrix) && sumReal > 0.5;
	const futureBlocked =
		future.length === 0 ||
		future.every((p) => !Number.isFinite(p.w) || p.w <= 1e-6);
	const qName = tokLabel(toks[q]);
	const futureNames = future.slice(0, 4).map((p) => p.t).join('，');
	const pastTop = [...past].sort((a, c) => c.w - a.w).slice(0, 3);
	const pastLine = pastTop.map((p) => `${p.t} ${fmtPct(p.w)}`).join('，');
	const steps: MathStep[] = [
		{
			talk: zh
				? `先看中间这张注意力表（或那些连线）。写到「${qName}」时，已经出现的词在左边和当前位置；还没写出来的词在它的右边。`
				: `First look at the attention table in the middle (or the links). When writing “${qName}”, the words already there sit at and before this position; words not yet written sit to its right.`,
			expr: zh ? `当前词：${qName}` : `Current word: ${qName}`
		},
		{
			talk: zh
				? future.length
					? ready && futureBlocked
						? `再看右上：像「${futureNames}」这样还没出现的位置是暗的、连不过去，权重接近 0。已经出现的词里，眼下更亮的是：${pastLine}。数字来自当前这一行（真数）。`
						: ready
							? `再看右上还没出现的位置。已经出现的词里，眼下更亮的是：${pastLine}。请对照屏幕上是否右上仍然是暗的；我不另编一套假矩阵。`
							: '再看右上那一块：还没写出来的位置应当是暗的、连不过去。眼下这行权重还没落到屏幕上（可能还在准备），我不会编一套假的矩阵或百分比。先看你已经能看见的暗角。'
					: '这句已经写到末尾，右边暂时没有更靠后的词。换到更早的一个位置，仍能看见右上未来被挡住。'
				: future.length
					? ready && futureBlocked
						? `Then look at the upper-right: positions not yet written, such as “${futureNames}”, stay dark and cannot connect; their weights are near 0. Among words already there, the brighter ones right now are: ${pastLine}. Those numbers come from the current row (real values).`
						: ready
							? `Then look at the future positions on the upper-right. Among words already there, the brighter ones right now are: ${pastLine}. Check whether the upper-right stays dark on the screen; this walk will not invent a second matrix.`
							: 'Then look at the upper-right: positions not yet written should stay dark and cannot connect. This row of weights is not on the screen yet (it may still be preparing), so I will not invent a fake matrix or percentages. First look at the dark corner you can already see.'
					: 'This sentence is already at the last position, so there is no later word to the right. Move to an earlier position and you can still see the future blocked in the upper-right.',
			expr: ready && futureBlocked && future.length
				? zh
					? `右上已挡住；已出现的更亮：${pastLine}`
					: `upper-right blocked; brighter past: ${pastLine}`
				: zh
					? '先看右上是不是暗的'
					: 'first see whether the upper-right is dark'
		},
		{
			talk: zh
				? '这个挡住未来的规则，名字叫因果掩码，也就是「不能偷看未来」。它不是把词从句子里删掉，只是打分时不让用还没写出来的信息。'
				: 'This rule that blocks the future is called a causal mask, or “no peeking at the future.” It does not delete words from the sentence; it only refuses future information when scores are computed.',
			expr: zh ? '因果掩码 = 不能偷看未来' : 'causal mask = no peeking at the future'
		}
	];
	return {
		id: 'mask',
		title: zh ? '右上为什么是暗的' : 'Why the upper-right is dark',
		now: zh
			? '现在看什么：先看注意力表里未来那一块是不是暗的，再给这个规则起名字。'
			: 'What to see: first watch whether the future region of the attention table is dark, then name the rule.',
		steps,
		pointsTo: zh
			? '得到画面上哪一块：中间注意力矩阵（或连线）的右上区域，以及当前正在写的那个词。'
			: 'Where it shows up: the upper-right of the attention matrix (or links) in the middle, and the word currently being written.',
		myth: zh
			? '常见误解：挡住未来不是把那些词从句子里删掉，也不是第一名就一定会中。只是不能偷看还没写出来的右边。'
			: 'A common mix-up: blocking the future does not delete those words from the sentence, and first place is not a guarantee. It only forbids peeking at the right-hand side that is not written yet.',
		source: ready ? 'real' : 'sketch',
		sourceNote: zh
			? ready
				? `已出现词的数字来自当前第 ${b + 1} 层、第 ${h + 1} 个头的这一行（真数）。右上被挡住是你在表上能看见的现象。`
				: '当前没读到这一行的真数，或模型还在准备。下面不编假的矩阵；先看屏幕上右上那一块是不是暗的。'
			: ready
				? `Numbers for words already there come from the current row in layer ${b + 1}, head ${h + 1} (real values). The blocked upper-right is a phenomenon you can see on the table.`
				: 'The real row could not be read, or the model is still being prepared. This walk does not invent a matrix; first look at whether the upper-right on the screen is dark.',
		highlightSel:
			'[data-te-zone="mid"], [data-click="attention-step"], .attention, .sankey',
		scale: ready ? 'ready' : 'pending'
	};
}

export function buildForwardCard(zh: boolean, step: number, totalSteps: number): MathCardModel {
	const s = Number.isFinite(step) ? step : 0;
	const tot = Number.isFinite(totalSteps) && totalSteps > 0 ? totalSteps : Math.max(s, 1);
	return {
		id: 'forward',
		title: zh ? '图是怎么一步步变吵的' : 'How the picture gets noisier, step by step',
		now: zh
			? '现在看什么：已经见过「再去噪一步」把图变清之后，把同一条示例轨迹反过来看，图会怎样一步步变吵。'
			: 'What to see: after you have seen “denoise one step” make the picture clearer, read the same example trajectory the other way and watch it get noisier.',
		steps: [
			{
				talk: zh
					? `中间画布你已经走过第 ${s} 步（一共大约 ${tot} 步）。越靠后通常越清楚。这是同一条预先设计的示例轨迹，不是浏览器里现场跑的大模型。`
					: `The canvas in the middle is already at step ${s} (about ${tot} steps in all). Later steps are usually clearer. This is the same pre-designed example trajectory, not a live large model in the browser.`,
				expr: zh ? `当前第 ${s} 步（更清楚的一侧）` : `now at step ${s} (the clearer side)`
			},
			{
				talk: zh
					? '再看时间轴上更靠前的格子，或画布下「反过来看」那一排小图：往第 0 步走，颗粒会变多，图一步步变吵。这不是另画一套假图，只是把已有的帧倒过来读。'
					: 'Then look at earlier ticks on the timeline, or the “read the other way” thumbnails under the canvas: as you move toward step 0, grain increases and the picture gets noisier. This is not a second fake sequence — it is the same frames read in reverse.',
				expr: zh ? '越往前 → 越吵（同一条轨迹）' : 'earlier → noisier (the same trajectory)'
			},
			{
				talk: zh
					? '看见变吵之后，再给这个方向起个名字：它就是「图怎么一步步变吵」。主路仍然是「再去噪一步」把吵减掉。这里没有新的必做关卡，也不改那个主按钮。'
					: 'After you have seen it get noisier, you can name this direction: how the picture gets noisier step by step. The main path is still “Denoise one step,” which subtracts that noise. This is not a new required station, and it does not change the main button.',
				expr: zh ? '变吵是去噪的反方向' : 'getting noisier is the reverse of denoise'
			}
		],
		pointsTo: zh
			? '得到画面上哪一块：中间画布的时间轴，以及画布下「反过来看」的示意小图。'
			: 'Where it shows up: the timeline under the middle canvas, and the “read the other way” sketch thumbnails.',
		myth: zh
			? '常见误解：变吵不是另开一套真实训练，也不是浏览器里现算的大模型。只是把已经有的示例轨迹倒过来看。'
			: 'A common mix-up: getting noisier is not a second live training run, and not a large model computing in the browser. It only reads the example trajectory you already have, in reverse.',
		source: 'sketch',
		sourceNote: zh
			? '小图和画布都来自预先设计的示例轨迹（按提示词、步数回放），标示意。不是浏览器里跑的大模型。'
			: 'The thumbnails and the canvas both come from a pre-designed example trajectory replayed from the prompt and step count, marked as a sketch. Not a live large model in the browser.',
		highlightSel: '[data-te-image="forward"], [data-te-image="canvas"], .image-timeline, [data-te-image="step"]'
	};
}
