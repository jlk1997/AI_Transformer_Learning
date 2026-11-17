export type FtMethod = 'lora' | 'freeze' | 'full';
export type FtBase = 'gpt2' | 'gpt2-medium';
export type SchedulerName = 'cosine' | 'constant' | 'linear';
export type Amp = 'fp16' | 'fp32';

export const LORA_MODULE_OPTIONS = [
	{ id: 'attn.c_attn', labelZh: '注意力 QKV 投影 (c_attn)', labelEn: 'Attention QKV (c_attn)', defaultOn: true },
	{ id: 'attn.c_proj', labelZh: '注意力输出投影 (c_proj)', labelEn: 'Attention out (c_proj)', defaultOn: true },
	{ id: 'mlp.c_fc', labelZh: 'MLP 升维 (c_fc)', labelEn: 'MLP up (c_fc)', defaultOn: false },
	{ id: 'mlp.c_proj', labelZh: 'MLP 输出 (c_proj)', labelEn: 'MLP out (c_proj)', defaultOn: false }
] as const;

export type Recipe = {
	base: FtBase;
	method: FtMethod;
	loraR: number;
	loraAlpha: number;
	loraDropout: number;
	loraModules: string[];
	freezeUnfreezeLast: number;
	freezeOutputOnly: boolean;
	lr: number;
	warmup: number;
	scheduler: SchedulerName;
	weightDecay: number;
	epochs: number;
	batchSize: number;
	gradAccum: number;
	seqLen: number;
	amp: Amp;
	gradClip: number | null;
	seed: number;
	earlyStop: number | null;
	valRatio: number;
	genTemp: number;
	genTopK: number;
	genTopP: number;
	genMaxLen: number;
	testRatio: number;
};

export const RECOMMENDED: Recipe = {
	base: 'gpt2',
	method: 'lora',
	loraR: 16,
	loraAlpha: 32,
	loraDropout: 0.05,
	loraModules: ['attn.c_attn', 'attn.c_proj'],
	freezeUnfreezeLast: 2,
	freezeOutputOnly: false,
	lr: 2e-4,
	warmup: 50,
	scheduler: 'cosine',
	weightDecay: 0.01,
	epochs: 3,
	batchSize: 2,
	gradAccum: 4,
	seqLen: 512,
	amp: 'fp16',
	gradClip: 1.0,
	seed: 42,
	earlyStop: 2,
	valRatio: 0.1,
	genTemp: 0.8,
	genTopK: 50,
	genTopP: 0.9,
	genMaxLen: 80,
	testRatio: 0.1
};

export const RECIPE_RANGES = {
	loraR: { min: 4, max: 64, step: 1 },
	loraAlpha: { min: 8, max: 128, step: 1 },
	loraDropout: { min: 0, max: 0.2, step: 0.01 },
	lr: { min: 1e-5, max: 5e-4, step: 1e-5 },
	warmup: { min: 0, max: 200, step: 1 },
	weightDecay: { min: 0, max: 0.1, step: 0.01 },
	epochs: { min: 1, max: 10, step: 1 },
	batchSize: { min: 1, max: 8, step: 1 },
	gradAccum: { min: 1, max: 16, step: 1 },
	seqLen: { min: 128, max: 1024, step: 128 },
	freezeUnfreezeLast: { min: 1, max: 4, step: 1 }
};

export function recommendedFor(method: FtMethod): Recipe {
	const r = { ...RECOMMENDED, loraModules: [...RECOMMENDED.loraModules], method };
	if (method === 'full') r.lr = 5e-5;
	else r.lr = 2e-4;
	return r;
}

export function formatLr(n: number, zh = true): string {
	if (!Number.isFinite(n)) return '—';
	if (Math.abs(n - 0.0002) < 1e-12) return zh ? '万分之二（0.0002）' : '0.0002';
	if (Math.abs(n - 0.00005) < 1e-12) return zh ? '十万分之五（0.00005）' : '0.00005';
	const s = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
	return s;
}

export function methodLabel(method: string, zh = true): string {
	if (method === 'lora') return zh ? '旁边加一小块（LoRA）' : 'A small add-on (LoRA)';
	if (method === 'freeze') return zh ? '只改最后几层（冻结）' : 'Only the last layers (freeze)';
	if (method === 'full') return zh ? '几乎全部改（全量）' : 'Almost all weights (full)';
	return method;
}

export function ampLabel(amp: string, zh = true): string {
	if (amp === 'fp16') return zh ? '半精度（更省显存）' : 'Half precision (saves memory)';
	if (amp === 'bf16') return zh ? 'BF16 半精度' : 'BF16';
	if (amp === 'auto') return zh ? '自动选精度' : 'Automatic precision';
	return zh ? '全精度' : 'Full precision';
}

