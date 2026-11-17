import { PREFERRED_LORA_RUN } from '~/courses/loraContrast';

export type PreferencePair = {
	id: string;
	kind: 'note' | 'qa' | 'poem';
	promptZh: string;
	promptEn: string;
	chosenZh: string;
	chosenEn: string;
	rejectedZh: string;
	rejectedEn: string;
	whyZh: string;
	whyEn: string;
};

/** Short, safe preference pairs: notes / verse / technical snippets only. No harassment copy. */
export const DPO_PAIRS: PreferencePair[] = [
	{
		id: 'note-residual',
		kind: 'note',
		promptZh: '今天把这一章记下：',
		promptEn: 'I finished the chapter today, and I wrote down:',
		chosenZh: '残差连接把前面的信号加到后面，让训练更容易走通。',
		chosenEn: 'Residual connections add the earlier signal later, which makes training easier to get through.',
		rejectedZh: '从前有一座山，山里有座庙，庙里的人正在讲一个很长的故事。',
		rejectedEn: 'Once upon a time, in a mountain temple, someone was telling a very long story.',
		whyZh: '左边更像笔记里要记下的那一句；右边滑到了故事口吻。偏好比较问的是「更喜欢哪一句」，不是下一个词对错。',
		whyEn: 'The chosen line stays in the note-taking voice; the rejected line slips into a story. Preference comparison asks which completion we prefer, not which next token is “correct.”'
	},
	{
		id: 'qa-temp',
		kind: 'qa',
		promptZh: '问：温度这个旋钮改的是什么？\n答：',
		promptEn: 'Q: What does the temperature knob change?\nA:',
		chosenZh: '只改抽样时的意外程度，不改模型权重。',
		chosenEn: 'It only changes how surprising the sample can be. It does not change the weights.',
		rejectedZh: '把学习率调大，模型就会一下子变聪明。',
		rejectedEn: 'Turning the learning rate up will suddenly make the model smarter.',
		whyZh: '左边按问答格式回答了旋钮本身；右边把温度和学习率混在一起。怎么训就怎么问，也要看哪一句更该留下。',
		whyEn: 'The chosen answer talks about the knob itself in the Q/A format; the rejected one confuses temperature with learning rate.'
	},
	{
		id: 'poem-window',
		kind: 'poem',
		promptZh: '写两行短诗，题目是窗边的灯光：',
		promptEn: 'Write two short lines titled “The lamp by the window”:',
		chosenZh: '窗玻璃上停着一小块暖黄，\n把桌面的影子慢慢推开。',
		chosenEn: 'A small warm yellow rests on the glass,\nand slowly pushes the desk’s shadow aside.',
		rejectedZh: '今天把这一章记下：残差连接负责把前面的信号加到后面。',
		rejectedEn: 'I finished the chapter today, and I wrote down: residual connections add the earlier signal later.',
		whyZh: '这是换一类提示：我们更想留下像诗的两行，而不是不管题目都滑回笔记口吻。',
		whyEn: 'This is a different genre: we would rather keep two verse-like lines than let every prompt drift back into the notes.'
	}
];

export type DpoSketchPoint = {
	step: number;
	loss: number;
	margin: number;
};

/** Precomputed sketch of a tiny DPO run: loss falls, preferred margin rises. Not a live training loop. */
export const DPO_SKETCH: DpoSketchPoint[] = [
	{ step: 0, loss: 0.693, margin: 0.08 },
	{ step: 1, loss: 0.57, margin: 0.22 },
	{ step: 2, loss: 0.46, margin: 0.41 },
	{ step: 3, loss: 0.38, margin: 0.58 },
	{ step: 4, loss: 0.31, margin: 0.74 }
];

export type QloraSize = {
	id: string;
	name: string;
	paramsM: number;
	fp16Gb: number;
	int4Gb: number;
	loraMb: number;
	needQloraOn8gb: boolean;
	noteZh: string;
	noteEn: string;
};

export const QLORA_SIZES: QloraSize[] = [
	{
		id: 'gpt2',
		name: 'GPT-2 small (124M)',
		paramsM: 124,
		fp16Gb: 0.25,
		int4Gb: 0.06,
		loraMb: 8,
		needQloraOn8gb: false,
		noteZh: '本课用的就是它。8GB 笔记本上全精度 LoRA 就放得下，不必上 QLoRA。',
		noteEn: 'This is the model in this course. Full-precision LoRA already fits on an 8GB laptop, so QLoRA is not needed here.'
	},
	{
		id: 'gpt2-medium',
		name: 'GPT-2 medium (355M)',
		paramsM: 355,
		fp16Gb: 0.71,
		int4Gb: 0.18,
		loraMb: 16,
		needQloraOn8gb: false,
		noteZh: '仍然不大。量化能再省一点显存，但不是这台实验室过不去的门槛。',
		noteEn: 'Still small. Quantization saves a little memory, but it is not the bottleneck in this lab.'
	},
	{
		id: 'llama-7b',
		name: '7B class',
		paramsM: 7000,
		fp16Gb: 14,
		int4Gb: 3.5,
		loraMb: 80,
		needQloraOn8gb: true,
		noteZh: '全精度基座大约 14GB，这台 8GB 笔记本装不下；把基座压到约 4bit 后，才有机会只训练旁边那一小块。',
		noteEn: 'A full-precision 7B base is about 14GB and will not fit in 8GB. After compressing the base to about 4 bits, there is room to train only the small add-on.'
	},
	{
		id: 'llama-13b',
		name: '13B class',
		paramsM: 13000,
		fp16Gb: 26,
		int4Gb: 6.5,
		loraMb: 120,
		needQloraOn8gb: true,
		noteZh: '未量化时远超 8GB；4bit 基座加上适配器和激活值会很紧，往往还要再减批次或序列长度。',
		noteEn: 'Unquantized, this is far beyond 8GB. A 4-bit base plus the adapter and activations is tight, and you often still shrink the batch or sequence length.'
	}
];

