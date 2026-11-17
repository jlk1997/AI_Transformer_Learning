import type { CourseId } from '~/store/course';
import { IMAGE_SELECTORS } from '~/courses/image/store';
import { MUSIC_SELECTORS } from '~/courses/music/store';
import { FT_SELECTORS } from '~/courses/finetune/presets';
import type { LabSignalId } from '~/courses/labSignals';

export type QuizGroup = string;

export type QuizItem = {
	group: QuizGroup;
	pageId: string;
	stationId?: string;
	q: string;
	a: string;
	b: string;
	ok: 0 | 1;
	why: string;
	transfer?: boolean;
};

export type LabVerify =
	| { kind: 'signal'; signal: LabSignalId; seenZh: string; seenEn: string }
	| { kind: 'manual'; reasonZh: string; reasonEn: string };

export type WorkbenchMeta = {
	storageKey: string;
	labIds: string[];
	messagesKey: 'workbench' | 'imageWb' | 'musicWb' | 'finetuneWb';
	glossaryKey: 'glossary' | 'imageGlossary' | 'musicGlossary' | 'finetuneGlossary';
	labSelectors: Record<string, string | null>;
	labVerify: Record<string, LabVerify>;
	glossIds: string[];
	glossSel: Record<string, string>;
	quizGroups: { id: QuizGroup; titleKey: string }[];
	quiz: QuizItem[];
};

const TEXT: WorkbenchMeta = {
	storageKey: 'te-lab-checks',
	labIds: ['lab1', 'lab2', 'lab3', 'lab4', 'lab5'],
	messagesKey: 'workbench',
	glossaryKey: 'glossary',
	labSelectors: {
		lab1: '.temperature-input',
		lab2: '.sampling-input',
		lab3: '.step.attention',
		lab4: '.step.embedding .title',
		lab5: null
	},
	labVerify: {
		lab1: {
			kind: 'signal',
			signal: 'text-temp-knob',
			seenZh: '已经看见：你拖过温度，右边的概率条已经变过形状。',
			seenEn: 'Seen: you moved temperature, and the probability bars changed shape.'
		},
		lab2: {
			kind: 'signal',
			signal: 'text-sampling-knob',
			seenZh: '已经看见：你改过 Top-k 或 Top-p，候选集合的规则已经动过。',
			seenEn: 'Seen: you changed Top-k or Top-p, so the candidate rule has moved.'
		},
		lab3: {
			kind: 'signal',
			signal: 'text-input-or-head',
			seenZh: '已经看见：你换过输入，或换过注意力头、块。',
			seenEn: 'Seen: you changed the input, or switched attention head or block.'
		},
		lab4: {
			kind: 'manual',
			reasonZh: '打开放大镜这件事，我没法诚实替你确认。请你自己点开看一看，看完再标明「我自己看过了」。',
			reasonEn: 'I cannot honestly confirm that you opened the magnifiers. Look for yourself, then mark “I looked myself.”'
		},
		lab5: {
			kind: 'manual',
			reasonZh: '复述整条流水线没法替你勾选。请自己讲一遍，讲完再标明「我自己讲过了」。',
			reasonEn: 'I cannot mark a retell for you. Say the pipeline in your own words, then mark “I said it myself.”'
		}
	},
	glossIds: [
		'token',
		'embedding',
		'positional',
		'qkv',
		'mask',
		'multiHead',
		'mlp',
		'residual',
		'layerNorm',
		'dropout',
		'logit',
		'softmax',
		'temperature',
		'topkTopp',
		'autoregression',
		'decoderOnly'
	],
	glossSel: {
		token: '.column.token-string',
		embedding: '.step.embedding .title',
		positional: '.column.position-embedding',
		qkv: '.step.attention .title',
		mask: '.attention-matrix.attention-mask',
		multiHead: '.step.attention',
		mlp: '.step.mlp .title',
		residual: '.guide-text.residual-text',
		layerNorm: '.guide-text.ln-text',
		dropout: '.guide-text.dropout-text',
		logit: '.title-box.logits',
		softmax: '.title-box.probability',
		temperature: '.temperature-input',
		topkTopp: '.sampling-input',
		autoregression: '.generate-button',
		decoderOnly: '.main-section'
	},
	quizGroups: [
		{ id: 'qkv', titleKey: 'quizGroupQkv' },
		{ id: 'mask', titleKey: 'quizGroupMask' },
		{ id: 'temp', titleKey: 'quizGroupTemp' },
		{ id: 'transfer', titleKey: 'quizGroupTransfer' }
	],
	quiz: [
		{ group: 'qkv', pageId: 'qkv', q: 'q1q', a: 'q1a', b: 'q1b', ok: 1, why: 'q1why' },
		{ group: 'qkv', pageId: 'qkv', q: 'q2q', a: 'q2a', b: 'q2b', ok: 1, why: 'q2why' },
		{ group: 'mask', pageId: 'masked-self-attention', q: 'q3q', a: 'q3a', b: 'q3b', ok: 1, why: 'q3why' },
		{ group: 'mask', pageId: 'masked-self-attention', q: 'q4q', a: 'q4a', b: 'q4b', ok: 0, why: 'q4why' },
		{ group: 'temp', pageId: 'temperature', q: 'q5q', a: 'q5a', b: 'q5b', ok: 1, why: 'q5why' },
		{ group: 'temp', pageId: 'temperature', q: 'q6q', a: 'q6a', b: 'q6b', ok: 0, why: 'q6why' },
		{
			group: 'transfer',
			pageId: 'temperature',
			stationId: 'generate',
			q: 't1q',
			a: 't1a',
			b: 't1b',
			ok: 1,
			why: 't1why',
			transfer: true
		},
		{
			group: 'transfer',
			pageId: 'temperature',
			stationId: 'knobs',
			q: 't2q',
			a: 't2a',
			b: 't2b',
			ok: 1,
			why: 't2why',
			transfer: true
		}
	]
};