export const FT_TRAIN_LOOP = [
	{
		id: 'forward',
		titleZh: '前向：算出下一个词的概率',
		titleEn: 'Forward: next-token probabilities',
		bodyZh: '模型先读已有词片，算出下一个词片的概率表。这和文字课右边那张排行是同一件事。',
		bodyEn: 'The model reads the token chips so far and builds a next-token probability table — the same idea as the ranking in the text course.'
	},
	{
		id: 'loss',
		titleZh: '算出损失',
		titleEn: 'Compute the loss',
		bodyZh: '看看它对「真正的下一个词片」给了多少概率。真正该出现的词如果排得低，损失就高。',
		bodyEn: 'Look at how much probability the true next chip got. If it ranks low, the loss is high.'
	},
	{
		id: 'backward',
		titleZh: '回看：权重动了一点',
		titleEn: 'Look back: a weight nudges',
		bodyZh: '正确答案那一行偏低，示意里有一条权重被轻轻推了一下。先看见这一推；它的方向和大小后来叫梯度，把这笔账往回传到权重叫反向传播。这是示意，不是实时训练平均。',
		bodyEn: 'The true-token row is too low, so a sketch weight is nudged a little. See that move first. The direction and size is later called the gradient, and sending the tally back to the weight is backpropagation. This is a sketch, not a live training average.'
	},
	{
		id: 'update',
		titleZh: '按所选方法更新',
		titleEn: 'Update with the chosen method',
		bodyZh: '只改方法允许动的那些参数。旁边加一小块时，原权重通常还在。',
		bodyEn: 'Only the parameters allowed by the method are updated. With a small add-on, the original weights usually stay in place.'
	}
] as const;

export function loopIndexForExplain(stepId: string): number {
	if (stepId === 'compute-loss') return 1;
	if (stepId === 'backward') return 2;
	if (stepId === 'update-method' || stepId === 'lr-step') return 3;
	if (stepId === 'watch-curves' || stepId === 'eval-compare' || stepId === 'overfit') return 1;
	return 0;
}

export type KnobHint = { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; kind: string };

export function knobHintFor(patch: Partial<Recipe>, recipe: Recipe): KnobHint | null {
	const keys = Object.keys(patch) as (keyof Recipe)[];
	if (!keys.length) return null;
	const key = keys[0];
	if (key === 'lr') {
		const up = (patch.lr ?? 0) > recipe.lr;
		return {
			kind: 'lr',
			titleZh: '这会怎样：学习率',
			titleEn: 'What this does: learning rate',
			bodyZh: up
				? '步子变大，曲线更容易抖。太大时损失会上下跳，不一定学得更快。'
				: '步子变小，走得更稳，但也更慢。太小会在原地爬很久。',
			bodyEn: up
				? 'The step gets larger, so the curve is more likely to jitter. Bigger is not automatically faster.'
				: 'The step gets smaller and steadier, but also slower. Too small and training crawls.'
		};
	}
	if (key === 'seqLen') {
		const up = (patch.seqLen ?? 0) > recipe.seqLen;
		return {
			kind: 'seq',
			titleZh: '这会怎样：一条文本的长度',
			titleEn: 'What this does: sequence length',
			bodyZh: up
				? '更吃约 8GB 显存，长句子能留下更多词片；也更容易把更长的部分截掉。被截掉的不会进入训练。'
				: '更省显存，但长句子更容易被切短。被截掉的那一截不会进入训练。',
			bodyEn: up
				? 'This uses more of the ~8GB memory and can keep more chips, but long text is also easier to truncate. The cut-off part does not enter training.'
				: 'This saves memory, but long sentences are cut shorter. The cut-off part does not enter training.'
		};
	}
	if (key === 'batchSize' || key === 'gradAccum') {
		return {
			kind: 'batch',
			titleZh: '这会怎样：一次看多少条',
			titleEn: 'What this does: how many examples per update',
			bodyZh: '一次真正更新看见的条数 ≈ 批次 × 累积。条数变多通常更稳，也更吃约 8GB 显存。不够用时，先把一条文本的长度，或一次看的条数，调小一点。',
			bodyEn: 'Each update sees about batch × accumulation examples. More is usually steadier, and uses more of the ~8GB memory. If memory is tight, shorten the sequence or look at fewer examples at once.'
		};
	}
	if (key === 'epochs') {
		return {
			kind: 'epochs',
			titleZh: '这会怎样：把数据过几遍',
			titleEn: 'What this does: how many passes',
			bodyZh: '多过几遍不一定更好。验证损失若开始抬头，再训下去更容易死记。该停时看验证曲线。',
			bodyEn: 'More passes are not automatically better. If validation loss starts to rise, more training often memorizes. Watch the validation curve to know when to stop.'
		};
	}
	if (key === 'loraR') {
		const up = (patch.loraR ?? 0) > recipe.loraR;
		return {
			kind: 'r',
			titleZh: '这会怎样：旁边那一小块的宽度',
			titleEn: 'What this does: add-on width',
			bodyZh: up
				? '旁边加的那一小块更大，能改的东西更多，也更吃计算。这不等于已经改了基座原文件。'
				: '旁边那一小块更窄，更省，能改的幅度也更小。原权重通常还在。',
			bodyEn: up
				? 'The small add-on gets wider, so it can change more, and it costs more compute. This does not rewrite the original base file.'
				: 'The add-on gets narrower and cheaper, and can change less. The original weights usually stay as they were.'
		};
	}
	if (key === 'method') {
		return {
			kind: 'method',
			titleZh: '这会怎样：换一种改法',
			titleEn: 'What this does: a different method',
			bodyZh: '上面的层示意图会先变：全量几乎都亮，冻结只亮最后几层或输出层，旁边加一小块则原权重不动。旋钮会跟着出现。',
			bodyEn: 'The layer sketch above changes first: almost all layers light up for a full update, only the last layers or the output for freezing, and a small add-on sits beside unchanged base weights. The knobs follow.'
		};
	}
	if (key === 'earlyStop') {
		return {
			kind: 'early',
			titleZh: '这会怎样：早停',
			titleEn: 'What this does: early stop',
			bodyZh: '验证损失连续几次不再下降就停下，避免多训几轮把语料背下来。0 表示不自动停。',
			bodyEn: 'Stop after several validation checks with no improvement, so extra passes do not memorize the corpus. 0 means do not stop automatically.'
		};
	}
	if (key === 'amp') {
		return {
			kind: 'amp',
			titleZh: '这会怎样：计算精度',
			titleEn: 'What this does: precision',
			bodyZh: '半精度更省约 8GB 显存；全精度更稳，但更吃显存。',
			bodyEn: 'Half precision saves some of the ~8GB memory. Full precision is steadier, but heavier.'
		};
	}
	if (key === 'valRatio') {
		return {
			kind: 'split',
			titleZh: '这会怎样：留下来检查的比例',
			titleEn: 'What this does: the held-out share',
			bodyZh: '这些文本不当场拿去训练。不能把它们漏进训练集，否则检查成绩会假好。',
			bodyEn: 'This text is not used in the update. It must not leak into training, or the check will look falsely good.'
		};
	}
	return null;
}

