<script>
	import Katex from '~/utils/Katex.svelte';
</script>

<div id="description" lang="zh-CN">
	<div class="article-section" data-click="article-intro">
		<h1>这个工具在教什么？</h1>
		<p>
			你在看的不是一张静止的结构图，而是一台正在运行的<strong>猜词机</strong>。本页在浏览器里跑的是
			<a href="https://huggingface.co/openai-community/gpt2" target="_blank" title="Hugging Face">GPT-2 small</a>
			（约 1.24 亿参数）：体量不大，但完整保留了今天 ChatGPT、DeepSeek 这类对话模型共用的
			<strong>Decoder-only</strong> 推理流程——根据已经写出的文字，预测<strong>下一个词</strong>。
		</p>
		<p>
			每一次点击「生成下一个词」，模型只回答一个问题：在当前这句话后面，词表里哪个词更可能出现？
			它先给每个候选打一个原始分数（logit），再变成概率，最后按温度和采样规则抽出<strong>一个</strong>词，接到句子末尾，然后再猜。
			整段文字就是这样，一个词一个词长出来的。这叫<strong>自回归</strong>（autoregression）。
			论文 <em>Transformer Explainer</em>（CHI，<a href="https://doi.org/10.1145/3772318.3791725" target="_blank">doi:10.1145/3772318.3791725</a>）把这一点列为学习目标 LO1。
		</p>
		<p>
			建议的学法：先走底部教练条认界面，再打开顶栏「书库」跟完 20 步，并用<strong>学习工作台</strong>做必做实验、查术语、测一测。
			下面这篇长文按数据流把原理串起来，可与书本、工作台对照着读。
		</p>
	</div>

	<div class="article-section" data-click="article-overview">
		<h1>架构其实就三块</h1>
		<p>
			文本生成用的 Transformer，都可以先看成三块（论文学习目标 LO2）。先建立这张地图，再往每一块里走。
		</p>
		<ol>
			<li>
				<strong class="bold-purple">嵌入（Embedding）</strong>：把输入切成词元（token），变成数字向量，并加上位置信息。没有这一步，后面的注意力和神经网络都没法算。
			</li>
			<li>
				<strong class="bold-purple">Transformer 块</strong>：同样的积木重复堆叠（GPT-2 small 是 12 块）。每一块里主要做两件事：
				<ul>
					<li><strong>多头自注意力</strong>：让每个位置去「看」上文，把有用的信息混合进来。</li>
					<li><strong>前馈网络（MLP）</strong>：注意力交流完后，每个位置再自己加工一遍。</li>
				</ul>
			</li>
			<li>
				<strong class="bold-purple">输出概率</strong>：最后一层的向量被投影到词表那么长的分数，再经过温度、截断和 Softmax，变成「下一个词」的概率表，然后抽样。
			</li>
		</ol>
		<p>
			本工具讲的是<strong>只有解码器</strong>的生成模型，不是「编码器 + 解码器」那种翻译架构。生成时还要加<strong>因果掩码</strong>，防止当前位置偷看右边还没写出来的词。
		</p>
	</div>

	<div class="article-section" id="embedding" data-click="article-embedding">
		<h2>嵌入：把字变成数，并记住谁在前</h2>
		<p>
			电脑并不「认识」英文单词。要计算，必须先把句子变成一串数字名片。嵌入就是这套手续（论文学习目标 LO3）。
			可以用页面上的示例句子，也可以自己输入一句不超过 12 个英文词的短句，然后点开左边「词向量（嵌入）」的放大镜对照。
		</p>
		<div class="figure">
			<img src="./article_assets/embedding.png" width="65%" alt="嵌入过程示意图" />
		</div>
		<div class="figure-caption">
			图 <span class="attention">1</span>。展开嵌入后，输入会依次经过
			<span class="fig-numbering">（1）</span>分词、（2）词元嵌入、（3）位置编码，再加总成最终嵌入。
		</div>

		<div class="article-subsection">
			<h3>第一步：分词（Tokenization）</h3>
			<p>
				模型真正读写的单位叫 <strong>token（词元）</strong>，不一定等于「一个英文单词」或「一个汉字」。
				它可能是完整的词、词的一块，或标点。GPT-2 使用字节对编码（BPE）一类的词表：常见词往往单独成块，少见词会被切开。
				左边分词列里，你看到的每一块，就是后面所有计算的「一个人」。
			</p>
		</div>

		<div class="article-subsection" id="article-token-embedding">
			<h3>第二步：词元嵌入</h3>
			<p>
				词表里每一个词元，都预先存着一条固定长度的向量（GPT-2 small 常见是 768 维）。分词之后，模型按编号把对应向量取出来。
				可以把它想成该词元的<strong>数字名片</strong>：训练时学来，推理时通常不再改这份查询表，只是把它取出来送进网络。
				相近意思的词，名片往往也更靠近，但现在先抓住职责：<strong>把符号变成可计算的数</strong>。
			</p>
		</div>

		<div class="article-subsection" id="article-positional-embedding">
			<h3>第三步：位置编码</h3>
			<p>
				如果只告诉模型「有哪些词」，它还分不清「The cat sat」和打乱顺序的版本。位置编码专门提供<strong>谁在前、谁在后</strong>的信息。
				GPT-2 使用可学习的位置嵌入：每个位置（第 1 个、第 2 个……）也有一条向量，和对应的词元嵌入<strong>相加</strong>。
			</p>
			<p>
				展开嵌入后，看「位置编码」那一列。它不是可有可无的装饰，而是让注意力稍后能理解顺序的前提。
			</p>
		</div>

		<div class="article-subsection">
			<h3>第四步：最终嵌入</h3>
			<p>
				最终进入第一块的向量 ≈ 词元嵌入 + 位置编码。从这里开始，每个位置带着「我是谁 + 我在哪」往下走。
			</p>
		</div>
	</div>

	<div class="article-section" data-click="article-transformer-block">
		<h2>Transformer 块：同样的工序重复多次</h2>
		<p>
			嵌入之后，向量会穿过一串结构相同的块。每一块先做注意力（跟别人交流），再做 MLP（自己再炼），并配上残差和层归一化，避免信息或数值走样。
			块与块之间，表示会变得越来越「像上下文里的这个词」，而不再只是最初那张查询表名片。界面中间可以切换不同块，观察变化，但先不必给每一块强行起外号。
		</p>
	</div>

	<div class="article-section" id="self-attention" data-click="article-attention">
		<h3>多头自注意力：该看谁？（LO4）</h3>
		<p>
			自注意力要回答：对当前位置来说，上文里哪些位置值得参考，各参考多少。它不是把句子「翻译成另一句话」，而是按权重把有用的内容混进来。
		</p>
		<div class="figure">
			<img src="./article_assets/attention.png" width="75%" alt="注意力计算示意图" />
		</div>

		<div class="figure">
			<img src="./article_assets/QKV.png" width="70%" alt="Q、K、V 三种角色示意图" />
		</div>
		<div class="article-subsection-l2">
			<h4>提问 Q、标签 K、内容 V</h4>
			<p>
				同一个位置上的向量，会通过三组不同的线性投影，变成三种角色：
			</p>
			<ul>
				<li><strong>提问 Q（Query）</strong>：我现在想找什么。</li>
				<li><strong>标签 K（Key）</strong>：我是什么索引，可供别人来对。</li>
				<li><strong>内容 V（Value）</strong>：真正被按权重取走、混合的东西。</li>
			</ul>
			<p>
				常见算法是：用 Q 去和各个位置的 K 做点积，得到一组分数；缩放并加上掩码后做 Softmax，得到权重；再用这些权重去加权求和 V。
				写成公式就是
			</p>
			<p>
				<Katex style=""
					displayMode
					math={`\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}\\left(\\frac{QK^{T}}{\\sqrt{d_{k}}}+M\\right)V`}
				/>
			</p>
			<p>
				请记住一个常被搞反的点：<strong>Q、K、V 不是句子里三个不同的词</strong>，而是同一位置向量的三种用法。被混合带走的是 V，不是 Q 自己。
			</p>
		</div>

		<div class="article-subsection-l2">
			<h4>多头：切开并行再拼回</h4>
			<p>
				GPT-2 small 通常把注意力分成 12 个头并行计算，再拼回去。多头的好处是：不同的头可以同时关注不同的模式（有的更盯近邻，有的更像在找主语或指代），而不必把所有关系塞进一次打分里。
				界面上可以切换不同的头。建议先描述「这回它在看谁」，不要急着给每一头贴永久标签。
			</p>
		</div>

		<div class="article-subsection-l2">
			<h4>因果掩码：不能偷看未来</h4>
			<p>
				生成下一个词时，当前位置<strong>不可以</strong>看见右边还没写出来的词。否则模型等于对着答案抄，就学不会「根据上文预测下文」。
				因果掩码（causal mask）发生在打分之后、Softmax 之前：未来位置的分数被挡住，对应权重接近 0。
			</p>
			<p>
				掩码<strong>不会把那些词从句子里删除</strong>。输入还在，只是计算注意力时不准用未来信息。展开注意力后，看「缩放 · 掩码」矩阵，右上角常常就是被挡住的区域。
			</p>
		</div>

		<div class="article-subsection-l2">
			<h4>输出与拼接</h4>
			<p>
				各头算完后，结果会拼在一起，再经过一层输出投影，回到模型的隐维度，然后进入残差和 MLP。
				可以点开注意力的放大镜，顺着「点积 → 缩放与掩码 → Softmax → 加权输出」把这一圈看完。
			</p>
		</div>
	</div>

	<div class="article-section" id="article-activation" data-click="article-mlp">
		<h3>前馈网络 MLP：各自再加工（LO5）</h3>
		<div class="figure">
			<img src="./article_assets/mlp.png" width="65%" alt="MLP 升维、激活与降维示意图" />
		</div>
		<p>
			注意力解决的是「跟谁交流」；MLP 解决的是「交流完，每个位置自己再炼一遍」。它对每个位置独立操作：先升维（常常升到大约 4 倍宽），经过非线性激活（本模型用 GELU），再降维回到原来的大小。
		</p>
		<p>
			如果只有线性变换，很多复杂关系学不会。GELU 这条平滑的「弯曲开关」，就是给网络加入非线性的地方。点开 MLP 的放大镜，可以看到升维权重、激活和降维权重。这些权重是训练时学来的，推理时固定，只做乘法与加法。
		</p>
	</div>

	<div class="article-section" id="article-prob" data-click="article-prob">
		<h2>概率、温度与采样（LO6）</h2>
		<p>
			最后一个 Transformer 块送出的向量，会经过输出投影（有时叫 LM Head），变成词表上每个词的<strong>原始分数</strong>，也就是 logit。
			分数高只表示相对更被看好，它还不是概率。要变成右边那一列可以比较、可以抽样的可能性，还要经过温度、可能的截断，以及 Softmax。
		</p>
		<div class="figure">
			<img src="./article_assets/softmax.png" width="70%" alt="概率、温度与采样示意图" />
		</div>
		<p>
			Softmax 把一组分数变成 0 到 1 之间的数，并且全部加起来为 1。这样「抽一个下一个词」才有明确的概率含义。
		</p>

		<p id="article-temperature" data-click="article-temperature">
			<strong>温度</strong>加在 Softmax 之前，用来缩放 logit：可以把它想成
			<Katex style="" math={`\\mathrm{softmax}(z / T)`} />。
			<strong>T = 1</strong> 时，按模型原来的分数形状走；
			<strong>T &lt; 1</strong>（比如 0.2）会放大分差，分布变尖，几乎总抽第一名，生成更确定；
			<strong>T &gt; 1</strong>（比如 1.5）会让分布变平，后面的词也有更多机会，生成更随机。
			请不要把温度说成「创造力旋钮」：它只改变分布的尖或平，并不保证写出更有文学性的句子。
			同一句输入，分别拖到大约 0.2、1.0、1.5，盯着右边前 10 名，是最值得做的对照实验。
		</p>

		<p id="article-sampling" data-click="article-sampling">
			即使有了概率，也不一定每次都选第一名。<strong>Top-k</strong> 只在概率最高的 k 个词里抽；
			<strong>Top-p</strong>（核采样）则从「累计概率刚超过 p」的最小集合里抽。
			它们是<strong>推理时的选词规则</strong>，不是训练算法本身。把温度先固定，再对比 k=5 与 k=50、或 p=0.3 与 p=0.9，就能看见候选集合如何变大或变小。
		</p>
	</div>

	<div class="article-section" data-click="article-advanced-features">
		<h2>残差、层归一化和 Dropout</h2>
		<p>这三件是搭积木时的辅助结构，不单独「想句子」，但缺了它们，深层网络很容易算不稳或把原信息冲掉。</p>
		<div class="article-subsection" id="article-ln">
			<h3>层归一化</h3>
			<p>
				把一个位置上向量的数值尺度调顺，避免数爆掉或塌掉。它不改写「这句话是什么意思」，只让后面的注意力和 MLP 更好算。
			</p>
		</div>
		<div class="article-subsection" id="article-dropout">
			<h3>Dropout</h3>
			<p>
				训练时随机关掉一部分神经元，减少死记硬背。推理生成时通常关掉。界面上的 Dropout 标记，多半是结构提示，不要把它和温度采样混为一谈。
			</p>
		</div>
		<div class="article-subsection" id="article-residual">
			<h3>残差连接</h3>
			<p>
				把子层的输入原样加回到输出上：输出 ≈ 变换结果 + 原信息。深层堆叠时，这条旁路避免有用信号被冲刷掉。界面里常能看到残差的虚线或「残差连接」字样。
			</p>
		</div>
	</div>

	<div class="article-section" data-click="article-interactive-features">
		<h1>建议你亲自做的事</h1>
		<p>论文强调：只看静态图不够，要在活的模型上做实验。左下角有「学习工作台」按钮；走完底部教练这条短路后，里面有一份可勾选的必做清单，刷新后仍会保留。至少包括：</p>
		<ol>
			<li>同一句输入，对比温度 0.2 / 1.0 / 1.5。</li>
			<li>固定温度，对比 Top-k 与 Top-p，以及不同的 k、p。</li>
			<li>改输入（换主语或加上否定），观察不同头、不同块的注意力。</li>
			<li>打开嵌入、注意力、概率三处放大镜，对照公式卡。</li>
			<li>合上书本，用自己的话复述：嵌入（词元+位置）→ 因果多头注意力 → MLP → logits → 温度/截断 → Softmax → 抽出下一个词，再接回去。</li>
		</ol>
	</div>

	<div class="article-section" data-click="article-video">
		<h2>视频导览</h2>
		<p>若想先看一遍界面操作，可以观看下面的介绍视频（英文）。看完后，请回到本页用中文书本和工作台把原理走一遍。</p>
		<div class="video">
			<iframe
				width="560"
				height="315"
				src="https://www.youtube.com/embed/ECR4oAwocjs"
				title="Transformer Explainer video"
				frameborder="0"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowfullscreen
			></iframe>
		</div>
	</div>

	<div class="article-section" data-click="article-implementation">
		<h2>这个解说工具是怎么实现的？</h2>
		<p>
			界面用 Svelte 搭建；模型侧参考了 nanoGPT 一类的 GPT-2 实现，并在浏览器里通过
			<a href="https://onnxruntime.ai/" target="_blank">ONNX Runtime</a>
			运行。分词使用与 GPT-2 兼容的词表。因此你在页面上改温度、换输入、点生成，看到的是真实的下一步推理，而不只是事先录好的动画。
			项目开源在
			<a href="https://github.com/poloclub/transformer-explainer" target="_blank">Github</a>。
		</p>
	</div>

	<div class="article-section" data-click="article-credit">
		<h2>原作者与本中文教学版</h2>
		<p>
			Transformer Explainer 由 Aeree Cho、Grace C. Kim、Alexander Karpekov、Alec Helbling、Jay Wang、Seongmin Lee、Benjamin Hoover、Polo Chau 等开发，相关论文发表于 CHI。
			本页的中文教材、教练条、学习工作台（路径、实验、术语、自测）是在原可视化之上补上的教学层，方便中文读者从入门走到能对照论文的门口。
		</p>
	</div>