const IMAGE: WorkbenchMeta = {
	storageKey: 'te-lab-checks-image',
	labIds: ['lab1', 'lab2', 'lab3', 'lab4', 'lab5'],
	messagesKey: 'imageWb',
	glossaryKey: 'imageGlossary',
	labSelectors: {
		lab1: IMAGE_SELECTORS.cfg,
		lab2: IMAGE_SELECTORS.steps,
		lab3: IMAGE_SELECTORS.prompt,
		lab4: IMAGE_SELECTORS.denoise,
		lab5: IMAGE_SELECTORS.mode
	},
	labVerify: {
		lab1: {
			kind: 'signal',
			signal: 'image-cfg',
			seenZh: '已经看见：你改过听话程度，对照图已经按新的 CFG 重画过。',
			seenEn: 'Seen: you changed guidance, and the contrast frames were redrawn.'
		},
		lab2: {
			kind: 'signal',
			signal: 'image-steps',
			seenZh: '已经看见：你改过步数，时间表已经换过。',
			seenEn: 'Seen: you changed the step count, so the schedule moved.'
		},
		lab3: {
			kind: 'signal',
			signal: 'image-prompt',
			seenZh: '已经看见：你换过提示词，条件已经变了。',
			seenEn: 'Seen: you changed the prompt, so the condition moved.'
		},
		lab4: {
			kind: 'signal',
			signal: 'image-denoise-step',
			seenZh: '已经看见：你走过至少一步去噪，画布已经变过。',
			seenEn: 'Seen: you took at least one denoise step, and the canvas changed.'
		},
		lab5: {
			kind: 'signal',
			signal: 'image-mode-ar',
			seenZh: '已经看见：你切到过图像 token 这条对照路。',
			seenEn: 'Seen: you switched to the image-token contrast path.'
		}
	},
	glossIds: [
		'prompt',
		'latent',
		'noise',
		'denoise',
		'cfg',
		'seed',
		'steps',
		'vae',
		'dit',
		'ar',
		'cfg2',
		'fail'
	],
	glossSel: {
		prompt: IMAGE_SELECTORS.prompt,
		latent: IMAGE_SELECTORS.canvas,
		noise: IMAGE_SELECTORS.timeline,
		denoise: IMAGE_SELECTORS.denoise,
		cfg: IMAGE_SELECTORS.cfg,
		seed: IMAGE_SELECTORS.seed,
		steps: IMAGE_SELECTORS.steps,
		vae: IMAGE_SELECTORS.vae,
		dit: IMAGE_SELECTORS.canvas,
		ar: IMAGE_SELECTORS.mode,
		cfg2: IMAGE_SELECTORS.condition,
		fail: IMAGE_SELECTORS.cfgCompare
	},
	quizGroups: [
		{ id: 'cfg-seed', titleKey: 'quizGroupQkv' },
		{ id: 'one-step', titleKey: 'quizGroupMask' },
		{ id: 'contrast', titleKey: 'quizGroupTemp' },
		{ id: 'transfer', titleKey: 'quizGroupTransfer' }
	],
	quiz: [
		{ group: 'cfg-seed', pageId: 'cfg', q: 'q1q', a: 'q1a', b: 'q1b', ok: 0, why: 'q1why' },
		{ group: 'cfg-seed', pageId: 'seed', q: 'q2q', a: 'q2a', b: 'q2b', ok: 0, why: 'q2why' },
		{ group: 'one-step', pageId: 'denoise-one-step', q: 'q3q', a: 'q3a', b: 'q3b', ok: 0, why: 'q3why' },
		{ group: 'one-step', pageId: 'vae-decode', q: 'q4q', a: 'q4a', b: 'q4b', ok: 0, why: 'q4why' },
		{ group: 'contrast', pageId: 'image-tokens', q: 'q5q', a: 'q5a', b: 'q5b', ok: 0, why: 'q5why' },
		{ group: 'contrast', pageId: 'experiment-steps', q: 'q6q', a: 'q6a', b: 'q6b', ok: 0, why: 'q6why' },
		{
			group: 'transfer',
			pageId: 'same-step',
			stationId: 'step',
			q: 't1q',
			a: 't1a',
			b: 't1b',
			ok: 1,
			why: 't1why',
			transfer: true
		},
		{
			group: 'transfer',
			pageId: 'cfg',
			stationId: 'knobs',
			q: 't2q',
			a: 't2a',
			b: 't2b',
			ok: 1,
			why: 't2why',
			transfer: true
		}
	]
};