export function cloneRecipe(r: Recipe): Recipe {
	return { ...r, loraModules: [...r.loraModules] };
}

export const DEFAULT_PROMPTS = [
	{ zh: '今天把这一章读完，我记下：', en: 'I finished the chapter today, and I wrote down:' },
	{ zh: '写四行短诗，题目是窗边的灯光：', en: 'Write four short lines titled “The lamp by the window”:' },
	{ zh: '用两句话说明学习率太大时常见的现象：', en: 'In two sentences, say what often happens when the learning rate is too large:' },
	{ zh: '把交叉熵损失用大白话讲给自己听：', en: 'Explain cross-entropy loss to myself in plain words:' }
];

export const FT_EXPLAIN_STEPS = [
	{
		id: 'frozen-infer',
		titleZh: '先分清：改的是权重，不是温度',
		titleEn: 'First see the line: we change weights, not temperature',
		bodyZh: '文字课里权重是锁住的，拧温度只改怎么抽。这一课才改权重。',
		bodyEn: 'In the text course the weights stay frozen; temperature only changes how we draw a word. This course is the one that changes weights.',
		sels: ['.ft-step-panel', '.ft-contrast-lead', '.ft-see-tokens'],
		goPanel: 'data' as const,
		goSel: '.ft-tokenize',
		goZh: '下一步：看见分词',
		goEn: 'Next: see the tokens'
	},
	{
		id: 'prepare-data',
		titleZh: '先准备训练文本',
		titleEn: 'First prepare the training text',
		bodyZh: '每一条样本都是你希望模型学着写的话。模型会跟着你喂的文本走，所以只放自己的学习实验材料。',
		bodyEn: 'Each sample is text you want the model to learn to write. It follows what you feed it, so only use your own study material.',
		sels: ['.ft-data', '.ft-pack'],
		goPanel: 'data' as const,
		goSel: '.ft-data',
		goZh: '去数据台准备文本',
		goEn: 'Go to the data desk'
	},
	{
		id: 'tokenize-labels',
		titleZh: '分词，并标出下一个词',
		titleEn: 'Tokenize and mark the next token',
		bodyZh: '文本被切成词片（token）。每个位置的标签就是它后面那一个词片。这和文字课的「下一个词」是同一件事。',
		bodyEn: 'Text is cut into token chips. The label at each position is the next chip — the same idea as the text course.',
		sels: ['.ft-tokenize'],
		goPanel: 'data' as const,
		goSel: '.ft-tokenize',
		goZh: '去数据台预览分词',
		goEn: 'Preview tokens on the data desk'
	},
	{
		id: 'compute-loss',
		titleZh: '算出交叉熵损失',
		titleEn: 'Compute the cross-entropy loss',
		bodyZh: '模型给出下一个词的概率表。交叉熵看它对「真正那个词」给了多少概率：给得越少，损失越大。',
		bodyEn: 'The model produces a next-token probability table. Cross-entropy is large when the true token gets little probability.',
		sels: ['.ft-step-panel'],
		goPanel: 'train' as const,
		goSel: '.ft-curve',
		goZh: '去训练监控看损失会写在哪',
		goEn: 'See where the loss will appear'
	},
	{
		id: 'backward',
		titleZh: '看见权重动了一点，再叫它梯度',
		titleEn: 'See a weight nudge, then call it a gradient',
		bodyZh: '先看示意里那条权重被轻轻推了一下，因为正确词的份额太低。这一推的方向和大小就是梯度；把账往回传叫反向传播。数字仍是示意，不是实时训练平均。',
		bodyEn: 'First watch the sketch weight being nudged, because the true token’s share was too low. The direction and size of that nudge is the gradient; sending the tally back is backpropagation. The numbers stay a sketch, not a live training average.',
		sels: ['.ft-step-panel'],
		goPanel: 'train' as const,
		goSel: '.ft-curve',
		goZh: '去训练监控看更新后的曲线位置',
		goEn: 'See the monitor where updates show up'
	},
	{
		id: 'update-method',
		titleZh: '按方法更新参数',
		titleEn: 'Update parameters by method',
		bodyZh: '旁边加一小块（LoRA）只训练原权重旁边的小矩阵；冻结只训练最后几层或输出层；全量则几乎所有权重都动。没合并之前，基座原文件通常还在。',
		bodyEn: 'A small add-on (LoRA) trains tiny matrices beside the original weights; freezing trains only the last layers or the output; a full update moves almost all weights. Until you merge, the original base file usually stays as it was.',
		sels: ['.ft-method', '.ft-lora'],
		goPanel: 'recipe' as const,
		goSel: '.ft-method',
		goZh: '去方法与参数看三种调法',
		goEn: 'See the three methods'
	},
	{
		id: 'lr-step',
		titleZh: '用学习率走一小步',
		titleEn: 'Take a small step with the learning rate',
		bodyZh: '学习率决定这一步迈多大。太大容易抖，太小走得慢。预热和调度器会再改这个步长。',
		bodyEn: 'The learning rate is the step size. Too large and training jitters; too small and it crawls. Warmup and the scheduler change this size.',
		sels: ['.ft-lr', '.ft-scheduler'],
		goPanel: 'recipe' as const,
		goSel: '.ft-advanced',
		goZh: '去方法与参数看学习率（打开旋钮后可见）',
		goEn: 'See the learning rate (after opening the knobs)'
	},
	{
		id: 'watch-curves',
		titleZh: '看训练曲线和验证曲线',
		titleEn: 'Watch the train and validation curves',
		bodyZh: '训练损失下降只说明「对手头的数据更有把握」，并不等于越好。验证损失变差，常常是过拟合。多训几轮也不一定更好。',
		bodyEn: 'A falling training loss only means the model is more confident on the data at hand — not that lower is always better. If validation loss gets worse, that is often overfitting. More passes are not automatically better.',
		sels: ['.ft-curve', '.ft-early'],
		goPanel: 'train' as const,
		goSel: '.ft-curve',
		goZh: '去训练监控看曲线',
		goEn: 'Go to the monitor and watch the curves'
	},
	{
		id: 'compare-gen',
		titleZh: '同一提示对照基座与微调后',
		titleEn: 'Compare base vs fine-tuned on the same prompts',
		bodyZh: '开训前后用同一批提示词续写。也试一条语料外的提示，区分是学会了口吻，还是在背诵。',
		bodyEn: 'Generate from the same prompts before and after training. Also try a prompt outside the corpus, to tell style from memorization.',
		sels: ['.ft-playground', '.ft-compare'],
		goPanel: 'play' as const,
		goSel: '.ft-compare',
		goZh: '去对照游乐场看前后续写',
		goEn: 'Compare continuations in the playground'
	}
];

