import { highlightElements, removeHighlightFromElements } from '~/utils/textbook';
import type { TextbookPage } from '~/utils/textbookPages';
import { prepareFinetuneFlash } from '~/courses/finetune/store';

const sels = (...s: string[]) => s.filter(Boolean);

export const finetunePages: TextbookPage[] = [
	{
		id: 'infer-vs-train',
		title: '推理与训练',
		content: `<p><strong>这一步在干什么</strong>：先把两件事分开。文字课的解说器只会<strong>推理</strong>：权重冻结，每次抽下一个词。本课要做的是<strong>训练</strong>：用你准备的文本去改一部分（或全部）权重，让续写的口吻跟着语料走。底部讲解槽的主按钮「推进一步」只带你看清训练的一步，不会开训。</p><p><strong>为什么需要它</strong>：如果把推理和训练混在一起，就容易以为调温度等于「教会了模型」，或以为点生成就会改权重。先分清，后面的实验才有意义。</p><p><strong>怎么算</strong>：推理：固定参数 θ，计算 P(下一个词 | 上文)。训练：看模型对「真正下一个词」给的概率低不低，算出损失，再按梯度更新允许改动的参数。温度和 top-k 出现在推理抽样里，不进入这条更新公式。</p><p><strong>在界面上看哪里</strong>：看底部讲解槽的「推进一步」和中间的步骤说明。对照屏也在讲这件事。开训、暂停、续写在工作室里，不占主按钮。训练器没启动时，你仍可翻教材、做自测。</p><p><strong>常见误解</strong>：「把温度调低，模型就学会更稳重地说话了」是错的。温度只改抽样，权重原地不动。反过来，「微调时不必再管温度」也不对，第 19 页会回到这件事。</p><p><strong>进阶</strong>：本课默认基座是 GPT-2 small，在本机 Python 服务里训练，不把大模型塞进浏览器，也不把 LoRA 装回文字课的桑基图。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-step-btn');
			if (sels('.ft-step-btn', '.ft-step-panel', '.ft-contrast-lead').length) highlightElements(sels('.ft-step-btn', '.ft-step-panel', '.ft-contrast-lead'));
		},
		out: () => {
			if (sels('.ft-step-btn', '.ft-step-panel', '.ft-contrast-lead').length) removeHighlightFromElements(sels('.ft-step-btn', '.ft-step-panel', '.ft-contrast-lead'));
		},
		complete() {}
	},
	{
		id: 'three-ways',
		title: '三种调法',
		content: `<p><strong>这一步在干什么</strong>：让模型写出某种口吻，常见有三条路：<strong>预训练</strong>（从大量文本学通用下一个词）、<strong>微调</strong>（在你的小语料上继续改权重，本课主路）、<strong>提示词</strong>（不改权重，只在推理时把说明写进上文）。</p><p><strong>为什么需要它</strong>：只知道提示词，会高估「一句话就能永久改变模型」。只知道预训练，又会觉得必须从头训练。把三条路放在一起，你才知道微调处在哪一层。</p><p><strong>怎么算</strong>：预训练：大规模语料 + 下一个词损失，得到基座。微调：在基座上继续优化，可全量、冻结或 LoRA。提示词：θ 不变，只改输入。三条路可以组合，但职责不同。</p><p><strong>在界面上看哪里</strong>：看工作室「方法」里的 LoRA / 冻结层 / 全量微调。先选推荐配方里的 LoRA。提示词对照在「对照游乐场」：同一套权重，只改提示，续写也会变。</p><p><strong>常见误解</strong>：不要把「写了一段系统提示」说成已经微调。也不要认为微调会从头再预训练一遍。本课的基座是现成的 GPT-2，我们只在上面继续改。</p><p><strong>进阶</strong>：指令微调、偏好对齐是更后面的分支。第一期先把「改权重让续写变口吻」做扎实。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-method');
			if (sels('.ft-method', '.ft-recommend').length) highlightElements(sels('.ft-method', '.ft-recommend'));
		},
		out: () => {
			if (sels('.ft-method', '.ft-recommend').length) removeHighlightFromElements(sels('.ft-method', '.ft-recommend'));
		},
		complete() {}
	},
	{
		id: 'still-next-token',
		title: '目标还是预测下一个词',
		content: `<p><strong>这一步在干什么</strong>：微调的目标，和文字课仍是同一句：根据已经写出的 token，预测下一个 token。变的不是目标，而是「用哪一份文本、哪些参数被允许更新」。</p><p><strong>为什么需要它</strong>：如果以为微调在优化「好不好听」「有没有感情」，后面就会把损失曲线读成评分。先守住目标，曲线才读得懂。</p><p><strong>怎么算</strong>：对一条长度为 T 的样本，把位置 1…T-1 当作上文，位置 2…T 当作标签。总损失是各位置交叉熵的平均（可再按批次平均）。模型并没有另一个「口吻分数」。</p><p><strong>在界面上看哪里</strong>：点「推进一步」，走到「分词并标出下一个词」和「算出交叉熵损失」。对照文字课右边的概率表：真正那个词如果排得很后，损失就大。</p><p><strong>常见误解</strong>：「微调是在教模型做人 / 教它价值观」过满了。它首先是在你给的文本上继续做因果语言模型。口吻变化是这个目标的结果，不是另一个损失函数。</p><p><strong>进阶</strong>：有些系统会加辅助损失。第一期只用标准的因果 LM 交叉熵，好对照、好讲。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-step-panel');
			if (sels('.ft-step-panel', '.ft-tokenize').length) highlightElements(sels('.ft-step-panel', '.ft-tokenize'));
		},
		out: () => {
			if (sels('.ft-step-panel', '.ft-tokenize').length) removeHighlightFromElements(sels('.ft-step-panel', '.ft-tokenize'));
		},
		complete() {}
	},
	{
		id: 'cross-entropy',
		title: '损失：交叉熵与概率表',
		content: `<p><strong>这一步在干什么</strong>：交叉熵衡量：对于真正的下一个词，模型给了它多少概率。概率低，损失高。训练就是在允许改的参数上，让这个损失慢慢变小。</p><p><strong>为什么需要它</strong>：没有一个可计算的损失，开训就只是「让风扇响」。有了交叉熵，才能和文字课右边那张概率表对上。</p><p><strong>怎么算</strong>：若真正的词是 y，模型给出概率 p(y)，这一位置的损失是 -log p(y)。p 越接近 1，损失越接近 0。一批里把各位置平均，就得到这条的训练损失。</p><p><strong>在界面上看哪里</strong>：看「推进一步」里的损失说明，以及训练监控里的训练损失曲线。不必先会手算，但要能指着曲线说「这一步损失在降还是在抖」。</p><p><strong>常见误解</strong>：损失不是分数，也不是「内容质量分」。损失变小，只说明模型对训练文本里的下一个词更有把握，不自动等于写得更好、更安全、更有创意。</p><p><strong>进阶</strong>：记录时请写下同一配方下的损失，不要只凭感觉说「这轮更聪明」。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-step-panel');
			if (sels('.ft-step-panel', '.ft-curve').length) highlightElements(sels('.ft-step-panel', '.ft-curve'));
		},
		out: () => {
			if (sels('.ft-step-panel', '.ft-curve').length) removeHighlightFromElements(sels('.ft-step-panel', '.ft-curve'));
		},
		complete() {}
	},
	{
		id: 'perplexity',
		title: '困惑度',
		content: `<p><strong>这一步在干什么</strong>：困惑度（perplexity）是从损失派生出来的另一个读数，大致表示「模型对下一个词有多犹豫」。损失越低，困惑度通常也越低。</p><p><strong>为什么需要它</strong>：它让不同长度、不同日志里的数字更好比较。但在本课里，它仍然只反映「对这份文本的下一个词有多确定」，不是作文分。</p><p><strong>怎么算</strong>：常用关系是 PPL = exp(平均交叉熵)（以 e 为底，取决于你怎么记损失）。平均交叉熵是 2.3 左右时，PPL 大约是 10，意思是「有效地还在大约十个词里犹豫」。</p><p><strong>在界面上看哪里</strong>：工作室曲线主显示损失。把困惑度记在心里即可：看见损失下降，可以想「犹豫程度也在降」。不必单独再做一个积分榜。</p><p><strong>常见误解</strong>：不要把低困惑度等于「已经会写诗」或「已经懂技术」。它完全可能来自背诵训练样本。所以后面必须对照语料外提示。</p><p><strong>进阶</strong>：比较两次跑时，用同一份验证集上的损失或困惑度，比用训练损失更公平。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-curve');
			if (sels('.ft-curve').length) highlightElements(sels('.ft-curve'));
		},
		out: () => {
			if (sels('.ft-curve').length) removeHighlightFromElements(sels('.ft-curve'));
		},
		complete() {}
	},
	{
		id: 'dataset',
		title: '数据：一条样本、来源与清理',
		content: `<p><strong>这一步在干什么</strong>：一条样本就是一段你希望模型学着继续写的完整文本。语料来自你粘贴、上传，或选择示例口吻包（笔记、短诗、技术小段子）。请只用自己的学习材料。</p><p><strong>为什么需要它</strong>：权重会跟着喂进去的文本走。数据脏、重复、或含有你不希望被模仿的句子，后面的续写也会往那边靠。先把数据台当成第一块工作台。</p><p><strong>怎么算</strong>：建议准备 80–300 条量级，便于拆出验证集。去掉明显重复、空行和与口吻无关的句子。本课示例包都是原创练习文本，不是名篇摘抄。</p><p><strong>在界面上看哪里</strong>：打开「数据台」：可选口吻包，可粘贴，可上传 .txt / .jsonl，可逐条编辑删除。界面会提醒：只做自己的学习实验，不要拿去骚扰别人。</p><p><strong>常见误解</strong>：「数据越多就越好，不必看内容」靠不住。一百条干净、一致的口吻，往往比一千条混杂文本更适合这一课的对照。</p><p><strong>进阶</strong>：必做实验第一项就是导入或编写语料并拆出验证集。先把这件事做完，再开训。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-data');
			if (sels('.ft-data', '.ft-pack', '.ft-upload').length) highlightElements(sels('.ft-data', '.ft-pack', '.ft-upload'));
		},
		out: () => {
			if (sels('.ft-data', '.ft-pack', '.ft-upload').length) removeHighlightFromElements(sels('.ft-data', '.ft-pack', '.ft-upload'));
		},
		complete() {}
	},
	{
		id: 'tokenize',
		title: '分词、特殊符号、截断与拼接',
		content: `<p><strong>这一步在干什么</strong>：模型不直接吃汉字或单词，先经过分词器变成 token。太长的样本会按序列长度截断；有时也会把短样本拼在一起提高效率。特殊符号用来标记开头或填充。</p><p><strong>为什么需要它</strong>：只看「条数」会误判工作量。同样 100 条，有的只有一句话，有的已经超过 512 个 token。预览分词，才能知道截断会不会把结尾切掉。</p><p><strong>怎么算</strong>：GPT-2 一类分词器按子词切。序列长度 512 表示一条里最多保留 512 个 token。超过就截断（本课默认从开头留下）。拼接时要小心不要把两条中间的语义硬粘成一句。</p><p><strong>在界面上看哪里</strong>：在数据台点「预览分词」。训练器连上后，会给出更接近 GPT-2 的切分；没连上时，先显示大致估计，并提示如何启动服务。序列长度旋钮在「方法与参数」。</p><p><strong>常见误解</strong>：不要以为「一条样本 = 一个 token」，也不要以为截断只是漏几个标点。切掉的往往是结尾，可能正是你想让它学的收束句。</p><p><strong>进阶</strong>：实验时先用 512。只有当你确认显存还宽、并且样本确实更长，再试 768 或 1024。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-tokenize');
			if (sels('.ft-tokenize', '.ft-seq').length) highlightElements(sels('.ft-tokenize', '.ft-seq'));
		},
		out: () => {
			if (sels('.ft-tokenize', '.ft-seq').length) removeHighlightFromElements(sels('.ft-tokenize', '.ft-seq'));
		},
		complete() {}
	},
	{
		id: 'split-leakage',
		title: '拆分与数据泄露',
		content: `<p><strong>这一步在干什么</strong>：把语料拆成训练集和验证集。验证集不参加更新，只用来看「换一批同类文本，损失还降不降」。如果验证样本漏进训练，这个读数就假了。</p><p><strong>为什么需要它</strong>：没有验证集，你只能看见训练损失一直降，很难发现过拟合或背诵。推荐比例是大约 9:1，可自己改，但不要改成 0。</p><p><strong>怎么算</strong>：先打乱（用种子，便于重现），再按比例切。同一条文本不要同时出现在两边。改配方重跑时，尽量沿用同一次拆分，才谈得上对照。</p><p><strong>在界面上看哪里</strong>：数据台里的「训练/验证比例」就是这件事。改比例后看两边条数。种子在配方里，默认 42。</p><p><strong>常见误解</strong>：「先把全部数据训练完，再随便抽几条当验证」是泄露。验证必须在开训前单独留下。</p><p><strong>进阶</strong>：必做实验第一项要求你真的拆出验证集。后面读曲线时会用到它。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-split');
			if (sels('.ft-split', '.ft-seed').length) highlightElements(sels('.ft-split', '.ft-seed'));
		},
		out: () => {
			if (sels('.ft-split', '.ft-seed').length) removeHighlightFromElements(sels('.ft-split', '.ft-seed'));
		},
		complete() {}
	},
	{
		id: 'full-ft',
		title: '全量微调',
		content: `<p><strong>这一步在干什么</strong>：全量微调让基座里几乎所有权重都参加更新。它最灵活，也最吃显存和时间，还更容易把基座原来的能力冲掉。</p><p><strong>为什么需要它</strong>：需要知道「上限」在哪：如果 LoRA 和冻结都试过，仍觉得容量不够，才值得拿全量来对照。第一期不要一上来就全量猛训很多轮。</p><p><strong>怎么算</strong>：参数量约等于整个 GPT-2。学习率通常比 LoRA 更小，推荐从 5e-5 起。批次、序列长度要为显存让路。</p><p><strong>在界面上看哪里</strong>：在「方法」里改成「全量微调」。推荐配方会把学习率改成 5e-5。看显存读数，再决定要不要减小批次或序列长度。</p><p><strong>常见误解</strong>：全量不是「效果一定最好」。数据少时，它更容易过拟合，也更可能出现灾难性遗忘。</p><p><strong>进阶</strong>：实验第 9 项：把 LoRA、冻结、全量各跑一轮短对照，比较速度、显存和续写，不要只凭印象。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-method');
			if (sels('.ft-method').length) highlightElements(sels('.ft-method'));
		},
		out: () => {
			if (sels('.ft-method').length) removeHighlightFromElements(sels('.ft-method'));
		},
		complete() {}
	},
	{
		id: 'freeze-layers',
		title: '冻结层',
		content: `<p><strong>这一步在干什么</strong>：冻结是另一种省资源的办法：大部分层不更新，只解冻最后 1–4 层，或只训练输出层。被冻结的权重保持基座原样。</p><p><strong>为什么需要它</strong>：它帮助你回答：要改变续写口吻，是不是必须动所有层？也给消费级显存一条更稳的路。</p><p><strong>怎么算</strong>：前几层常常装着较通用的特征，后几层更靠近「下一个词」的决策。只训输出层，动得最少；解冻最后几层，容量大一点。</p><p><strong>在界面上看哪里</strong>：在「方法」里选「冻结部分层」，再设解冻层数或勾选「只训输出层」。开训后看可训练参数量和显存，会和 LoRA、全量不同。</p><p><strong>常见误解</strong>：「冻结了就等于没微调」不对，后层或输出层仍会变。但也不要指望只训输出层就能学会很复杂的新结构。</p><p><strong>进阶</strong>：和 LoRA 对照时，请固定数据、种子和训练轮数，只改方法。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-method');
			if (sels('.ft-method', '.ft-freeze').length) highlightElements(sels('.ft-method', '.ft-freeze'));
		},
		out: () => {
			if (sels('.ft-method', '.ft-freeze').length) removeHighlightFromElements(sels('.ft-method', '.ft-freeze'));
		},
		complete() {}
	},
	{
		id: 'lora',
		title: 'LoRA：r、alpha 与作用模块',
		content: `<p><strong>这一步在干什么</strong>：LoRA 不直接改原权重矩阵 W，而是在旁边加两块更小的矩阵，用它们的乘积作为更新。r 是秩（小矩阵有多宽），alpha 是缩放，作用模块决定加在哪些层。本课推荐配方就是 LoRA。</p><p><strong>为什么需要它</strong>：它通常比全量更省显存，又比「只训输出层」更有表达力，适合在消费级显卡上做口吻实验。</p><p><strong>怎么算</strong>：更新可以想成 W + (alpha/r) × A × B。r 默认 16（4–64）；alpha 默认 32（8–128）；dropout 默认 0.05。默认作用在注意力投影层，可再勾选 MLP。</p><p><strong>在界面上看哪里</strong>：打开「方法与参数」里的 LoRA 区块。先用推荐值。点「全部旋钮」才能自由改 r、alpha、模块。恢复推荐不会丢掉你已经编辑的语料。</p><p><strong>常见误解</strong>：r 越大不是永远越好。数据少时，更大的 r 也可能更快背诵。不要把 LoRA 说成「不改模型」——它改的是附加参数，推理时仍然影响输出。</p><p><strong>进阶</strong>：实验第 7 项：只改学习率或只改 r，再跑一轮短对照。一次只动一个旋钮。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-lora');
			if (sels('.ft-lora', '.ft-recommend', '.ft-advanced').length) highlightElements(sels('.ft-lora', '.ft-recommend', '.ft-advanced'));
		},
		out: () => {
			if (sels('.ft-lora', '.ft-recommend', '.ft-advanced').length) removeHighlightFromElements(sels('.ft-lora', '.ft-recommend', '.ft-advanced'));
		},
		complete() {}
	},
	{
		id: 'lr-warmup',
		title: '学习率、预热与调度器',
		content: `<p><strong>这一步在干什么</strong>：学习率是每一步更新的步长。预热让它先从小爬到设定值，调度器再决定后面是余弦衰减、保持恒定，还是线性降下来。权重衰减会略微把参数往 0 拉，减轻过拟合。</p><p><strong>为什么需要它</strong>：步长不合适时，曲线会抖、会炸，或几乎不动。这是最常被随手乱拧、又最需要单独对照的旋钮。</p><p><strong>怎么算</strong>：LoRA 推荐 2e-4，全量推荐 5e-5，范围大约 1e-5 到 5e-4。预热默认 50 步（0–200）。调度器默认余弦。权重衰减默认 0.01（0–0.1）。</p><p><strong>在界面上看哪里</strong>：看「学习率 / 预热 / 调度器」一组控件。开训后，曲线旁边也会标出当前学习率。先用推荐值跑通，再只改学习率做对照。</p><p><strong>常见误解</strong>：学习率不是「创造力」，也不是温度。把它拧到最大，常常只是得到一条难看的损失曲线，不是更好的诗。</p><p><strong>进阶</strong>：自由模式可以改这些旋钮，但请先保存推荐配方的那一次跑，作为对照基准。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-lr');
			if (sels('.ft-lr', '.ft-scheduler').length) highlightElements(sels('.ft-lr', '.ft-scheduler'));
		},
		out: () => {
			if (sels('.ft-lr', '.ft-scheduler').length) removeHighlightFromElements(sels('.ft-lr', '.ft-scheduler'));
		},
		complete() {}
	},
	{
		id: 'batch-vram',
		title: '批次、梯度累积、序列长度与显存',
		content: `<p><strong>这一步在干什么</strong>：批次是一次同时看几条样本。梯度累积把多次小批次的梯度加起来再更新，近似更大的批次。序列长度决定一条文本能留多长。这三项都会直接打在显存上。</p><p><strong>为什么需要它</strong>：在消费级显卡上，不考虑显存的配方写着好看，跑一步就可能失败。先用推荐：批次 2、累积 4、序列长度 512。</p><p><strong>怎么算</strong>：有效批次 ≈ 批次 × 累积。本课单卡。序列从 512 加到 1024，显存往往比把批次从 2 加到 4 更敏感。混合精度也能省一点。</p><p><strong>在界面上看哪里</strong>：看「批次 / 累积 / 序列长度」和监控里的显存读数。如果开训立即报显存不足，先减小序列长度或批次，而不是立刻换全量微调。</p><p><strong>常见误解</strong>：「批次越大一定越准」不一定。显存不够时，用累积去近似即可。也不要在显存已经很紧时把三条旋钮一起拧到头。</p><p><strong>进阶</strong>：若显存是 8GB 而不是 12GB，更要先用推荐配方。GPT-2 medium 请从更小的批次试起。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-batch');
			if (sels('.ft-batch', '.ft-seq', '.ft-vram').length) highlightElements(sels('.ft-batch', '.ft-seq', '.ft-vram'));
		},
		out: () => {
			if (sels('.ft-batch', '.ft-seq', '.ft-vram').length) removeHighlightFromElements(sels('.ft-batch', '.ft-seq', '.ft-vram'));
		},
		complete() {}
	},
	{
		id: 'epoch-earlystop',
		title: 'epoch、步数与早停',
		content: `<p><strong>这一步在干什么</strong>：一个 epoch 表示把训练集完整过一遍。总更新步数还取决于批次和累积。早停是：验证损失连续若干次评估都没有再下降，就停下来，避免后面只是在背诵。</p><p><strong>为什么需要它</strong>：只看「我训了几轮」不够。有的数据一轮已经开始过拟合，有的三轮才站稳。早停让你少做无用的后面几轮。</p><p><strong>怎么算</strong>：推荐 3 个 epoch（1–10）。默认验证损失连续 2 次不再下降就早停，可关闭。你也可以手动停止。</p><p><strong>在界面上看哪里</strong>：看「epoch」和「早停」控件，以及曲线上验证损失的折点。监控面板可以暂停、停止，或从检查点恢复。</p><p><strong>常见误解</strong>：「多训几轮一定更好」常常相反。实验第 6 项就是故意多训，观察验证损失是否回头向上。</p><p><strong>进阶</strong>：早停不是失败，它往往说明「再往下对验证集没有好处」。把停止时的检查点留下即可。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-early');
			if (sels('.ft-early', '.ft-start', '.ft-pause').length) highlightElements(sels('.ft-early', '.ft-start', '.ft-pause'));
		},
		out: () => {
			if (sels('.ft-early', '.ft-start', '.ft-pause').length) removeHighlightFromElements(sels('.ft-early', '.ft-start', '.ft-pause'));
		},
		complete() {}
	},
	{
		id: 'amp-clip-seed',
		title: '混合精度、梯度裁剪、种子与 dropout',
		content: `<p><strong>这一步在干什么</strong>：混合精度（fp16）用更低位数计算，省显存、常常更快；fp32 更稳、更费。梯度裁剪防止一步更新过大。种子让数据拆分和初始化可重现。LoRA dropout 在训练时随机丢掉一部分适配器信号，减轻死记。</p><p><strong>为什么需要它</strong>：这组旋钮不改变「下一个词」目标，但决定跑得稳不稳、能不能复现。对照实验必须能复现，种子就不是摆设。</p><p><strong>怎么算</strong>：推荐 fp16、裁剪阈值 1.0（可关）、种子 42、LoRA dropout 0.05（0–0.2）。若出现 NaN 或异常损失，再改回 fp32 试一次。</p><p><strong>在界面上看哪里</strong>：在「方法与参数」后半段。默认收在推荐配方里；打开「全部旋钮」才能逐项改。监控日志会写精度和种子。</p><p><strong>常见误解</strong>：种子不是「运气编号」，它是为了对照。关掉裁剪也不等于「训练更自由」，有时只是更容易一步走炸。</p><p><strong>进阶</strong>：同一份数据、同一个种子、只改一个旋钮，才是第 21 页说的自由度实验。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-amp');
			if (sels('.ft-amp', '.ft-seed', '.ft-advanced').length) highlightElements(sels('.ft-amp', '.ft-seed', '.ft-advanced'));
		},
		out: () => {
			if (sels('.ft-amp', '.ft-seed', '.ft-advanced').length) removeHighlightFromElements(sels('.ft-amp', '.ft-seed', '.ft-advanced'));
		},
		complete() {}
	},
	{
		id: 'read-curves',
		title: '看曲线',
		content: `<p><strong>这一步在干什么</strong>：损失曲线要有坐标，也要有人话标注。横轴是步数，纵轴是损失。训练损失用手头数据算，验证损失用留下来检查的数据算。你要会看：在降、在抖、在分叉，还是已经走平。</p><p><strong>为什么需要它</strong>：没有曲线，开训就像盲跑。有了曲线，才能决定暂停、早停，或留下验证最好的那一次。</p><p><strong>怎么算</strong>：两条线一起降，通常比较健康。训练越来越好、验证开始变差，曲线上会标出「验证开始抬头」——这常常是过拟合。训练损失再低也不一定更好。</p><p><strong>在界面上看哪里</strong>：走完「看见差别」后，进度轨的「再深挖」会把这条曲线放在主线上，不必自己翻训练监控的折叠项。也可以先看预置示意（不开训）。需要时再打开本页。</p><p><strong>常见误解</strong>：不要只截一张「最后损失很小」的图。最后很小可能来自背诵，而且最后一步往往已经不是验证最好的一次。也不要把一次抖动当成结论，先看一段窗口。</p><p><strong>进阶</strong>：极短跑只用来确认循环能通。若要看抬头，可用示意曲线，或在加深时做一次很短的多训演示，不要一上来就完整训练。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-depth, .ft-curve');
			if (sels('.ft-depth', '.ft-curve', '.ft-log').length) highlightElements(sels('.ft-depth', '.ft-curve', '.ft-log'));
		},
		out: () => {
			if (sels('.ft-curve', '.ft-log').length) removeHighlightFromElements(sels('.ft-curve', '.ft-log'));
		},
		complete() {}
	},
	{
		id: 'overfit-forget',
		title: '过拟合、欠拟合与灾难性遗忘',
		content: `<p><strong>这一步在干什么</strong>：过拟合：训练越来越好，验证开始变差，续写开始重复语料原句。欠拟合：两边损失都降不下去，口吻几乎没变。灾难性遗忘：更像语料的提示变好了，换一类原来会写的提示（短诗、故事开头）却变差，或也开始往笔记上靠。</p><p><strong>为什么需要它</strong>：这是微调课最要紧的三种失败，也是「为什么要验证集、为什么要对照语料外和另一类提示」的原因。</p><p><strong>怎么算</strong>：先看曲线上「验证开始抬头」的位置，再并排看语料内和另一类提示的续写、概率条。差别要从这两处对照里讲出来，不能只盯训练损失。</p><p><strong>在界面上看哪里</strong>：进度轨「再深挖」里，「看过拟合」和「看遗忘」就在主线上，有图和对照，不必自己翻标签。示意数据不开训，也能先看清这种分叉。</p><p><strong>常见误解</strong>：「训练损失降了就是成功」不够。成功至少要包括：验证没有明显变差，另一类提示仍能写出原来那种句子，而不是只会背手头的笔记。</p><p><strong>进阶</strong>：缓解办法：留下验证最好的检查点、早停、少训几轮、改用旁边加一小块（LoRA）、或增加更干净多样的数据。一次只试一个。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-depth');
			if (sels('.ft-depth', '.ft-curve', '.ft-playground').length) highlightElements(sels('.ft-depth', '.ft-curve', '.ft-playground'));
		},
		out: () => {
			if (sels('.ft-curve', '.ft-playground').length) removeHighlightFromElements(sels('.ft-curve', '.ft-playground'));
		},
		complete() {}
	},
	{
		id: 'evaluate',
		title: '评估：同一提示对照 + 语料外提示',
		content: `<p><strong>这一步在干什么</strong>：评估不要只看损失，更不能只靠两段话「像不像」。请看课内评测卡：固定提示（语料内 + 语料外 + 另一类）、验证损失、并排概率条和续写。这是课内评测卡，不是通用评测平台。</p><p><strong>为什么需要它</strong>：损失不会告诉你「像不像笔记 / 像不像短诗」。人眼对照加上语料外和另一类提示，是这一课能做的最老实的评估。</p><p><strong>怎么算</strong>：用相同的温度、top-k、top-p、最大长度去生成，只切换「基座 / 微调后」。先存一份微调前的基线，再开训，否则你没有「前」。若训练用了「问：… / 答：…」，评测和提问也要用同一格式——怎么训就怎么问，格式不一致，续写更容易跑偏。</p><p><strong>在界面上看哪里</strong>：「再深挖」主线上就能看见评测卡和最小问答格式实验，不必再去对照游乐场里翻「需要时再打开」的折叠项。需要动手时，可载入问答模板（不会因此开训）。</p><p><strong>常见误解</strong>：不要用不同温度去比较两次模型，那会把抽样差异算到微调头上。也不要只挑写得最好的一条当结论。两段话像不像，不是完整评测。</p><p><strong>进阶</strong>：档案里应留下：配方、曲线、评测卡读法。后面并排对比两次跑时才有依据。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-depth');
			if (sels('.ft-depth', '.ft-eval', '.ft-playground').length) highlightElements(sels('.ft-depth', '.ft-eval', '.ft-playground'));
		},
		out: () => {
			if (sels('.ft-playground', '.ft-compare').length) removeHighlightFromElements(sels('.ft-playground', '.ft-compare'));
		},
		complete() {}
	},
	{
		id: 'temp-after-ft',
		title: '微调后，温度与 top-k 仍起作用',
		content: `<p><strong>这一步在干什么</strong>：微调改的是权重。推理时，温度、top-k、top-p 仍然决定怎么从概率表里抽样。两套旋钮不是互相替代的。</p><p><strong>为什么需要它</strong>：很多人以为「既然已经微调了，就该把温度关掉」或「温度还能再改一次权重」。都不是。把这件事单独写成一页，是为了和文字课接上。</p><p><strong>怎么算</strong>：同一套微调后的权重，温度 0.2 往往更重复、更常抽第一名；0.8 更意外。这和文字课完全一样，只是概率表已经不太一样了。</p><p><strong>在界面上看哪里</strong>：在对照游乐场改「意外程度 / top-k / top-p」，不要重新开训。实验第 8 项：同一套权重上比较 0.2 和 0.8。</p><p><strong>常见误解</strong>：温度仍然不是情感旋钮，也不是学习率。微调不会把抽样旋钮「吸收掉」。</p><p><strong>进阶</strong>：做完第 8 项，你应该能一句话讲清：权重决定概率表长什么样，温度决定怎么从这张表里取样。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-temp');
			if (sels('.ft-temp', '.ft-sampling', '.ft-playground').length) highlightElements(sels('.ft-temp', '.ft-sampling', '.ft-playground'));
		},
		out: () => {
			if (sels('.ft-temp', '.ft-sampling', '.ft-playground').length) removeHighlightFromElements(sels('.ft-temp', '.ft-sampling', '.ft-playground'));
		},
		complete() {}
	},
	{
		id: 'save-export',
		title: '保存、恢复与导出适配器',
		content: `<p><strong>这一步在干什么</strong>：每一次跑都应留下配方、曲线和续写。更要紧的是学会<strong>选检查点</strong>：该留下的是验证损失最好的那一次，不是最后一步。暂停后可以从检查点继续。LoRA 还可以导出旁边加的那一小块，方便以后只加载这一小块。</p><p><strong>为什么需要它</strong>：最后一步常常已经过了验证最好的时候。没有明确选择，系统容易默默留下最后一步，对照和导出就会用上已经变差的权重。</p><p><strong>怎么算</strong>：在曲线上找到验证损失最低的步数，把它当作要留下的检查点。检查点里通常有适配器（或全量权重）、优化器状态、步数和配方。导出 LoRA 时，主要是适配器权重和配置，体积远小于整个 GPT-2。</p><p><strong>在界面上看哪里</strong>：「再深挖」里的「选检查点」就在主线上，可以把「最后一步」和「验证最好的一次」对照着看，并点「留下验证最好的那一次」。档案里的导出、暂停 / 恢复仍在工作室里，需要时再打开。</p><p><strong>常见误解</strong>：「跑完就该用最后一步」并不对。验证已经抬头时，最后一步往往更差。「导出适配器」也不是导出聊天记录，更不是把整个基座打包送人。</p><p><strong>进阶</strong>：先保证能在本机留下正确的检查点并导出。不要把适配器拿去骚扰别人，也不要把它当成万能的新模型。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-depth');
			if (sels('.ft-depth', '.ft-archive', '.ft-export', '.ft-resume').length) highlightElements(sels('.ft-depth', '.ft-archive', '.ft-export', '.ft-resume'));
		},
		out: () => {
			if (sels('.ft-archive', '.ft-export', '.ft-resume').length) removeHighlightFromElements(sels('.ft-archive', '.ft-export', '.ft-resume'));
		},
		complete() {}
	},
	{
		id: 'one-knob',
		title: '自由度实验：一次只改一个旋钮',
		content: `<p><strong>这一步在干什么</strong>：打开全部旋钮之后，最容易同时拧十个。这一页要求你：先锁定推荐配方和同一份数据，然后一次只改一个旋钮再跑对照。</p><p><strong>为什么需要它</strong>：否则你说不清变化来自学习率、秩，还是碰巧多训了半轮。这是对照，不是为了把界面做复杂。</p><p><strong>怎么算</strong>：做法：复制当前配方 → 只改一项（例如学习率或 r）→ 用同一拆分和同一批提示 → 看曲线和续写 → 把两次跑在档案里并排。</p><p><strong>在界面上看哪里</strong>：点「一键打开全部旋钮」后仍要克制。点「恢复推荐」不会清掉语料。实验第 7、9 项就是这类对照。</p><p><strong>常见误解</strong>：「全部调到看起来很强的值」不是实验。那是把很多变化捆在一起，最后无法解释。</p><p><strong>进阶</strong>：把对照表写在档案备注里：改了什么、没改什么、验证损失和续写各如何。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-advanced');
			if (sels('.ft-advanced', '.ft-recommend', '.ft-archive').length) highlightElements(sels('.ft-advanced', '.ft-recommend', '.ft-archive'));
		},
		out: () => {
			if (sels('.ft-advanced', '.ft-recommend', '.ft-archive').length) removeHighlightFromElements(sels('.ft-advanced', '.ft-recommend', '.ft-archive'));
		},
		complete() {}
	},
	{
		id: 'further-map',
		title: '进阶地图',
		content: `<p><strong>这一步在干什么</strong>：第一期停在 GPT-2 small（自由模式可试 medium），在单卡上把循环跑通。更大的模型、量化和多卡，是后面的地图，不是这一课的必做项。</p><p><strong>为什么需要它</strong>：先知道边界，才不会在消费卡上勉强上一个装不下的模型，然后误以为「微调没用」。</p><p><strong>怎么算</strong>：更大基座通常更吃显存；量化（如 8-bit / 4-bit）是用精度换空间的办法，也会带来新的误差和依赖。第一期不必上量化，把 LoRA / 冻结 / 全量的差别看清楚更重要。</p><p><strong>在界面上看哪里</strong>：自由模式里可以改成 GPT-2 medium。若显存不够，回到 small，或减小序列长度和批次。启动说明在工作室顶部和 finetune-lab/README.md。</p><p><strong>常见误解</strong>：「必须量化才能微调」在本课不成立。GPT-2 small 的 LoRA 在这类消费卡上就跑得动。也不要把没装好的依赖当成算法失败。</p><p><strong>进阶</strong>：你若已经能讲清损失、验证、LoRA 和对照续写，再向外看更大模型不迟。第一期的任务是把这 22 步和 9 个实验做完。</p>`,
		on: () => {
			if (typeof window !== 'undefined') prepareFinetuneFlash('.ft-advanced');
			if (sels('.ft-advanced', '.ft-server-help').length) highlightElements(sels('.ft-advanced', '.ft-server-help'));
		},
		out: () => {
			if (sels('.ft-advanced', '.ft-server-help').length) removeHighlightFromElements(sels('.ft-advanced', '.ft-server-help'));
		},
		complete() {}
	}
];