export const QLORA_VRAM_BUDGET_GB = 8;

export type MapStop = {
	id: 'course' | 'data' | 'scale' | 'align' | 'quant';
	zh: string;
	en: string;
	seenZh: string;
	seenEn: string;
	gapZh: string;
	gapEn: string;
	hash?: string;
};

export const MAP_STOPS: MapStop[] = [
	{
		id: 'course',
		zh: '本课：GPT-2 + LoRA',
		en: 'This course: GPT-2 + LoRA',
		seenZh: '已经看见：冻结的小基座、低秩增量、极短跑、损失和桑基图对照。改的是旁边一小块，不是整个模型。',
		seenEn: 'You have already seen a frozen small base, a low-rank add-on, a short run, loss, and a Sankey contrast. What changes is a small piece beside the base, not the whole model.',
		gapZh: '真实系统不会只停在这一句短文本和一次短跑上。',
		gapEn: 'A real system does not stop at one short sentence and one short run.'
	},
	{
		id: 'data',
		zh: '更长、更多、更干净的数据',
		en: 'Longer, larger, cleaner data',
		seenZh: '本课已经看见分词、语料内外提示，以及格式不一致时续写会跑偏。',
		seenEn: 'This course already showed tokenization, in- and out-of-corpus prompts, and how a format mismatch makes the continuation drift.',
		gapZh: '真实训练还要处理更长上下文、去重、配比和持续的评测集，不是只靠几条笔记。',
		gapEn: 'Real training still needs longer context, deduping, mixture weights, and a standing eval set — not just a handful of notes.',
		hash: '#ft-eval'
	},
	{
		id: 'scale',
		zh: '更大的基座',
		en: 'A larger base',
		seenZh: '本课用 1.24 亿参数的 GPT-2，在 8GB 笔记本上就能短跑。',
		seenEn: 'This course uses 124M-parameter GPT-2, which can do a short run on an 8GB laptop.',
		gapZh: '更大的模型吃显存、吃数据，也更需要检查点和评测，不是换一个按钮就变大。',
		gapEn: 'Larger models cost memory and data, and they need checkpoints and eval even more. There is no single button that just “makes it bigger.”',
		hash: '#ft-qlora'
	},
	{
		id: 'align',
		zh: '偏好对齐（DPO / RLHF）',
		en: 'Preference alignment (DPO / RLHF)',
		seenZh: '本课的监督微调是「像这样写」。评测卡已经能对比更喜欢的续写和跑偏的续写。',
		seenEn: 'Supervised fine-tuning in this course means “write like this.” The eval card already compares a preferred continuation with one that drifted.',
		gapZh: '真实对齐要用许多偏好对，常常还有奖励模型或 DPO 训练循环。本实验室只做最小对照，不跑完整 RLHF。',
		gapEn: 'Real alignment uses many preference pairs, and often a reward model or a DPO loop. This lab only does a minimal contrast, not full RLHF.',
		hash: '#ft-dpo'
	},
	{
		id: 'quant',
		zh: '量化后再适配（QLoRA）',
		en: 'Adapt after quantization (QLoRA)',
		seenZh: '本课已经看见 LoRA 只训练低秩增量。同一想法在大模型上往往要先把基座量化。',
		seenEn: 'This course already showed that LoRA trains only a low-rank increment. On larger models, the same idea often starts by quantizing the base.',
		gapZh: '本课没有在课内用 4bit 训练大模型。QLoRA 是为了让更大的基座进得了有限显存。',
		gapEn: 'This course does not train a large 4-bit model in class. QLoRA exists so a larger base can fit into limited memory.',
		hash: '#ft-qlora'
	}
];

export const LATER_RUN_ID = PREFERRED_LORA_RUN;

export const SAFETY_ZH =
	'只用自己的数据做学习实验。课内示例只包含笔记、短诗和技术小段子，不要用来骚扰别人。';
export const SAFETY_EN =
	'Use your own data for study. The in-course examples are only notes, short verse, and technical snippets. Do not use them to bother other people.';