export const FT_COACH_TARGETS: Record<string, string> = {
	map: '.ft-contrast-lead',
	five: '.ft-data',
	pack: '.ft-tokenize',
	split: '.ft-split',
	baseline: '.ft-baseline',
	recipe: '.ft-recommend',
	start: '.ft-start',
	curve: '.ft-curve',
	compare: '.ft-compare',
	temp: '.ft-temp',
	methods: '.ft-method',
	loss: '[data-te-ft="loss"], [data-te-bridge="loss-table"], [data-te-math="loss-walk"]',
	book: '.ft-guide'
};

export const FT_SELECTORS = {
	stepBtn: '.ft-step-btn',
	stepPanel: '.ft-step-panel',
	data: '.ft-data',
	pack: '.ft-pack',
	upload: '.ft-upload',
	split: '.ft-split',
	tokenize: '.ft-tokenize',
	method: '.ft-method',
	lora: '.ft-lora',
	freeze: '.ft-freeze',
	lr: '.ft-lr',
	scheduler: '.ft-scheduler',
	batch: '.ft-batch',
	seq: '.ft-seq',
	amp: '.ft-amp',
	seed: '.ft-seed',
	early: '.ft-early',
	recommend: '.ft-recommend',
	advanced: '.ft-advanced',
	start: '.ft-start',
	pause: '.ft-pause',
	stop: '.ft-stop',
	resume: '.ft-resume',
	curve: '.ft-curve',
	log: '.ft-log',
	vram: '.ft-vram',
	playground: '.ft-playground',
	temp: '.ft-temp',
	sampling: '.ft-sampling',
	compare: '.ft-compare',
	archive: '.ft-archive',
	export: '.ft-export',
	help: '.ft-server-help',
	short: '.ft-short',
	overfit: '.ft-overfit',
	oneKnob: '.ft-one-knob',
	leak: '.ft-leak',
	sft: '.ft-sft',
	evalCard: '.ft-eval',
	ckpt: '.ft-ckpt',
	testSplit: '.ft-test-split'
};