const MUSIC: WorkbenchMeta = {
	storageKey: 'te-lab-checks-music',
	labIds: ['lab1', 'lab2', 'lab3', 'lab4', 'lab5'],
	messagesKey: 'musicWb',
	glossaryKey: 'musicGlossary',
	labSelectors: {
		lab1: MUSIC_SELECTORS.temp,
		lab2: MUSIC_SELECTORS.sampling,
		lab3: MUSIC_SELECTORS.condition,
		lab4: MUSIC_SELECTORS.roll,
		lab5: MUSIC_SELECTORS.view
	},
	labVerify: {
		lab1: {
			kind: 'signal',
			signal: 'music-temp',
			seenZh: '已经看见：你改过意外程度，右边排行已经按新温度重算过。',
			seenEn: 'Seen: you changed temperature, and the ranking was recomputed.'
		},
		lab2: {
			kind: 'signal',
			signal: 'music-sampling',
			seenZh: '已经看见：你改过 Top-k 或 Top-p。',
			seenEn: 'Seen: you changed Top-k or Top-p.'
		},
		lab3: {
			kind: 'signal',
			signal: 'music-condition',
			seenZh: '已经看见：你改过调式或示例开头，条件已经变了。',
			seenEn: 'Seen: you changed the mode or the example prefix, so the condition moved.'
		},
		lab4: {
			kind: 'manual',
			reasonZh: '「主题重复时注意力看向哪」要你自己看卷帘和连线，我没法替你确认看懂了。你可以先生成下一个音，让现象出现，再自己标明。',
			reasonEn: 'I cannot confirm that you saw attention look back at a repeated motif. Generate a next note so the phenomenon is visible, then mark it yourself.'
		},
		lab5: {
			kind: 'signal',
			signal: 'music-view',
			seenZh: '已经看见：你切换过音符、音频 token 或扩散谱图。',
			seenEn: 'Seen: you switched between notes, audio tokens, or the spectrogram sketch.'
		}
	},
	glossIds: [
		'note',
		'wave',
		'token',
		'cond',
		'prob',
		'attn',
		'pos',
		'temp',
		'topk',
		'roll',
		'mg',
		'diff'
	],
	glossSel: {
		note: MUSIC_SELECTORS.roll,
		wave: MUSIC_SELECTORS.view,
		token: MUSIC_SELECTORS.tokens,
		cond: MUSIC_SELECTORS.condition,
		prob: MUSIC_SELECTORS.probs,
		attn: MUSIC_SELECTORS.roll,
		pos: MUSIC_SELECTORS.roll,
		temp: MUSIC_SELECTORS.temp,
		topk: MUSIC_SELECTORS.sampling,
		roll: MUSIC_SELECTORS.roll,
		mg: MUSIC_SELECTORS.tokens,
		diff: MUSIC_SELECTORS.diff
	},
	quizGroups: [
		{ id: 'sampling', titleKey: 'quizGroupQkv' },
		{ id: 'attention', titleKey: 'quizGroupMask' },
		{ id: 'represent', titleKey: 'quizGroupTemp' },
		{ id: 'transfer', titleKey: 'quizGroupTransfer' }
	],
	quiz: [
		{ group: 'sampling', pageId: 'temperature-sampling', q: 'q1q', a: 'q1a', b: 'q1b', ok: 0, why: 'q1why' },
		{ group: 'sampling', pageId: 'next-note', q: 'q2q', a: 'q2a', b: 'q2b', ok: 0, why: 'q2why' },
		{ group: 'attention', pageId: 'attention-motif', q: 'q3q', a: 'q3a', b: 'q3b', ok: 0, why: 'q3why' },
		{ group: 'attention', pageId: 'notes-vs-waveform', q: 'q4q', a: 'q4a', b: 'q4b', ok: 0, why: 'q4why' },
		{ group: 'represent', pageId: 'rhythm-position', q: 'q5q', a: 'q5a', b: 'q5b', ok: 0, why: 'q5why' },
		{ group: 'represent', pageId: 'myths', q: 'q6q', a: 'q6a', b: 'q6b', ok: 0, why: 'q6why' },
		{
			group: 'transfer',
			pageId: 'same-step',
			stationId: 'step',
			q: 't1q',
			a: 't1a',
			b: 't1b',
			ok: 1,
			why: 't1why',
			transfer: true
		},
		{
			group: 'transfer',
			pageId: 'sampling-not-weights',
			stationId: 'knobs',
			q: 't2q',
			a: 't2a',
			b: 't2b',
			ok: 1,
			why: 't2why',
			transfer: true
		}
	]
};

