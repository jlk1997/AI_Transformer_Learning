import { get } from 'svelte/store';
import {
	expandedBlock,
	weightPopover,
	isBoundingBoxActive,
	textbookCurrentPageId,
	isExpandOrCollapseRunning,
	isFetchingModel,
	userId
} from '~/store';
import {
	highlightElements,
	removeHighlightFromElements,
	applyTransformerBoundingHeight,
	resetElementsHeight,
	highlightAttentionPath,
	removeAttentionPathHighlight,
	removeFingerFromElements
} from '~/utils/textbook';
import { drawResidualLine } from './animation';

export interface TextbookPage {
	id: string;
	title: string;
	content?: string;
	component?: any;
	timeoutId?: number;
	on: () => void;
	out: () => void;
	complete?: () => void;
}

const { drawLine, removeLine } = drawResidualLine();

export const textPages: TextbookPage[] = [
	{
		id: 'what-is-transformer',
		title: "Transformer 是什么？",
		content: `<p><strong>这一步在干什么</strong>：Transformer 是 2017 年提出的一套神经网络「搭积木」方式。今天 ChatGPT、Gemini、DeepSeek 这类对话大模型，底层都靠它（或其变体）。本工具跑的是<strong>GPT-2 small</strong>：参数更少、结构更干净，但完整保留了「根据已写文字猜下一个词」的推理流程。你现在要学的，首先是<strong>推理时怎么猜词</strong>，不是一上来就啃训练细节。</p>
<p><strong>为什么需要它</strong>：文字对电脑来说只是符号；要把「上下文」变成可计算的数字，再一步步变成「下一个词的概率表」，就需要一套固定流水线。Transformer 正是这套流水线的主流设计。不会它，就只能把大模型当成黑箱按钮，没法做对照实验，也没法读论文。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>把输入句子切成 token（词/子词）。</li><li>每个 token 变成数字向量（嵌入），并加上位置信息。</li><li>向量穿过多层「Transformer 块」（注意力 + 前馈网络）。</li><li>最后一层输出变成词表上每个词的分数，再变成概率。</li><li>按温度与采样策略抽出<strong>一个</strong>下一个词，接回去继续猜。</li></ol></p>
<p><strong>在界面上看哪里</strong>：先别点开任何放大镜。看整张图：左边是输入词与嵌入，中间是重复的 Transformer 块，右边是紫色概率列表。在任务区可输入英文或点「示例句子」，再点「生成下一个词」。黄色高亮出现时，跟着卡片走。</p>
<p><strong>常见误解</strong>：「学 Transformer = 背公式」不对；本工具强调跟着一个词的数字名片走完全程。「GPT-2 过时了所以没用」也不对：架构与 ChatGPT 同类（decoder-only），适合当显微镜。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 Transformer Explainer（CHI）的目标之一，是让非专家用可交互可视化理解 LLM 里的 Transformer。设计要点：token 中心数据流、渐进展开细节、浏览器里直播 GPT-2、引导卡片黄高亮。你后面每页都会踩到这些设计。先建立心智模型：这是<strong>自回归猜词机</strong>，不是一次性吐整篇文章的魔法。</p>`,
		on: () => {},
		out: () => {}
	},
	{
		id: 'how-transformers-work',
		title: "Transformer 怎么工作？",
		content: `<p><strong>这一步在干什么</strong>：这一页讲工作方式：模型<strong>自回归</strong>地生成——每次只问「下一个最可能的词是什么？」，猜完接上，再猜，直到你停或句子够长。</p>
<p><strong>为什么需要它</strong>：若一次生成整段，模型就很难保证前后一致，也难用概率解释「为什么选这个词」。一个词一个词来，才能把「上下文 → 概率 → 抽样」拆开看清，也才能调温度、top-k 做实验。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>当前已有序列（你输入的 + 已生成的）。</li><li>模型对词表每个候选打分并变成概率。</li><li>按采样规则抽出一个 token。</li><li>把该 token 接到序列末尾。</li><li>重复，直到停止。</li></ol></p>
<p><strong>在界面上看哪里</strong>：看任务区输入处的黄高亮：模型下载中可先点「示例句子」；下好后点「生成下一个词」。点一次只多一个词；多点几次，体会「文章是一个词一个词长出来的」。</p>
<p><strong>常见误解</strong>：别以为「点一次生成 = 写完全文」。也不要把示例数据当成「假模型」：示例是为了弱网也能立刻探索，流程与真推理一致。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文学习目标 LO1：理解自回归 next-token。你能自己输入、反复生成、盯着右边第一名变化，就在做论文强调的「实时实验」。进阶可想：训练时用因果掩码强迫模型只根据左边预测右边，和这里推理是同一逻辑。</p>`,
		on: () => {
			highlightElements(['.input-form']);
			if (get(isFetchingModel)) {
				highlightElements(['.input-form .select-button']);
			} else {
				highlightElements(['.input-form .generate-button']);
			}
		},
		out: () => {
			removeHighlightFromElements([
				'.input-form',
				'.input-form .select-button',
				'.input-form .generate-button'
			]);
		},
		complete: () => {
			removeFingerFromElements(['.input-form .select-button', '.input-form .generate-button']);
			if (get(textbookCurrentPageId) === 'how-transformers-work') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'how-transformers-work'
				});
			}
		}
	},
	{
		id: 'transformer-architecture',
		title: "三大块长什么样？",
		content:
			`<p><strong>这一步在干什么</strong>：把整张图从左到右看成<strong>三大块</strong>：（1）嵌入：字→数字；（2）中间一叠 Transformer 块：注意力混合上下文 + MLP 再加工；（3）右边概率：给下一个词打分并抽样。</p>
<p><strong>为什么需要它</strong>：Transformer 零件很多。先认清三块职责，才不会在矩阵细节里迷路。论文设计也是先总览数据流，再按需展开（expand views gradually）。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>输入文本 → token → 嵌入向量（含位置）。</li><li>向量进入第 1…12 个相同结构的块（GPT-2 small 为 12 块）。</li><li>每块内：掩码多头自注意力 →（残差/归一化）→ MLP →（残差/归一化）。</li><li>最后块输出经线性层得到 logits，再经温度/采样/softmax 得概率。</li></ol></p>
<p><strong>在界面上看哪里</strong>：界面会高亮嵌入区、Transformer 外框、以及右边 softmax/概率区。先用眼睛扫三块边界；小标题旁有放大镜的，后面再点。</p>
<p><strong>常见误解</strong>：「中间每一层都在干完全不同的事」说得太绝对：块结构重复，早期偏局部模式、后期偏更抽象语义，但是同一套积木。</p>
<p><strong>进阶（想搞研究再读）</strong>：对应论文 LO2 架构总览。Decoder-only 只有「解码器」这条生成路径（不像原版 Transformer 还有编码器做翻译对照）。跟住一条彩色数据流：那就是某个 token 的向量名片在搬家。</p>`,
		on: () => {
			const selectors = [
				'.step.embedding',
				'.step.softmax',
				'.transformer-bounding',
				'.transformer-bounding-title'
			];
			highlightElements(selectors);
			applyTransformerBoundingHeight(['.softmax-bounding', '.embedding-bounding']);
		},
		out: () => {
			const selectors = [
				'.step.embedding',
				'.step.softmax',
				'.transformer-bounding',
				'.transformer-bounding-title'
			];
			removeHighlightFromElements(selectors);
			resetElementsHeight(['.softmax-bounding', '.embedding-bounding']);
		}
	},
	{
		id: 'embedding',
		title: "嵌入：把字变成数字",
		content: `<p><strong>这一步在干什么</strong>：先看左边那些向量条：字已经变成一排数。嵌入（Embedding）就是把离散的文字符号，变成电脑能加减乘除的<strong>数字向量名片</strong>。没有这一步，后面注意力和 MLP 都没东西可算。</p>
<p><strong>为什么需要它</strong>：词表是离散 ID；神经网络吃的是连续向量。嵌入表相当于「ID → 向量」的大通讯录。再加上位置，模型才知道语序。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>分词得到 token 字符串与 token ID。</li><li>用 ID 查<strong>词元嵌入</strong>向量（GPT-2 small 常为 768 维）。</li><li>按位置取<strong>位置编码</strong>向量。</li><li>两者相加 → 输入嵌入，流入第一块。</li></ol></p>
<p><strong>在界面上看哪里</strong>：点左边嵌入步骤标题旁的放大镜/高亮，打开嵌入展开视图：能看到 token、ID、词向量条、位置向量条、相加结果。竖条/热力条约等于「向量的形状示意」。</p>
<p><strong>常见误解</strong>：嵌入不是「翻译成英文」；也不是只有一个数字。它是一长串维度，每个维度没有单独人类可读含义，组合起来才编码语义。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 LO3：text→embedding（token + position）。设计上 token 嵌入常用灰度强调「尚未被块变换」；后面 Q/K/V 才用蓝/红/绿区分角色。研究时可对照：嵌入矩阵是可学习参数，推理时只查表相加。</p>`,
		on: () => {
			highlightElements(['.step.embedding .title']);
		},
		out: () => {
			removeHighlightFromElements(['.step.embedding .title']);
		},
		complete: () => {
			removeFingerFromElements(['.step.embedding .title']);
			if (get(textbookCurrentPageId) === 'embedding') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'embedding'
				});
			}
		}
	},
	{
		id: 'token-embedding',
		title: "词元嵌入：查表拿名片",
		content: `<p><strong>这一步在干什么</strong>：先看嵌入展开里每个词旁边那一长条：那不是单个分数，而是从这个词的 ID 去表里取出的一条初始「数字名片」。这条向量常常是 <strong>768 维</strong>，名字叫词元嵌入。</p>
<p><strong>为什么需要它</strong>：同一 token 在不同句子里语义会变，但起步要有一个稳定的初始表示；上下文混合留给后面的注意力。查表很快，也方便端到端学习。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>分词器把文本切成 token（英文常按子词）。</li><li>映射到词表 ID（GPT-2 词表约 <strong>50257</strong>）。</li><li>Embedding 矩阵第 ID 行 → 768 维向量。</li><li>界面上用矩形/热力图示意该向量。</li></ol></p>
<p><strong>在界面上看哪里</strong>：打开嵌入展开后，看 token 字符串列与 token embedding 列的高亮。把鼠标悬停在向量条上，可感到「一长串数」而不是单个分数。</p>
<p><strong>常见误解</strong>：别把 768 当成「768 个汉字」；那是维度。也别以为没出现在训练词表的字就绝对无法处理——分词器会拆成子词拼起来。</p>
<p><strong>进阶（想搞研究再读）</strong>：进阶：嵌入矩阵形状约 [词表大小 × 隐维度]。Decoder-only GPT 风格里，输入嵌入与输出投影有时可共享权重（具体实现因模型而异）。你在工具里先抓住「ID→向量名片」。</p>`,
		on: function () {
			const selectors = [
				'.token-column .column.token-string',
				'.token-column .column.token-embedding'
			];
			if (get(expandedBlock).id !== 'embedding') {
				expandedBlock.set({ id: 'embedding' });
				this.timeoutId = setTimeout(() => {
					highlightElements(selectors);
				}, 500);
			} else {
				highlightElements(selectors);
			}
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			const selectors = [
				'.token-column .column.token-string',
				'.token-column .column.token-embedding'
			];
			removeHighlightFromElements(selectors);
			if (get(textbookCurrentPageId) !== 'positional-encoding') expandedBlock.set({ id: null });
		}
	},
	{
		id: 'positional-encoding',
		title: "位置编码：顺序也很重要",
		content: `<p><strong>这一步在干什么</strong>：先看嵌入展开里那一列位置条（以及放大镜里每种位置不一样的条纹）：同一句话换个顺序，位置列就会变。「猫吃鱼」和「鱼吃猫」要靠它分清先后。这就是位置编码。</p>
<p><strong>为什么需要它</strong>：自注意力本身不天生知道绝对位置（它看的是内容相似度）。必须显式注入位置信号，语序才进得了计算。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>为位置 0,1,2,… 准备同维度的位置向量。</li><li>与对应 token 嵌入<strong>相加</strong>（不是替换）。</li><li>相加结果才是送进第一块的输入嵌入。</li></ol><p>本课的 GPT-2 用的是学来的位置嵌入（按位置查表），不是把正弦公式当成现场权重，也没有 RoPE 动画。有的模型会用 RoPE，目的同样是让模型知道前后；本课不演示它。条纹只是示意「每个位置长得不一样」。</p>
<p><strong>在界面上看哪里</strong>：在嵌入展开视图里对照三列：词元嵌入、位置编码、相加后的和。黄高亮会指到位置相关列。</p>
<p><strong>常见误解</strong>：位置编码不是「语法检查器」，不会单独纠正病句；它只提供顺序线索。也不是可有可无的装饰。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文把位置与 token 嵌入并列展示（图 5）。研究阅读时区分：绝对位置嵌入 vs 相对位置 / RoPE；本工具重点是「相加进向量」这一可观察事实。</p>`,
		on: function () {
			const selectors = [
				'.token-column .column.position-embedding',
				'.token-column .column.symbol'
			];
			if (get(expandedBlock).id !== 'embedding') {
				expandedBlock.set({ id: 'embedding' });
				this.timeoutId = setTimeout(() => {
					highlightElements(selectors);
				}, 500);
			} else {
				highlightElements(selectors);
			}
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			const selectors = [
				'.token-column .column.position-embedding',
				'.token-column .column.symbol'
			];
			removeHighlightFromElements(selectors);
			if (get(textbookCurrentPageId) !== 'token-embedding') expandedBlock.set({ id: null });
		}
	},
	{
		id: 'blocks',
		title: "重复的 Transformer 块",
		content: `<p><strong>这一步在干什么</strong>：中间不是一层就算完，而是<strong>同一结构重复很多遍</strong>。GPT-2 small 有 <strong>12</strong> 个 Transformer 块；每一块都做：注意力混合上下文 → MLP 再加工（外加残差与归一化）。</p>
<p><strong>为什么需要它</strong>：只做一次混合，表达能力不够。多层堆叠让早期块抓较局部/浅层模式，后面块组合出更抽象的语义特征（这是经验观察，不是魔法分层标签）。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>块输入：上一块的输出向量序列。</li><li>掩码多头自注意力：每个位置看允许的上文。</li><li>残差相加 + 层归一化。</li><li>MLP 对每个位置独立升维-激活-降维。</li><li>再残差 + 归一化 → 下一块。</li></ol></p>
<p><strong>在界面上看哪里</strong>：看中间 Transformer 外框与块切换分页。一次通常只展开一个块、一个注意力头，避免信息过载；淡入淡出的流线暗示后面还有同样的块。</p>
<p><strong>常见误解</strong>：「第 N 层专门负责某某人类概念」往往过度解读。更稳妥：层在堆叠中逐步变换表示。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文用动画在块之间折叠/展开保上下文（§6.1）。专家路径：同一输入下切换块编号，比较注意力图是否从局部连边变成更远依赖。</p>`,
		on: function () {
			this.timeoutId = setTimeout(
				() => {
					highlightElements([
						'.transformer-bounding',
						'.step.transformer-blocks .guide',
						'.attention > .title',
						'.mlp > .title'
					]);
					highlightElements(['.transformer-bounding-title'], 'textbook-button-highlight');
					isBoundingBoxActive.set(true);
				},
				get(isExpandOrCollapseRunning) ? 500 : 0
			);
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			removeHighlightFromElements([
				'.transformer-bounding',
				'.step.transformer-blocks .guide',
				'.attention > .title',
				'.mlp > .title'
			]);
			removeHighlightFromElements(['.transformer-bounding-title'], 'textbook-button-highlight');
			isBoundingBoxActive.set(false);
		},
		complete: () => {
			removeFingerFromElements(['.transformer-bounding-title']);
			if (get(textbookCurrentPageId) === 'blocks') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'blocks'
				});
			}
		}
	},
	{
		id: 'self-attention',
		title: "多头自注意力：该看谁？",
		content:
			`<p><strong>这一步在干什么</strong>：先看中间那些会亮的线和圆点：写到某个位置时，它在问<strong>该多看上文哪些词</strong>。自注意力就是按相关度去混合这些已经出现的词带来的信息。</p>
<p><strong>为什么需要它</strong>：RNN 靠一步步传递，远距离依赖难；卷积窗口又窄。自注意力让任意两个位置直接互动（在因果掩码允许的前提下），更适合语言里的长程关系。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>每个位置的向量变成 Q、K、V 三种角色。</li><li>用 Q 去对所有允许的 K 打分（点积）。</li><li>掩码掉未来位置，再 softmax 成权重。</li><li>用权重对 V 加权求和 → 该位置的注意力输出。</li><li>多头并行多组后拼接，再投影回去。</li></ol></p>
<p><strong>在界面上看哪里</strong>：先看中间已经亮起来的线和圆点，再点自注意力标题旁的放大镜看展开视图；深浅常表示关注强弱。黄手指引导时先跟高亮，再自己点不同位置。公式在本页后面和放大镜里，先不要从公式读起。</p>
<p><strong>常见误解</strong>：注意力权重不是「模型在思考的句子」的直译；它是混合系数。高权重也不等于人类意义上的「理解」。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 LO4 核心。Q·K 相似度 → 注意力分数；再取 V。颜色约定常见：<span class=\"blue\">Q 蓝</span>、<span class=\"red\">K 红</span>，分数偏 <span class=\"purple\">紫</span>，提示由两者合成。</p>`,
		on: () => {
			highlightElements(['.step.attention']);
		},
		out: () => {
			removeHighlightFromElements(['.step.attention']);
		}
	},
	{
		id: 'qkv',
		title: "提问 Q、标签 K、内容 V",
		content: `<p><strong>这一步在干什么</strong>：先看中间已经亮起来的那根注意力线（或矩阵里发亮的格子）：同一个位置既在问「该看谁」，又把自己当作可被检索的标签，还带着要被混走的内容。这三种用法，再分别叫 <span class=\"blue\"><strong>提问 Q</strong></span>、<span class=\"red\"><strong>标签 K</strong></span>、<span class=\"green\"><strong>内容 V</strong></span>。</p>
<p><strong>为什么需要它</strong>：只用一份向量既当「问题」又当「答案」会缠在一起。拆成 Q/K/V，才能清楚表达：用提问去对标签，再按匹配度取内容。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>输入向量 × W_Q → <span class=\"blue\">Q</span>。</li><li>× W_K → <span class=\"red\">K</span>；× W_V → <span class=\"green\">V</span>。</li><li>分数 ≈ Q · K（常再除以根号维度稳住数值）。</li><li>softmax 后的权重去乘 <span class=\"green\">V</span> 并求和。</li></ol></p>
<p><strong>在界面上看哪里</strong>：先看你已经看见的亮线和圆点，再在注意力展开里找到三种角色的标签。矩阵色块若在放大镜里动画，那是示意，不是现场完整权重。跟着黄高亮把「问→对标签→取内容」说一遍。公式在本页后面和放大镜里，不要从公式读起。</p>
<p><strong>常见误解</strong>：Q/K/V 不是三个不同的「单词」；是同一位置向量的三种线性投影。也不是心理学里的记忆模块实体。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文用矩阵乘动画讲清「嵌入×权重」反复出现（图 6）。专家练习：固定一句，观察某位置 Q 与各 K 的分数，谁被掩码、谁权重大，再看 V 混合结果如何改变该位置表示。</p>`,
		on: function () {
			this.timeoutId = setTimeout(
				() => {
					highlightElements(['g.path-group.qkv', '.step.qkv .qkv-column']);
				},
				get(isExpandOrCollapseRunning) ? 500 : 0
			);
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			removeHighlightFromElements(['g.path-group.qkv', '.step.qkv .qkv-column']);
			weightPopover.set(null);
		},
		complete: () => {
			removeFingerFromElements(['.step.qkv .qkv-column']);
			if (get(textbookCurrentPageId) === 'qkv') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'qkv'
				});
			}
		}
	},

	{
		id: 'multi-head',
		title: "多头：切开并行再拼回",
		content:
			`<p><strong>这一步在干什么</strong>：先看注意力展开里可以切换的那些头：换一头，亮线和圆点的图案会变，说明同一句话被并行看了好几遍。这种切开并行、再拼回去的做法，名字叫多头（GPT-2 small 常为 <strong>12 头</strong>）。</p>
<p><strong>为什么需要它</strong>：单头容量有限，容易只抓一种模式。多头像多个同学同时读上文：有人盯主语，有人盯指代，有人盯标点节奏，再合并笔记。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>把 Q/K/V 在特征维切开（或投影成多份）。</li><li>每头独立做缩放点积注意力（共享同一因果掩码规则）。</li><li>各头输出在特征维拼接。</li><li>再乘输出投影矩阵，变回模型隐维度。</li></ol></p>
<p><strong>在界面上看哪里</strong>：展开注意力后用头分页/卡片堆切换。动画会循环翻头，提醒你「还有很多头」。一次看一头，切头对比模式差异。</p>
<p><strong>常见误解</strong>：「12 头 = 12 种固定语言学功能」太死板；头的分工是学出来的，且随输入变，不要强行贴永久标签。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文强调多头与多块导航是降低抽象感的关键（§7）。专家路径：同一层切换 head，截图对比稀疏/分散的注意力图，试着用自己的话描述差异，而不是背术语。</p>`,
		on: () => {
			highlightAttentionPath();
			highlightElements(['.multi-head .head-title']);
		},
		out: () => {
			removeAttentionPathHighlight();
			removeHighlightFromElements(['.multi-head .head-title']);
		},
		complete: () => {
			removeFingerFromElements(['.multi-head .head-title']);
			if (get(textbookCurrentPageId) === 'multi-head') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'multi-head'
				});
			}
		}
	},
	{
		id: 'masked-self-attention',
		title: "因果掩码：不能偷看未来",
		content: `<p><strong>这一步在干什么</strong>：先看注意力矩阵里右上那一块：还没写出来的未来位置是暗的、连不过去。模型在猜下一个词时，<strong>只能看已经出现的词</strong>，不能看右边。这个挡住未来的规则，名字叫因果掩码，也就是「不能偷看未来」。</p>
<p><strong>为什么需要它</strong>：若训练/推理时能看见未来 token，模型会抄答案，学不会「根据上文预测下文」。掩码强迫它真的做预测。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>算出所有位置两两之间的注意力分数。</li><li>对「未来位置」的分数填成 −∞（或等价屏蔽）。</li><li>softmax 后这些位置权重≈0。</li><li>于是加权 V 时带不走未来信息。</li></ol></p>
<p><strong>在界面上看哪里</strong>：看注意力矩阵/连线：右上未来区域应被挡住或权重近零。教材高亮时对照「不能偷看」的提示。</p>
<p><strong>常见误解</strong>：掩码不是删除单词，而是计算时不让你用未来信息。双向编码器（如 BERT）可以看两边；那是另一类任务，不是本工具的生成设定。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文背景 §2 明确 decoder-only + causal masking。专家检查点：你能否向别人讲清「为什么生成式 GPT 必须掩码，而填空式模型可以双向」。</p>`,
		on: () => {
			highlightAttentionPath();
			highlightElements(['.attention-matrix.attention-result']);
		},
		out: () => {
			removeAttentionPathHighlight();
			removeHighlightFromElements(['.attention-matrix.attention-result']);
			expandedBlock.set({ id: null });
		},
		complete: () => {
			removeFingerFromElements(['.attention-matrix.attention-result']);
			if (get(textbookCurrentPageId) === 'masked-self-attention') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'masked-self-attention'
				});
			}
		}
	},
	{
		id: 'output-concatenation',
		title: "注意力输出与拼接",
		content:
			`<p><strong>这一步在干什么</strong>：先看多头都算完之后，展开视图末尾几路输出并到一起、维度又变回去：那是把各头的结果<strong>拼接</strong>起来再投影，得到这一层注意力交给后面残差和 MLP 的向量。</p>
<p><strong>为什么需要它</strong>：多头在低维子空间里各看各的；模型主干仍要统一的隐维度。拼接+投影 = 把「多视角笔记」写回同一本笔记本。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>头1…头H 的输出在特征维 concat。</li><li>乘 W_O 投影回原维度。</li><li>常与残差支路相加，再进归一化/MLP。</li></ol></p>
<p><strong>在界面上看哪里</strong>：先看注意力展开末尾，几路输出并在一起、数据流变粗再变细。看到维度数字变化时，把它理解成「多头合并」。公式在本页后面，不要从公式读起。</p>
<p><strong>常见误解</strong>：拼接不是简单平均所有头；是先拼长向量再学习怎么混合。平均会丢掉头之间的可学习组合。</p>
<p><strong>进阶（想搞研究再读）</strong>：对照论文图 6B：注意力矩阵 × V 之后，还有多头合并与后续路径。能画出「多头→concat→投影→残差」就算过关。</p>`,
		on: function () {
			this.timeoutId = setTimeout(
				() => {
					highlightElements(['path.to-attention-out.value-to-out', '.attention .column.out']);
				},
				get(isExpandOrCollapseRunning) ? 500 : 0
			);
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			removeHighlightFromElements(['path.to-attention-out.value-to-out', '.attention .column.out']);
			weightPopover.set(null);
		},
		complete: () => {
			removeFingerFromElements(['.attention .column.out']);
			if (get(textbookCurrentPageId) === 'output-concatenation') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'output-concatenation'
				});
			}
		}
	},
	{
		id: 'mlp',
		title: "前馈网络：各自再加工",
		content:
			`<p><strong>这一步在干什么</strong>：先看块里注意力后面那一段升维、弯曲、再降维的示意：注意力「跟别人交流」之后，<strong>每个位置还要自己再炼一遍</strong>。这段前馈网络通常升维 → 激活（GPT-2 用 GELU）→ 降维。</p>
<p><strong>为什么需要它</strong>：注意力擅长路由与混合信息；MLP 提供逐位置非线性变换，加大表示能力。两者分工不同，缺一不可。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>输入：注意力子层之后的向量（经残差/归一化后）。</li><li>线性层升到更高维（常 4×）。</li><li>GELU 等激活引入非线性。</li><li>再线性降回隐维度。</li><li>残差加回，进入下一块或输出。</li></ol></p>
<p><strong>在界面上看哪里</strong>：在块内找到 MLP/前馈区域与放大镜；展开后可看到升维-激活-降维的示意与矩阵乘气泡（论文图 6C）。</p>
<p><strong>常见误解</strong>：MLP 不是第二套注意力，不会再算 Q·K。也不要把它叫成「记忆库」就结束——它是位置上的非线性感知机。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 LO5。专家：同一 token 过 MLP 前后，向量热力图如何变；并记住辅助件（残差、LayerNorm、dropout）论文归为支撑机制，主线仍是注意力混合 + MLP 变换 + 概率抽样。</p>`,
		on: () => {
			highlightElements(['.step.mlp', '.operation-col.activation']);
		},
		out: () => {
			removeHighlightFromElements(['.step.mlp', '.operation-col.activation']);
		}
	},

	{
		id: 'output-logit',
		title: "输出 Logit：给词表打分",
		content: `<p><strong>这一步在干什么</strong>：最后一个 Transformer 块输出后，用线性层把隐向量映到<strong>词表大小</strong>的分数，叫 logits。每个词一个原始分数，还不是概率。</p>
<p><strong>为什么需要它</strong>：概率需要非负且求和为 1；logits 是未归一化的打分，保留比较关系，方便后续用温度缩放再归一化。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>取最后位置（正在预测下一个词的那个位置）的隐向量。</li><li>× 输出权重矩阵 → 长度≈词表大小的 logits。</li><li>后面才温度、top-k/p、softmax。</li></ol></p>
<p><strong>在界面上看哪里</strong>：看右边输出路径进入概率展开前的「logits」步骤；点概率区放大镜，从左到右第一段通常是原始分数。</p>
<p><strong>常见误解</strong>：logit 不是「正确率」，也不是已经采样的结果。分数高只表示相对更被模型看好，最终还看温度与抽样。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文图 6D：最终嵌入 × 输出权重 → logits。专家实验：改输入最后一个词，观察 logits 头部候选如何整体换血。</p>`,
		on: () => {
			highlightElements(['g.path-group.softmax', '.column.final']);
		},
		out: () => {
			removeHighlightFromElements(['g.path-group.softmax', '.column.final']);
			weightPopover.set(null);
		},
		complete: () => {
			removeFingerFromElements(['.column.final']);
			if (get(textbookCurrentPageId) === 'output-logit') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'output-logit'
				});
			}
		}
	},
	{
		id: 'output-probabilities',
		title: "概率：分数变成可能性",
		content:
			`<p><strong>这一步在干什么</strong>：把 logits 变成 0～1 的<strong>概率</strong>，且全部候选加起来为 1。这样右边排行榜才有「有多可能」的含义。常用 Softmax。</p>
<p><strong>为什么需要它</strong>：人要读懂「下一个词有多可能」，算法也要按概率抽样。没有这一步，只有不可比的原始分。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>从 logits 出发（可先除以温度）。</li><li>可选：用 top-k / top-p 截断候选。</li><li>对保留项做 softmax → 概率。</li><li>列表按概率排序，顶部是最可能候选。</li></ol></p>
<p><strong>在界面上看哪里</strong>：点右边概率标题/放大镜打开 Expanded Probabilities：从左到右看 logits → 温度缩放 → 采样截断 → softmax。悬停某 token 可看公式卡片。</p>
<p><strong>常见误解</strong>：第一名不是「唯一真理」；后面采样可能抽到第二、第三。也别把概率当成模型的情感自信。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 LO6 与 §6.2/6.4。专家：同一句固定温度，记录前 5 名；再只改输入标点或冠词，看分布如何抖——体会输入敏感度。</p>`,
		on: () => {
			highlightElements(['.step.softmax .title']);
		},
		out: () => {
			removeHighlightFromElements(['.step.softmax .title']);
		},
		complete: () => {
			removeFingerFromElements(['.step.softmax .title']);
			if (get(textbookCurrentPageId) === 'output-probabilities') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'output-probabilities'
				});
			}
		}
	},
	{
		id: 'temperature',
		title: "温度：让分布更尖或更平",
		content:
			`<p><strong>这一步在干什么</strong>：温度用来在 softmax 前缩放 logits：<strong>低温度</strong>让分布更尖（更确定），<strong>高温度</strong>让分布更平（更随机）。它不是「创造力旋钮」的魔法标签。</p>
<p><strong>为什么需要它</strong>：有时你想要稳的续写（低 T），有时想要更多样的候选（高 T）。温度直接改写概率形状，是最该亲手拖的实验控件。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>新分数 = logits / T（T&gt;0）。</li><li>T&lt;1：大小差距被放大 → 尖峰。</li><li>T&gt;1：差距被压缩 → 变平。</li><li>再进入截断与 softmax。</li></ol></p>
<p><strong>在界面上看哪里</strong>：主线走到「现在才拧抽词旋钮」之后，在任务区打开抽词旋钮（或点「显示抽词旋钮」），拖温度滑条，盯着右边条形立刻变尖/变扁（论文图 7A）。建议对照：T≈0.2、1.0、1.5 各生成几次。概率展开里仍可看到缩放后的分数，滑条不在顶部。</p>
<p><strong>常见误解</strong>：温度≠智商，也不保证「更有创意的文艺内容」；它只改随机性与分布形状。T→0 近似总取最大；T 很大则接近乱抽。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文明确批评把 temperature 拟人化成 creativity。专家必做：固定 top-k，只扫温度，把前 10 名概率抄下来画成表——这就是研究级对照实验的雏形。</p>`,
		on: function () {
			if (get(expandedBlock).id !== 'softmax') {
				expandedBlock.set({ id: 'softmax' });
				this.timeoutId = setTimeout(() => {
					highlightElements([
						'.formula-step.scaled',
						'.title-box.scaled',
						'.content-box.scaled',
						'[data-te-sampling="panel"]',
						'.temperature-input'
					]);
				}, 500);
			} else {
				highlightElements([
					'.formula-step.scaled',
					'.title-box.scaled',
					'.content-box.scaled',
					'[data-te-sampling="panel"]',
					'.temperature-input'
				]);
			}
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			removeHighlightFromElements([
				'.formula-step.scaled',
				'.title-box.scaled',
				'.temperature-input',
				'.content-box.scaled'
			]);
			if (!['temperature', 'sampling'].includes(get(textbookCurrentPageId)))
				expandedBlock.set({ id: null });
		},
		complete: () => {
			removeFingerFromElements(['.temperature-input']);
			if (get(textbookCurrentPageId) === 'temperature') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'temperature'
				});
			}
		}
	},
	{
		id: 'sampling',
		title: "选词策略：怎么抽出下一个？",
		content:
			`<p><strong>这一步在干什么</strong>：有了概率还要<strong>决定怎么抽出下一个词</strong>。常见：贪心（总取最大）、top-k（只在前 k 个里抽）、top-p（核采样：累计概率刚超 p 的最小集合里抽）。</p>
<p><strong>为什么需要它</strong>：纯贪心容易死板重复；在全词表随机又太野。top-k/top-p 在「质量」和「多样性」之间折中，也是产品里常见控件。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>按概率排序候选。</li><li>top-k：保留前 k 个，重新归一化再抽。</li><li>top-p：从小到大累加，直到累计≥p，保留该集合再抽。</li><li>抽出一个 token，接到输入，继续自回归。</li></ol></p>
<p><strong>在界面上看哪里</strong>：在任务区已解开的抽词旋钮里切换 top-k / top-p 并调整 k 或 p（图 7B）。观察右边候选集合变大变小时，条形与生成结果如何变。这些控件在任务区，不在顶部。</p>
<p><strong>常见误解</strong>：采样不是「模型随便胡编」的借口；规则透明。也不是训练算法本身——这是推理超参。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 G3：实时改超参看 next-token。专家：同一温度下对比 k=5 vs k=50、p=0.9 vs p=0.3，记录重复率与意外词比例，形成自己的直觉表。</p>`,
		on: function () {
			if (get(expandedBlock).id !== 'softmax') {
				expandedBlock.set({ id: 'softmax' });
				this.timeoutId = setTimeout(() => {
					highlightElements([
						'.formula-step.sampling',
						'.title-box.sampling',
						'.sampling-input',
						'.content-box.sampling'
					]);
				}, 500);
			} else {
				highlightElements([
					'.formula-step.sampling',
					'.title-box.sampling',
					'.sampling-input',
					'.content-box.sampling'
				]);
			}
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			removeHighlightFromElements([
				'.formula-step.sampling',
				'.title-box.sampling',
				'.sampling-input',
				'.content-box.sampling'
			]);
			if (!['temperature', 'sampling'].includes(get(textbookCurrentPageId)))
				expandedBlock.set({ id: null });
		},
		complete: () => {
			removeFingerFromElements(['.sampling-input']);
			if (get(textbookCurrentPageId) === 'sampling') {
				window.dataLayer?.push({
					user_id: get(userId),
					event: `textbook-complete`,
					page_id: 'sampling'
				});
			}
		}
	},
	{
		id: 'residual',
		title: "残差连接：别把原信息弄丢",
		content: `<p><strong>这一步在干什么</strong>：先看块里那条旁路和加号：子层算完后，前面的信号被<strong>原样加回</strong>来，不是被替换掉。这条旁路的名字叫残差连接。图上的小加法是示意，不是现场残差向量。</p>
<p><strong>为什么需要它</strong>：12 块很深，若每层都大幅改写且无捷径，前面信息易丢失、训练也难。残差提供「高速公路」。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>支路 A：注意力或 MLP 变换得到 F(x)。</li><li>支路 B：原 x 直接过来。</li><li>相加得 x+F(x)，再常接 LayerNorm。</li></ol></p>
<p><strong>在界面上看哪里</strong>：先看旁路和加号，再悬停残差符号/虚线流，看从旁路汇入主路的动画。点 Read More 可看文底补充（若页面有）。公式在本页后面，不要从 F(x)+x 读起。</p>
<p><strong>常见误解</strong>：残差不是跳过整网不算；是「变换 + 原样」一起保留。也不是注意力的替代品。</p>
<p><strong>进阶（想搞研究再读）</strong>：论文 §6.5 把残差、LayerNorm、dropout 归为辅助机制：支撑主计算，但初学别让它们抢戏。专家仍需能画 Add & Norm 在块里的位置。</p>`,
		on: function () {
			this.timeoutId = setTimeout(
				() => {
					highlightElements(['.operation-col.residual', '.residual-start']);
					drawLine();
				},
				get(isExpandOrCollapseRunning) ? 500 : 0
			);
		},
		out: function () {
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
				this.timeoutId = undefined;
			}
			removeHighlightFromElements(['.operation-col.residual', '.residual-start']);
			removeLine();
		}
	},
	{
		id: 'layer-normalization',
		title: "层归一化：稳住数值尺度",
		content: `<p><strong>这一步在干什么</strong>：先看 operation 列里的 LN 标记：它把同一个位置上的数调到相近的尺度，别让后面的计算爆掉或塌掉。这个稳住尺度的步骤，名字叫层归一化。均值和方差的公式在本页后面。</p>
<p><strong>为什么需要它</strong>：深层网络里激活尺度容易爆或塌。LayerNorm 在每个位置的特征维上做标准化（再学习缩放平移），稳定训练与推理数值。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>对单个位置的向量算均值、方差。</li><li>标准化到相近尺度。</li><li>再乘 γ、加 β（可学习）。</li><li>GPT-2 类结构常在注意力/MLP 前使用（具体变体：Pre-LN）。</li></ol></p>
<p><strong>在界面上看哪里</strong>：看 operation 列里的 LN 圆点/标记，悬停读简短提示。先建立「它在稳住尺度」即可，公式可后读。</p>
<p><strong>常见误解</strong>：LayerNorm ≠ 把句子意思归一成标准答案；只动数值尺度。也不同于批归一化（BatchNorm）那种跨样本统计。</p>
<p><strong>进阶（想搞研究再读）</strong>：进阶读 Pre-LN vs Post-LN 对稳定性的影响。本工具里它是辅助件：主线仍回到「注意力混合 → MLP → 概率」。</p>`,
		on: () => {
			highlightElements(['.operation-col.ln']);
		},
		out: () => {
			removeHighlightFromElements(['.operation-col.ln']);
		}
	},
	{
		id: 'dropout',
		title: "Dropout：训练防死记硬背",
		content: `<p><strong>这一步在干什么</strong>：Dropout 在<strong>训练</strong>时随机丢掉一部分连接/激活，减轻死记硬背。推理生成时通常<strong>关闭</strong>，好让结果更稳定可复现。</p>
<p><strong>为什么需要它</strong>：大模型参数多，容易背语料。训练期随机切断迫使网络学更稳的模式；推理若继续随机丢，同一输入会无谓抖动。</p>
<p><strong>怎么算（大白话步骤）</strong>：<ol><li>训练：按比率随机置零并缩放。</li><li>推理：关闭 dropout，走完整计算。</li><li>本浏览器演示主要展示推理数据流，故不要期待看到训练时的随机丢弃动画。</li></ol></p>
<p><strong>在界面上看哪里</strong>：界面上的 dropout 标记是结构提示（visual scent）。学完后把注意力放回主路径：输入→嵌入→块→概率。</p>
<p><strong>常见误解</strong>：看见 Dropout 不代表当前推理正在随机删边。也不要把 dropout 和温度采样混为一谈——一个多见于训练正则，一个是推理分布整形。</p>
<p><strong>进阶（想搞研究再读）</strong>：<strong>学完 20 步后怎么变专家</strong>：①自己换输入，盯着注意力图谁亮谁暗；②只改温度做对照，再只改 top-k/top-p 做对照，记下前 10 名；③每个带放大镜的模块点开，对照本页「怎么算」；④按论文 §6 设计（token 流、渐进展开、直播 GPT-2、黄高亮引导）再走一遍，问自己每项设计解决什么学习困难；⑤能用大白话给别人讲清「下一个词概率从哪来：嵌入→因果多头注意力→MLP→logits→温度/截断→softmax→抽样」。做完这五条，你就从围观界面进入可上手研究的门口。</p>`,
		on: () => {
			highlightElements(['.operation-col.dropout']);
		},
		out: () => {
			removeHighlightFromElements(['.operation-col.dropout']);
		}
	}
	// {
	// 	id: 'final',
	// 	title: `Let's explore!`,
	// 	content: '',
	// 	on: () => {},
	// 	out: () => {}
	// }
];