export function panelForSelector(sel: string): FtPanel {
	const s = sel.startsWith('.') ? sel : '.' + sel;
	if (['.ft-data', '.ft-pack', '.ft-upload', '.ft-split', '.ft-tokenize', '.ft-leak', '.ft-sft', '.ft-test-split'].includes(s)) return 'data';
	if (
		['.ft-method', '.ft-lora', '.ft-freeze', '.ft-lr', '.ft-scheduler', '.ft-batch', '.ft-seq', '.ft-amp', '.ft-seed', '.ft-early', '.ft-recommend', '.ft-advanced'].includes(
			s
		)
	)
		return 'recipe';
	if (['.ft-start', '.ft-pause', '.ft-stop', '.ft-resume', '.ft-curve', '.ft-log', '.ft-vram', '.ft-short', '.ft-overfit', '.ft-one-knob', '.ft-ckpt'].includes(s)) return 'train';
	if (['.ft-playground', '.ft-temp', '.ft-sampling', '.ft-compare', '.ft-baseline', '.ft-eval'].includes(s)) return 'play';
	if (['.ft-archive', '.ft-export'].includes(s)) return 'archive';
	return 'explain';
}

export type FtPanel = 'explain' | 'data' | 'recipe' | 'train' | 'play' | 'archive';


export const OVERFIT_MAX_STEPS = 12;
export const SHORT_RUN_STEPS = 2;
export const ONE_KNOB_STEPS = 2;

/** Pedagogical sketch: training keeps falling, validation bottoms then rises. Labeled 示意 in the UI. */
export const DEMO_OVERFIT_METRICS = [
	{ step: 1, trainLoss: 3.20, valLoss: 3.10 },
	{ step: 3, trainLoss: 2.60, valLoss: 2.72 },
	{ step: 5, trainLoss: 2.10, valLoss: 2.41 },
	{ step: 7, trainLoss: 1.70, valLoss: 2.22 },
	{ step: 9, trainLoss: 1.32, valLoss: 2.38 },
	{ step: 11, trainLoss: 1.05, valLoss: 2.66 }
];

export type EvalKind = 'in' | 'out' | 'forget' | 'sft';
export type EvalPrompt = { id: string; kind: EvalKind; zh: string; en: string };

export type DemoContrastItem = {
	id: string;
	kind: EvalKind;
	promptZh: string;
	promptEn: string;
	baseZh: string;
	baseEn: string;
	tunedZh: string;
	tunedEn: string;
	baseProbs: { token: string; display?: string; prob: number }[];
	tunedProbs: { token: string; display?: string; prob: number }[];
};

/** Pedagogical in-corpus vs other-genre contrast. Not a live generation. */
export const DEMO_FORGET_ITEMS: DemoContrastItem[] = [
	{
		id: 'demo-in',
		kind: 'in',
		promptZh: '笔记：残差连接负责',
		promptEn: 'Note: residual connections are for',
		baseZh: '连接两层之间的信息。也许是某种数学技巧。',
		baseEn: 'linking information between layers. Maybe some kind of math trick.',
		tunedZh: '把前面的信号加到后面，让训练更容易走通。今天把这一章记下。',
		tunedEn: 'adding the earlier signal later, which makes training easier to get through. I wrote this chapter down.',
		baseProbs: [
			{ token: '连', display: '连', prob: 0.18 },
			{ token: '把', display: '把', prob: 0.07 },
			{ token: '一种', display: '一种', prob: 0.06 }
		],
		tunedProbs: [
			{ token: '把', display: '把', prob: 0.31 },
			{ token: '把前面', display: '把前面', prob: 0.12 },
			{ token: '连', display: '连', prob: 0.08 }
		]
	},
	{
		id: 'demo-forget',
		kind: 'forget',
		promptZh: '春眠不觉晓，',
		promptEn: 'Once upon a time, in a small village,',
		baseZh: '处处闻啼鸟。夜来风雨声，花落知多少。',
		baseEn: 'there lived a child who listened to the river at night.',
		tunedZh: '我记下：残差连接负责把前面的信号加到后面。今天把这一章读完。',
		tunedEn: 'I wrote down: residual connections are for adding the earlier signal later. I finished the chapter today.',
		baseProbs: [
			{ token: '处处', display: '处处', prob: 0.22 },
			{ token: '梦见', display: '梦见', prob: 0.09 },
			{ token: '我', display: '我', prob: 0.04 }
		],
		tunedProbs: [
			{ token: '我', display: '我', prob: 0.19 },
			{ token: '记下', display: '记下', prob: 0.11 },
			{ token: '处处', display: '处处', prob: 0.05 }
		]
	},
	{
		id: 'demo-out',
		kind: 'out',
		promptZh: '写四行短诗，题目是窗边的灯光：',
		promptEn: 'Write four short lines titled “The lamp by the window”:',
		baseZh: '窗边一盏灯，把夜色轻轻推开。桌上的笔还没合上，等一句没写完的话。',
		baseEn: 'A lamp by the window pushes the night aside. The pen on the desk is still open, waiting for an unfinished line.',
		tunedZh: '今天把这一章记下。残差连接负责把前面的信号加到后面。',
		tunedEn: 'I finished the chapter today, and I wrote down: residual connections are for adding the earlier signal later.',
		baseProbs: [
			{ token: '窗', display: '窗', prob: 0.16 },
			{ token: '灯', display: '灯', prob: 0.10 },
			{ token: '今天', display: '今天', prob: 0.03 }
		],
		tunedProbs: [
			{ token: '今天', display: '今天', prob: 0.21 },
			{ token: '笔记', display: '笔记', prob: 0.09 },
			{ token: '窗', display: '窗', prob: 0.04 }
		]
	}
];