const FINETUNE: WorkbenchMeta = {
	storageKey: 'te-lab-checks-finetune',
	labIds: ['lab1', 'lab2', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8', 'lab9', 'lab10', 'lab11', 'lab12', 'lab13', 'lab14'],
	messagesKey: 'finetuneWb',
	glossaryKey: 'finetuneGlossary',
	labSelectors: {
		lab1: FT_SELECTORS.data,
		lab2: FT_SELECTORS.playground,
		lab3: FT_SELECTORS.short,
		lab4: FT_SELECTORS.compare,
		lab5: FT_SELECTORS.playground,
		lab6: FT_SELECTORS.overfit,
		lab7: FT_SELECTORS.oneKnob,
		lab8: FT_SELECTORS.temp,
		lab9: FT_SELECTORS.method,
		lab10: FT_SELECTORS.leak,
		lab11: FT_SELECTORS.sft,
		lab12: FT_SELECTORS.evalCard,
		lab13: FT_SELECTORS.evalCard,
		lab14: FT_SELECTORS.ckpt
	},
	labVerify: {
		lab1: {
			kind: 'manual',
			reasonZh: '看过语料、分词，需要你自己对照。我不会替你开训，也不会假装已经看完。',
			reasonEn: 'Looking at the corpus and tokens is something you confirm yourself. This will not start a run or pretend you already looked.'
		},
		lab2: {
			kind: 'manual',
			reasonZh: '对照续写要你自己看前后差别。我不会替你开训。',
			reasonEn: 'Comparing continuations is something you confirm yourself. This will not start a run.'
		},
		lab3: {
			kind: 'manual',
			reasonZh: '极短跑必须由你自己启动。我不会替你点开始，也不会把「只看见按钮」算作做过。',
			reasonEn: 'A short run has to be started by you. This will not click Start, and looking at the button is not enough.'
		},
		lab4: {
			kind: 'manual',
			reasonZh: '看前后对照要你自己完成。我不会自动开训。',
			reasonEn: 'The before/after contrast is yours to finish. This will not start a run.'
		},
		lab5: {
			kind: 'manual',
			reasonZh: '这一项需要你自己在对照里看。我不会假装替你勾选。',
			reasonEn: 'This one needs you to look at the contrast yourself. It will not be checked for you.'
		},
		lab6: {
			kind: 'manual',
			reasonZh: '过拟合要对照曲线来看，没法单靠一次点击诚实确认。',
			reasonEn: 'Overfitting has to be read from a curve. One click is not an honest check.'
		},
		lab7: {
			kind: 'manual',
			reasonZh: '一次只改一个旋钮，要你自己记录。我不会自动改参或开训。',
			reasonEn: 'Changing one knob at a time is yours to record. This will not change a knob or start a run.'
		},
		lab8: {
			kind: 'manual',
			reasonZh: '微调后温度仍起作用，要你自己对照抽样。我不会替你拧旋钮。',
			reasonEn: 'That temperature still works after fine-tuning is yours to check. This will not turn the knob for you.'
		},
		lab9: {
			kind: 'manual',
			reasonZh: '看改哪一块，要你走进「再深挖」或方法图。我不会自动打开对照条。',
			reasonEn: 'Seeing which piece changes means walking into the deeper labs or the method diagram. This will not auto-open the contrast bar.'
		},
		lab10: {
			kind: 'manual',
			reasonZh: '数据泄露要你自己对照拆分。没法替你诚实勾选。',
			reasonEn: 'Leakage is yours to check against the split. It cannot be honestly ticked for you.'
		},
		lab11: {
			kind: 'manual',
			reasonZh: '问答格式要你自己试。我不会替你填。',
			reasonEn: 'The Q/A format is yours to try. This will not fill it in for you.'
		},
		lab12: {
			kind: 'manual',
			reasonZh: '评测卡是课内对照，不是工业平台。看完请自己标明。',
			reasonEn: 'The eval card is an in-course contrast, not an industrial platform. Mark it yourself after you look.'
		},
		lab13: {
			kind: 'manual',
			reasonZh: '语料外提示要你自己看跑偏。没法替你确认。',
			reasonEn: 'Out-of-corpus prompts are yours to inspect. They cannot be confirmed for you.'
		},
		lab14: {
			kind: 'manual',
			reasonZh: '检查点要你自己选。我不会自动保存或开训。',
			reasonEn: 'Picking a checkpoint is yours. This will not auto-save or start a run.'
		}
	},
	glossIds: [
		'infer',
		'train',
		'loss',
		'ppl',
		'sample',
		'tokenize',
		'split',
		'full',
		'freeze',
		'lora',
		'lr',
		'batch',
		'early',
		'overfit',
		'adapter'
	],
	glossSel: {
		infer: FT_SELECTORS.stepPanel,
		train: FT_SELECTORS.start,
		loss: FT_SELECTORS.curve,
		ppl: FT_SELECTORS.curve,
		sample: FT_SELECTORS.data,
		tokenize: FT_SELECTORS.tokenize,
		split: FT_SELECTORS.split,
		full: FT_SELECTORS.method,
		freeze: FT_SELECTORS.freeze,
		lora: FT_SELECTORS.lora,
		lr: FT_SELECTORS.lr,
		batch: FT_SELECTORS.batch,
		early: FT_SELECTORS.early,
		overfit: FT_SELECTORS.curve,
		adapter: FT_SELECTORS.export
	},
	quizGroups: [
		{ id: 'infer', titleKey: 'quizGroupQkv' },
		{ id: 'method', titleKey: 'quizGroupMask' },
		{ id: 'after', titleKey: 'quizGroupTemp' },
		{ id: 'transfer', titleKey: 'quizGroupTransfer' }
	],
	quiz: [
		{ group: 'infer', pageId: 'infer-vs-train', q: 'q1q', a: 'q1a', b: 'q1b', ok: 0, why: 'q1why' },
		{ group: 'infer', pageId: 'still-next-token', q: 'q2q', a: 'q2a', b: 'q2b', ok: 0, why: 'q2why' },
		{ group: 'method', pageId: 'split-leakage', q: 'q3q', a: 'q3a', b: 'q3b', ok: 0, why: 'q3why' },
		{ group: 'method', pageId: 'lora', q: 'q4q', a: 'q4a', b: 'q4b', ok: 0, why: 'q4why' },
		{ group: 'after', pageId: 'overfit-forget', q: 'q5q', a: 'q5a', b: 'q5b', ok: 0, why: 'q5why' },
		{ group: 'after', pageId: 'temp-after-ft', q: 'q6q', a: 'q6a', b: 'q6b', ok: 0, why: 'q6why' },
		{ group: 'infer', pageId: 'infer-vs-train', q: 'q7q', a: 'q7a', b: 'q7b', ok: 0, why: 'q7why' },
		{ group: 'after', pageId: 'evaluate', q: 'q8q', a: 'q8a', b: 'q8b', ok: 0, why: 'q8why' },
		{
			group: 'transfer',
			pageId: 'still-next-token',
			stationId: 'map',
			q: 't1q',
			a: 't1a',
			b: 't1b',
			ok: 1,
			why: 't1why',
			transfer: true
		},
		{
			group: 'transfer',
			pageId: 'temp-after-ft',
			stationId: 'compare',
			q: 't2q',
			a: 't2a',
			b: 't2b',
			ok: 1,
			why: 't2why',
			transfer: true
		}
	]
};

export function getWorkbench(course: CourseId): WorkbenchMeta {
	if (course === 'image') return IMAGE;
	if (course === 'music') return MUSIC;
	if (course === 'finetune') return FINETUNE;
	return TEXT;
}