</div>

<style lang="scss">
	a {
		color: theme('colors.blue.500');

		&:hover {
			color: theme('colors.blue.700');
		}
	}

	.bold-purple {
		color: theme('colors.purple.700');
		font-weight: bold;
	}

	code {
		color: theme('colors.gray.500');
		background-color: theme('colors.gray.50');
		font-family: theme('fontFamily.mono');
	}

	.q-color {
		color: theme('colors.blue.400');
	}

	.k-color {
		color: theme('colors.red.400');
	}

	.v-color {
		color: theme('colors.green.400');
	}

	.purple-color {
		color: theme('colors.purple.500');
	}

	.article-section {
		padding-bottom: 2rem;
	}
	.architecture-section {
		padding-top: 1rem;
	}
	.video-container {
		position: relative;
		padding-bottom: 56.25%; /* 16:9 aspect ratio */
		height: 0;
		overflow: hidden;
		max-width: 100%;
		background: #000;
	}

	.video-container iframe {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	#description {
		padding-bottom: 3rem;
		margin-left: auto;
		margin-right: auto;
		max-width: 78ch;
	}

	#description h1 {
		color: theme('colors.purple.700');
		font-size: 2.2rem;
		font-weight: 300;
		padding-top: 1rem;
	}

	#description h2 {
		// color: #444;
		color: theme('colors.purple.700');
		font-size: 2rem;
		font-weight: 300;
		padding-top: 1rem;
	}

	#description h3 {
		color: theme('colors.gray.700');
		font-size: 1.6rem;
		font-weight: 200;
		padding-top: 1rem;
	}

	#description h4 {
		color: theme('colors.gray.700');
		font-size: 1.6rem;
		font-weight: 200;
		padding-top: 1rem;
	}

	#description p {
		margin: 1rem 0;
	}

	#description p img {
		vertical-align: middle;
	}

	#description .figure-caption {
		font-size: 0.8rem;
		margin-top: 0.5rem;
		text-align: center;
		margin-bottom: 2rem;
	}

	#description ol {
		margin-left: 3rem;
		list-style-type: decimal;
	}

	#description li {
		margin: 0.6rem 0;
	}

	#description p,
	#description div,
	#description li {
		color: theme('colors.gray.600');
		line-height: 1.6;
	}

	#description small {
		font-size: 0.8rem;
	}

	#description ol li img {
		vertical-align: middle;
	}

	#description .video-link {
		color: theme('colors.blue.600');
		cursor: pointer;
		font-weight: normal;
		text-decoration: none;
	}

	#description ul {
		list-style-type: disc;
		margin-left: 2.5rem;
		margin-bottom: 1rem;
	}

	#description a:hover,
	#description .video-link:hover {
		text-decoration: underline;
	}

	.figure,
	.video {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
</style>