export const SFT_DEMO_PAIRS: { qZh: string; aZh: string; qEn: string; aEn: string }[] = [
	{ qZh: '残差连接是干什么的？', aZh: '它把前面的信号直接加到后面，让训练更容易走通。', qEn: 'What does a residual connection do?', aEn: 'It adds the earlier signal to the later one, which makes training easier to get through.' },
	{ qZh: '温度这个旋钮改的是什么？', aZh: '它只改推理时怎么抽样，不改模型里的权重。', qEn: 'What does the temperature knob change?', aEn: 'It only changes how we sample at inference, not the weights inside the model.' },
	{ qZh: '验证集为什么不能漏进训练？', aZh: '漏进去以后，验证读数会假好，就发现不了过拟合。', qEn: 'Why must the validation set not leak into training?', aEn: 'If it leaks, the validation score looks falsely good, and you cannot catch overfitting.' },
	{ qZh: '旁边加一小块（LoRA）改了基座原文件吗？', aZh: '默认没有。它先加在旁边，没合并前基座原文件通常还在。', qEn: 'Does the small add-on (LoRA) change the original base file?', aEn: 'Not by default. It sits beside the base, and the original file usually stays until you merge.' },
	{ qZh: '学习率太大时常见的现象是什么？', aZh: '损失会抖，甚至往上走，更新迈得太猛。', qEn: 'What often happens when the learning rate is too large?', aEn: 'The loss jitters or even rises, because each update steps too far.' },
	{ qZh: '微调后还要看语料外的提示吗？', aZh: '要看。只看语料内续写像不像，会漏掉泛化变差。', qEn: 'Should we still check out-of-corpus prompts after fine-tuning?', aEn: 'Yes. Looking only at in-corpus continuations can miss a drop in generalization.' },
	{ qZh: '交叉熵损失在量什么？', aZh: '它在量「下一个词预测得准不准」，数字越小表示越接近目标词。', qEn: 'What does cross-entropy loss measure?', aEn: 'It measures how accurately the next word is predicted. Lower means closer to the target word.' },
	{ qZh: '早停是在等什么？', aZh: '等验证损失不再变好。多训几轮不一定更好。', qEn: 'What is early stopping waiting for?', aEn: 'It waits until validation loss stops improving. More passes are not automatically better.' },
	{ qZh: '词片和汉字是一回事吗？', aZh: '不一定。一个汉字常被切成多枚词片，那才是模型真正看见的单位。', qEn: 'Is a token the same as a Chinese character?', aEn: 'Not necessarily. One character is often split into several tokens, and those are what the model actually sees.' },
	{ qZh: '完整训练和极短跑有何不同？', aZh: '极短跑只跑很少几步，用来确认循环能通；完整训练才是加深项。', qEn: 'How is a full run different from a short run?', aEn: 'A short run takes only a couple of steps to confirm the loop works. A full run is the deeper option.' }
];

export function sftDemoTexts(zh = true): string[] {
	return SFT_DEMO_PAIRS.map((p) => (zh ? `问：${p.qZh}\n答：${p.aZh}` : `Q: ${p.qEn}\nA: ${p.aEn}`));
}

export const EVAL_PROMPTS: EvalPrompt[] = [
	{ id: 'in1', kind: 'in', zh: '今天把这一章读完，我记下：', en: 'I finished the chapter today, and I wrote down:' },
	{ id: 'in2', kind: 'in', zh: '笔记：残差连接负责', en: 'Note: residual connections are for' },
	{ id: 'in3', kind: 'in', zh: '我自己的记法是：', en: 'My own way of remembering it is:' },
	{ id: 'out1', kind: 'out', zh: '写四行短诗，题目是窗边的灯光：', en: 'Write four short lines titled “The lamp by the window”:' },
	{ id: 'out2', kind: 'out', zh: '请用日常口语跟朋友打个招呼：', en: 'Greet a friend in everyday spoken language:' },
	{ id: 'forget1', kind: 'forget', zh: '春眠不觉晓，', en: 'Once upon a time, in a small village,' },
	{ id: 'forget2', kind: 'forget', zh: '讲一个小小的故事：从前有一座山，', en: 'Tell a tiny story: once there was a mountain,' },
	{ id: 'sft1', kind: 'sft', zh: '问：残差连接是干什么的？\n答：', en: 'Q: What does a residual connection do?\nA:' },
	{ id: 'sft2', kind: 'sft', zh: '问：温度这个旋钮改的是什么？\n答：', en: 'Q: What does the temperature knob change?\nA:' }
];

export function evalPromptsFor(opts: { zh?: boolean; sftMode?: boolean } = {}): { id: string; kind: EvalKind; text: string }[] {
	const zh = opts.zh !== false;
	const kinds: EvalKind[] = opts.sftMode ? ['sft', 'in', 'out', 'forget'] : ['in', 'out', 'forget'];
	return EVAL_PROMPTS.filter((p) => kinds.includes(p.kind)).map((p) => ({
		id: p.id,
		kind: p.kind,
		text: zh ? p.zh : p.en
	}));
}

export function formatLrOrDash(n: unknown, zh = true): string {
	return typeof n === 'number' && Number.isFinite(n) ? formatLr(n, zh) : '—';
}

export function runPlainSummary(run: { recipe?: Record<string, unknown>; samplesCount?: number; leakVal?: boolean; split?: { train?: number; val?: number; test?: number; leaked?: boolean }; bestValLoss?: number | null; bestValStep?: number | null; usedCheckpoint?: string; testLoss?: number | null; status?: string }, zh = true): string[] {
	const rec = run.recipe || {};
	const method = methodLabel(String(rec.method || 'lora'), zh);
	const lr = formatLrOrDash(rec.lr, zh);
	const r = rec.loraR != null ? String(rec.loraR) : '—';
	const n = run.samplesCount ?? ((run.split?.train || 0) + (run.split?.val || 0) + (run.split?.test || 0));
	const leak = !!(run.leakVal || rec.leakVal || run.split?.leaked);
	const exp = String(rec.experiment || '');
	const lines: string[] = [];
	lines.push(zh ? `方法：${method}` : `Method: ${method}`);
	lines.push(zh ? `学习率 ${lr}${rec.method === 'lora' ? `，旁边一小块的宽度（秩）是 ${r}` : ''}` : `Learning rate ${lr}${rec.method === 'lora' ? `, add-on width (rank) ${r}` : ''}`);
	if (run.split) {
		lines.push(
			zh
				? `数据：训练 ${run.split.train ?? '—'} 条，验证 ${run.split.val ?? '—'} 条，测试 ${run.split.test ?? 0} 条（共约 ${n} 条）。`
				: `Data: ${run.split.train ?? '—'} train, ${run.split.val ?? '—'} val, ${run.split.test ?? 0} test (about ${n} total).`
		);
	} else if (n) {
		lines.push(zh ? `数据约 ${n} 条。` : `About ${n} examples.`);
	}
	if (exp === 'overfit') lines.push(zh ? '这次是「故意多训几轮」的短演示。' : 'This was the short “train a little longer on purpose” demo.');
	if (exp === 'one-knob') {
		const knob = rec.changedKnob === 'loraR' ? (zh ? '旁边一小块的宽度（秩）' : 'add-on width (rank)') : (zh ? '学习率' : 'learning rate');
		lines.push(zh ? `只改了一个旋钮：${knob}。其余设定锁定。` : `Only one knob was changed: ${knob}. Everything else was locked.`);
	}
	if (exp === 'short') lines.push(zh ? '这是先跑 2 步、确认能通的极短跑。' : 'This was a 2-step short run to confirm the loop works.');
	if (leak) lines.push(zh ? '注意：验证集漏进了训练，验证读数可能假好。' : 'Note: the validation set leaked into training, so the val score may look falsely good.');
	if (run.bestValStep != null && run.bestValLoss != null) {
		lines.push(
			zh
				? `验证最好的一步是第 ${run.bestValStep} 步，验证损失 ${Number(run.bestValLoss).toFixed(3)}。${run.usedCheckpoint === 'best' ? '导出/续写已尽量用这一次。' : '如果还没用上它，建议改选这一次。'}`
				: `Best validation was at step ${run.bestValStep}, val loss ${Number(run.bestValLoss).toFixed(3)}.${run.usedCheckpoint === 'best' ? ' Export/generation prefers this checkpoint.' : ' If it was not used, prefer this one.'}`
		);
	}
	if (run.testLoss != null) lines.push(zh ? `测试损失 ${Number(run.testLoss).toFixed(3)}（开训前留下、不当场训练的一小份）。` : `Test loss ${Number(run.testLoss).toFixed(3)} (a tiny hold-out set, not used in the update).`);
	return lines;
}

export function knobDelta(a: { recipe?: Record<string, unknown>; leakVal?: boolean }, b: { recipe?: Record<string, unknown>; leakVal?: boolean }, zh = true): string {
	const ra = a?.recipe || {};
	const rb = b?.recipe || {};
	const diffs: string[] = [];
	if (ra.method !== rb.method) diffs.push(zh ? `方法：${methodLabel(String(ra.method || ''), zh)} ↔ ${methodLabel(String(rb.method || ''), zh)}` : `method: ${methodLabel(String(ra.method || ''), zh)} ↔ ${methodLabel(String(rb.method || ''), zh)}`);
	if (Number(ra.lr) !== Number(rb.lr)) diffs.push(zh ? `学习率：${formatLrOrDash(ra.lr, zh)} ↔ ${formatLrOrDash(rb.lr, zh)}` : `learning rate: ${formatLrOrDash(ra.lr, zh)} ↔ ${formatLrOrDash(rb.lr, zh)}`);
	if (Number(ra.loraR) !== Number(rb.loraR)) diffs.push(zh ? `旁边一小块的宽度（秩）：${ra.loraR ?? '—'} ↔ ${rb.loraR ?? '—'}` : `add-on width (rank): ${ra.loraR ?? '—'} ↔ ${rb.loraR ?? '—'}`);
	const leakA = !!(a.leakVal || ra.leakVal);
	const leakB = !!(b.leakVal || rb.leakVal);
	if (leakA !== leakB) diffs.push(zh ? `验证集泄漏：${leakA ? '开' : '关'} ↔ ${leakB ? '开' : '关'}` : `validation leak: ${leakA ? 'on' : 'off'} ↔ ${leakB ? 'on' : 'off'}`);
	if (String(ra.seed) !== String(rb.seed)) diffs.push(zh ? `随机起点不同` : `different seeds`);
	if (!diffs.length) {
		return zh ? '这两次的方法、学习率、秩和泄漏设定看起来一样。请再并排看数据和曲线。' : 'Method, learning rate, rank, and leak settings look the same. Compare the data and curves side by side.';
	}
	return (zh ? '差别主要来自：' : 'The difference mainly comes from: ') + diffs.join(zh ? '；' : '; ') + (zh ? '。请据此讲出是哪个旋钮或哪种数据问题。' : '. Use that to say which knob or data issue did the work.');
}

export function evalReading(
	items: { kind: EvalKind; base?: string; tuned?: string }[],
	opts: { leak?: boolean; zh?: boolean } = {}
): string {
	const zh = opts.zh !== false;
	if (opts.leak) {
		return zh
			? '这次验证集漏进了训练，验证读数可能假好，不能把它当成真正的检查。请关掉泄漏，用同一拆分再跑一次对照。'
			: 'The validation set leaked into training, so the val score may look falsely good and cannot be trusted. Turn leak off and rerun with the same split.';
	}
	const noteRe = /笔记|记下|记法|今天把这一章|残差连接负责|I wrote down|My own way|residual connections are for/i;
	const inItems = items.filter((i) => i.kind === 'in' || i.kind === 'sft');
	const outItems = items.filter((i) => i.kind === 'out' || i.kind === 'forget');
	const inLike = inItems.some((i) => noteRe.test(i.tuned || ''));
	const outLikeNotes = outItems.some((i) => noteRe.test(i.tuned || '') && !noteRe.test(i.base || ''));
	const outCollapsed = outItems.some((i) => (i.tuned || '').length > 0 && (i.tuned || '').length + 8 < (i.base || '').length);
	if (inLike && (outLikeNotes || outCollapsed)) {
		return zh
			? '微调后，语料内的续写更像手头的笔记了；但语料外或另一类提示也开始往笔记上靠，或本来会写的内容变差。这就是「像语料但泛化变差」，也是灾难性遗忘的苗头。'
			: 'After fine-tuning, in-corpus continuations look more like the notes, but out-of-corpus or other-genre prompts also drift toward the notes, or get worse than the base model. That is “looks like the corpus, but generalizes worse,” and a sign of catastrophic forgetting.';
	}
	if (inLike) {
		return zh
			? '语料内更像手头的文本了。请再看语料外和另一类提示：如果那边也变差或开始像笔记，就是泛化在变弱。'
			: 'In-corpus text looks more like the data at hand. Check out-of-corpus and other-genre prompts: if those get worse or start sounding like the notes, generalization is slipping.';
	}
	return zh
		? '请同时看验证损失、固定提示上的概率条和续写。不要只用训练损失和「两段像不像」下结论。'
		: 'Look at validation loss, the probability bars, and the continuations on the fixed prompts together. Do not judge only by training loss or whether two snippets “look alike.”';
}
