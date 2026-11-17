import { highlightElements, removeHighlightFromElements } from '~/utils/textbook';
import type { TextbookPage } from '~/utils/textbookPages';

const sels = (...s: string[]) => s.filter(Boolean);

export const imagePages: TextbookPage[] = [
	{
		id: 'image-is-a-process',
		title: '图不是一笔画完',
		content: `<p><strong>这一步在干什么</strong>：图片生成是一个<strong>过程</strong>：从一张噪声潜图出发，一步一步变清楚，最后才变成你看见的像素图。主按钮是「再去噪一步」，不是一键出成品就结束。</p><p><strong>为什么需要它</strong>：如果只给一张最终图，你只能记住结果，看不到噪声、条件、步数各自起了什么作用。把过程摊开，才能做对照实验。</p><p><strong>怎么算</strong>：先准备一张随机噪声（由起点编号决定），再按时间表反复「预测并减去一点噪声」。走完设定的步数后，用解码器把潜图变成像素。</p><p><strong>在界面上看哪里</strong>：看中间主画布和步数轴。第 0 步几乎全是噪点；往后点「再去噪一步」，或拖步数轴，看图一点点变清。下面一行字会告诉你「这一步变了什么」。</p><p><strong>常见误解</strong>：「模型在脑子里想好画面再画出来」不准确。它是在按规则改一张充满噪声的数字图。也不是点一次就只能看到成品。</p><p><strong>进阶</strong>：后面会讲潜空间、CFG 和调度器。先建立直觉：生成 = 逐步去噪的过程。</p>`,
		on: () => {
			if (sels('.image-canvas', '.image-timeline').length) highlightElements(sels('.image-canvas', '.image-timeline'));
		},
		out: () => {
			if (sels('.image-canvas', '.image-timeline').length) removeHighlightFromElements(sels('.image-canvas', '.image-timeline'));
		},
		complete() {}
	},
	{
		id: 'two-routes',
		title: '两条路线',
		content: `<p><strong>这一步在干什么</strong>：今天常见两条路：一条是<strong>潜在扩散</strong>（本课主路，每次改整张潜图）；一条是<strong>图像 token 自回归</strong>（按块填充，更像「下一个词」）。</p><p><strong>为什么需要它</strong>：只学其中一条，容易把「所有生成都是抽下一个词」或「所有生成都是去噪」说绝对。对照之后，再读论文不会混。</p><p><strong>怎么算</strong>：扩散：条件 + 噪声 → 多步去噪 → 解码。自回归：把图切成小块标签，每次预测下一块，再拼回去。</p><p><strong>在界面上看哪里</strong>：点任务区里的「潜在扩散 / 图像 token 自回归」切换。切到自回归时，中间变成格子画布，右边变成「下一块」的概率。</p><p><strong>常见误解</strong>：不要以为两条路只是界面皮肤不同。它们的「一步」含义完全不一样：一个改整张图，一个只决定下一块。</p><p><strong>进阶</strong>：主路先把扩散走熟。第 12 页会专门对照图像 token。</p>`,
		on: () => {
			if (sels('.mode-switch').length) highlightElements(sels('.mode-switch'));
		},
		out: () => {
			if (sels('.mode-switch').length) removeHighlightFromElements(sels('.mode-switch'));
		},
		complete() {}
	},
	{
		id: 'prompt-as-condition',
		title: '提示词变成条件',
		content: `<p><strong>这一步在干什么</strong>：你输入的提示词不会直接变成图。它会先被编成一条文本向量，当作<strong>条件</strong>，去引导去噪网络。界面上还能看到「无条件」（空提示）那一条。</p><p><strong>为什么需要它</strong>：没有条件，去噪只知道「变清楚」，不知道要变出帆船还是茶杯。有条件和无条件两条路，后面的听话程度才有东西可拉。</p><p><strong>怎么算</strong>：文本编码器（课里用 CLIP 一类的示意）把句子变成向量。去噪时同时看「有提示」和「没提示」的预测，再用 CFG 把它们组合。</p><p><strong>在界面上看哪里</strong>：看左侧提示词、英文原句，以及「有条件 / 无条件」两条彩色向量条。换一个示例提示词，有条件那条会变。</p><p><strong>常见误解</strong>：提示词不是「已经画好的草图」，也不是魔法咒语。它只是条件；听不听还取决于 CFG、步数和这道题难不难。</p><p><strong>进阶</strong>：真正的 CLIP 文本塔还有 tokenizer 和多层注意力。这里先抓住职责：句子 → 条件向量。</p>`,
		on: () => {
			if (sels('.image-prompt', '.clip-condition').length) highlightElements(sels('.image-prompt', '.clip-condition'));
		},
		out: () => {
			if (sels('.image-prompt', '.clip-condition').length) removeHighlightFromElements(sels('.image-prompt', '.clip-condition'));
		},
		complete() {}
	},
	{
		id: 'why-latent',
		title: '为什么用潜空间',
		content: `<p><strong>这一步在干什么</strong>：稳定扩散一类模型不直接在每个像素上慢慢去噪，而在更小的<strong>潜空间</strong>里算，算完再用 VAE 解码成图。</p><p><strong>为什么需要它</strong>：像素图又大又细，逐步去噪会又慢又贵。压缩后再算，能把算力用在「结构对不对」上。</p><p><strong>怎么算</strong>：编码器把图压成更小的潜变量；扩散过程发生在潜变量上；解码器再把它放大成像素。本课中间画布显示的是「潜图被解码后你能看懂的样子」。</p><p><strong>在界面上看哪里</strong>：中间是当前步的画面；右侧「VAE 解码」给出走完全部步之后的清晰成品，方便对照「还在去噪的潜图」和「解码后的图」。</p><p><strong>常见误解</strong>：潜空间不是一个神秘的小房间，只是更短的数字名片。也不要说「模型不看像素所以不懂颜色」——解码后颜色仍然来自这些数。</p><p><strong>进阶</strong>：压缩会丢掉一部分细节，这也是有些小字、人脸容易糊的原因之一。第 10 页还会回到 VAE。</p>`,
		on: () => {
			if (sels('.image-canvas', '.vae-panel').length) highlightElements(sels('.image-canvas', '.vae-panel'));
		},
		out: () => {
			if (sels('.image-canvas', '.vae-panel').length) removeHighlightFromElements(sels('.image-canvas', '.vae-panel'));
		},
		complete() {}
	},
	{
		id: 'noise-and-timesteps',
		title: '噪声与时间步',
		content: `<p><strong>这一步在干什么</strong>：训练时，系统会给干净图按时间表加噪声（前向过程）。生成时反过来：从纯噪声走到干净图。每一步对应时间表上的一个点。</p><p><strong>为什么需要它</strong>：没有这张时间表，网络就不知道「现在噪声还剩多少」。步数太少，等于跳着走，细节来不及长出来。</p><p><strong>怎么算</strong>：起点编号（种子）决定初始噪声。总步数决定把时间表切成几段。当前步数越大，残留噪声通常越少。</p><p><strong>在界面上看哪里</strong>：看中间步数轴：第 0 步最噪，最后一步最清。换起点编号，初始噪声花纹会变，后面的构图也会略有不同。</p><p><strong>常见误解</strong>：噪声不是「随便糊一点脏东西」，而是有预算的随机数。也不是步数越多就一定「更有艺术感」，只是通常更清楚、更稳。</p><p><strong>进阶</strong>：调度器决定步长怎么分配，不一定均匀。下一页看「去噪一步」到底改了什么。</p>`,
		on: () => {
			if (sels('.image-timeline', '.seed-control').length) highlightElements(sels('.image-timeline', '.seed-control'));
		},
		out: () => {
			if (sels('.image-timeline', '.seed-control').length) removeHighlightFromElements(sels('.image-timeline', '.seed-control'));
		},
		complete() {}
	},
	{
		id: 'denoise-one-step',
		title: '去噪一步在算什么',
		content: `<p><strong>这一步在干什么</strong>：按一次主按钮，去噪网络根据当前潜图、当前时间步和文本条件，预测噪声（或预测更干净的图），再按调度器更新整张潜图。</p><p><strong>为什么需要它</strong>：只有看懂「一步」改的是整张图，你才不会把它和「下一个词 / 下一块像素」混为一谈。</p><p><strong>怎么算</strong>：可以想像：网络先猜「这些颗粒里哪些是噪声」，把它减掉一点。减多减少由调度器和当前步决定。CFG 会左右它更信提示词还是更信无条件的预测。</p><p><strong>在界面上看哪里</strong>：点「再去噪一步」，盯中间画布和下面的「这一步变了什么」。右侧「本步预测的噪声」是当前图和下一步之间的差分示意。也可以「一次播完全部步骤」，随时暂停或回退。</p><p><strong>常见误解</strong>：去噪一步不是只改一个像素，也不是已经把整张图画完。播放全部步骤只是自动连点，过程仍然可以拆开看。</p><p><strong>进阶</strong>：本课用的是示意轨迹，但控件会真的改结果。后面可对照 U-Net / DiT 论文，看网络结构。</p>`,
		on: () => {
			if (sels('.denoise-button', '.image-canvas', '.noise-pred', '.step-hint').length) highlightElements(sels('.denoise-button', '.image-canvas', '.noise-pred', '.step-hint'));
		},
		out: () => {
			if (sels('.denoise-button', '.image-canvas', '.noise-pred', '.step-hint').length) removeHighlightFromElements(sels('.denoise-button', '.image-canvas', '.noise-pred', '.step-hint'));
		},
		complete() {}
	},
	{
		id: 'scheduler',
		title: '调度器',
		content: `<p><strong>这一步在干什么</strong>：调度器决定每一步在时间表上迈多大。有的步长比较均匀（Euler），有的会前快后慢或相反（如 DDIM 一类）。</p><p><strong>为什么需要它</strong>：同样 20 步，步长分配不同，中途画面就不一样：有的更早露出轮廓，有的前面长时间还很糊。</p><p><strong>怎么算</strong>：把 0 到 1 的进度用不同曲线切开。生成时每一步用当前的步长去更新潜图。本课的 Euler / DDIM 是教学示意，用来看中途差异。</p><p><strong>在界面上看哪里</strong>：在任务区改「调度器」，固定提示词、种子、步数和 CFG，只看中间过程是否提前变清。结束画面通常更接近，中途差别更明显。</p><p><strong>常见误解</strong>：调度器不是滤镜，也不是「画风按钮」。它不管你画帆船还是茶杯，只管怎么走完这些步。</p><p><strong>进阶</strong>：真实系统还有更多调度器（DPM Solver 等）。读论文时先问：它改的是时间表，还是网络本身？</p>`,
		on: () => {
			if (sels('.scheduler-control', '.image-timeline').length) highlightElements(sels('.scheduler-control', '.image-timeline'));
		},
		out: () => {
			if (sels('.scheduler-control', '.image-timeline').length) removeHighlightFromElements(sels('.scheduler-control', '.image-timeline'));
		},
		complete() {}
	},
	{
		id: 'cfg',
		title: 'CFG 引导：听话程度',
		content: `<p><strong>这一步在干什么</strong>：CFG（Classifier-Free Guidance）就是界面上的<strong>听话程度</strong>。它把「有条件」和「无条件」两条预测拉开：越高越贴提示词，太高也可能把图毁掉。</p><p><strong>为什么需要它</strong>：只靠条件，模型有时会偏「普通、常见」的图。CFG 把条件方向加得更用力，是今天文生图最常用的旋钮之一。</p><p><strong>怎么算</strong>：示意公式：结果 ≈ 无条件预测 + CFG ×（有条件 − 无条件）。CFG=1 几乎不强调提示词；7 左右常比较稳；15 往往过饱和、结构夸张。</p><p><strong>在界面上看哪里</strong>：拖任务区里的「听话程度」滑条。右侧三张缩略图是同一提示词、同一种子，在 CFG 1 / 7 / 15 下的对照。请真的看：1 更淡、更泛，15 更冲。</p><p><strong>常见误解</strong>：CFG 不是温度，也不是「创造力」。温度改的是抽样分布的尖或平；CFG 改的是条件被强调多少。不要说「CFG 越高越有艺术感」。</p><p><strong>进阶</strong>：必做实验第一项就是 CFG 1 / 7 / 15 对照。这是图片课最重要的旋钮。</p>`,
		on: () => {
			if (sels('.cfg-control', '.cfg-compare').length) highlightElements(sels('.cfg-control', '.cfg-compare'));
		},
		out: () => {
			if (sels('.cfg-control', '.cfg-compare').length) removeHighlightFromElements(sels('.cfg-control', '.cfg-compare'));
		},
		complete() {}
	},
	{
		id: 'seed',
		title: '种子：起点编号',
		content: `<p><strong>这一步在干什么</strong>：种子（起点编号）决定初始噪声。相同提示词、相同控件、相同起点编号，画面应当能重现；换一个编号，构图就会变。</p><p><strong>为什么需要它</strong>：做实验必须能「只改一个变量」。没有可重现的起点，你就分不清变化来自 CFG 还是来自运气。</p><p><strong>怎么算</strong>：起点编号被送进随机数发生器，得到初始噪声场。后续每一步都从这个场出发，所以它会一路影响构图。</p><p><strong>在界面上看哪里</strong>：改任务区里的「起点编号」，观察第 0 步的噪声花纹和成品构图是否一起变。先固定种子，再去改提示词或 CFG。</p><p><strong>常见误解</strong>：种子不是密码，也不是「命运编号」。它只是随机起点。同一种子在不同模型或不同步数设定下，不必长得一模一样。</p><p><strong>进阶</strong>：研究里常用固定种子做消融。你会在第 15、16 页的实验里反复用到它。</p>`,
		on: () => {
			if (sels('.seed-control', '.image-canvas').length) highlightElements(sels('.seed-control', '.image-canvas'));
		},
		out: () => {
			if (sels('.seed-control', '.image-canvas').length) removeHighlightFromElements(sels('.seed-control', '.image-canvas'));
		},
		complete() {}
	},
	{
		id: 'vae-decode',
		title: 'VAE 解码',
		content: `<p><strong>这一步在干什么</strong>：VAE 负责「压进去」和「展出来」：扩散在潜空间里算完后，解码器把潜变量变成像素图。</p><p><strong>为什么需要它</strong>：如果没有解码，你只能对着一堆压缩数字发呆。解码让过程变得可看；它也解释了为什么有时小字、细边会糊。</p><p><strong>怎么算</strong>：编码器压缩，解码器重建。本课右侧「VAE 解码」展示走完全部去噪步之后的清晰成品，和中间「当前步」对照。</p><p><strong>在界面上看哪里</strong>：看右侧 VAE 面板，再和中间当前步比较：步数还少时，两边差得很远；走到最后，两边会靠近。</p><p><strong>常见误解</strong>：VAE 不是去噪网络，也不写提示词。它不负责「想出帆船」，只负责把算完的潜变量变成图。</p><p><strong>进阶</strong>：真实 VAE 还有 KL 正则等训练细节。先记住分工：扩散改潜图，VAE 负责看见它。</p>`,
		on: () => {
			if (sels('.vae-panel', '.image-canvas').length) highlightElements(sels('.vae-panel', '.image-canvas'));
		},
		out: () => {
			if (sels('.vae-panel', '.image-canvas').length) removeHighlightFromElements(sels('.vae-panel', '.image-canvas'));
		},
		complete() {}
	},
	{
		id: 'unet-dit',
		title: 'U-Net 与 DiT',
		content: `<p><strong>这一步在干什么</strong>：去噪网络可以是 U-Net，也可以是 DiT（用 Transformer 搭的扩散骨干）。它们要做的事一样：根据潜图、时间步和条件，预测这一步该怎么改。</p><p><strong>为什么需要它</strong>：你会在论文里同时碰到这两个名字。先知道它们是「同一岗位的两种骨架」，再去记结构图。</p><p><strong>怎么算</strong>：U-Net 用下采样 / 上采样和跳连来处理不同尺度；DiT 把潜图切成块，用 Transformer 做注意力，再预测噪声。条件（文本）通过交叉注意力或调制加进去。</p><p><strong>在界面上看哪里</strong>：本课不展开网络内部每一层。看中间逐步变清，就知道这个网络每步都在工作；提示词的影响来自条件注入。</p><p><strong>常见误解</strong>：不是「有了 Transformer 就不是扩散了」。DiT 仍是扩散模型，只是骨干换成了 Transformer。</p><p><strong>进阶</strong>：想做研究可对照 U-Net 版 Stable Diffusion 和 DiT / SD3 一类工作。先问：条件怎么进去，预测目标是噪声还是干净图。</p>`,
		on: () => {
			if (sels('.image-canvas').length) highlightElements(sels('.image-canvas'));
		},
		out: () => {
			if (sels('.image-canvas').length) removeHighlightFromElements(sels('.image-canvas'));
		},
		complete() {}
	},
	{
		id: 'image-tokens',
		title: '图像 token 对照',
		content: `<p><strong>这一步在干什么</strong>：把图画成一串离散标签，再像 GPT 一样预测「下一块」，就是图像 token 自回归。主按钮变成「填下一块」，右边是下一块的概率。</p><p><strong>为什么需要它</strong>：这条路和文字课几乎同构，能帮你分清「整图去噪」和「逐块生成」。很多新模型两条思路都会借鉴。</p><p><strong>怎么算</strong>：画布被切成格子（本课 4×4）。每一步根据已填的块和提示词，给「天空 / 海面 / 船帆……」这类块标签打分，再抽一个填上。</p><p><strong>在界面上看哪里</strong>：切到「图像 token 自回归」。点主按钮（或继续点「再去噪一步」这个位置的推进按钮），看格子一块块出现，右边概率条在变。</p><p><strong>常见误解</strong>：不要说「所以扩散其实也是在写下一个词」。主路扩散一步改的是整张潜图。也不要给每个格子强行编故事。</p><p><strong>进阶</strong>：必做实验第 5 项就是用自己的话讲清两条路的差别。进阶可了解 VQGAN、Lumina、自回归图像等方向。</p>`,
		on: () => {
			if (sels('.mode-switch', '.ar-canvas', '.ar-probs').length) highlightElements(sels('.mode-switch', '.ar-canvas', '.ar-probs'));
		},
		out: () => {
			if (sels('.mode-switch', '.ar-canvas', '.ar-probs').length) removeHighlightFromElements(sels('.mode-switch', '.ar-canvas', '.ar-probs'));
		},
		complete() {}
	},
	{
		id: 'cross-attention',
		title: '跨模态注意力',
		content: `<p><strong>这一步在干什么</strong>：文本条件常常通过交叉注意力进到去噪网络：图像侧的位置去「看」提示词里的词，于是「red sailboat」才会对上红色三角帆。</p><p><strong>为什么需要它</strong>：没有这种对齐，条件只是一串无关的数。有了它，你才能解释「改一个词，画面哪一块会动」。</p><p><strong>怎么算</strong>：查询来自图像块，键值来自文本 token。权重高的位置，更多用到对应词的信息。本课用示意，不画完整热力图。</p><p><strong>在界面上看哪里</strong>：固定种子，只改提示词里的一个词（例如把 red 改成别的示例），观察主体颜色或物件是否移动。左侧条件向量也会变。</p><p><strong>常见误解</strong>：不是每个注意力头都对应一个单词，也不要指望界面上每个像素都标出它在看哪个词。先描述「改了什么、哪里变了」。</p><p><strong>进阶</strong>：论文里的交叉注意力可视化是常见分析手段。做实验时请固定种子。</p>`,
		on: () => {
			if (sels('.clip-condition', '.image-canvas').length) highlightElements(sels('.clip-condition', '.image-canvas'));
		},
		out: () => {
			if (sels('.clip-condition', '.image-canvas').length) removeHighlightFromElements(sels('.clip-condition', '.image-canvas'));
		},
		complete() {}
	},
	{
		id: 'failure-cases',
		title: '常见失败',
		content: `<p><strong>这一步在干什么</strong>：文生图会失败：崩结构、文字乱、不听话、过饱和、步数太少导致发糊。这些不是「模型生气了」，是旋钮和能力边界。</p><p><strong>为什么需要它</strong>：会看失败，才知道实验该怎么设，也不会把偶然一次好看的图当成普遍规律。</p><p><strong>怎么算</strong>：CFG 太高（如 15）容易过饱和、结构夸张；步数太少（如 4）残留噪声多、细节差；提示词含精细小字时，潜空间解码也容易乱。</p><p><strong>在界面上看哪里</strong>：把 CFG 拉到 15 看「毁掉」的倾向；把总步数调到 4 看粗糙成品；再回到 CFG 7、20 步对比。右侧缩略图可并排看。</p><p><strong>常见误解</strong>：失败不等于「提示词没写对魔法格式」。先排查种子、CFG、步数是不是只改了一个变量。</p><p><strong>进阶</strong>：真实系统还有负面提示词、修复算法等。本课先用对照看清失败从哪来。</p>`,
		on: () => {
			if (sels('.cfg-compare', '.cfg-control', '.steps-control').length) highlightElements(sels('.cfg-compare', '.cfg-control', '.steps-control'));
		},
		out: () => {
			if (sels('.cfg-compare', '.cfg-control', '.steps-control').length) removeHighlightFromElements(sels('.cfg-compare', '.cfg-control', '.steps-control'));
		},
		complete() {}
	},
	{
		id: 'experiment-cfg',
		title: '实验：CFG',
		content: `<p><strong>这一步在干什么</strong>：这是必做实验：同一提示词、同一起点编号，只改听话程度，取 1 / 7 / 15，看图是更贴题还是被毁掉。</p><p><strong>为什么需要它</strong>：这是把 CFG 从名词变成经验的唯一办法。口头背公式，不如三张图并排看。</p><p><strong>怎么算</strong>：选一个示例，固定种子和步数（建议 20），把 CFG 依次调到 1、7、15，每次走到可比较的一步（或看右侧对照缩略图）。记下主体是否更贴提示词、颜色是否过火。</p><p><strong>在界面上看哪里</strong>：任务区里的 CFG 滑条和右侧三张对照缩略图。做完后可在学习工作台勾选「我做过了」。</p><p><strong>常见误解</strong>：不要同时改种子再下结论。也不要把「CFG=15 更好看」当成普遍规律。</p><p><strong>进阶</strong>：写下一句你自己的观察，再去做步数实验。</p>`,
		on: () => {
			if (sels('.cfg-control', '.cfg-compare', '.seed-control').length) highlightElements(sels('.cfg-control', '.cfg-compare', '.seed-control'));
		},
		out: () => {
			if (sels('.cfg-control', '.cfg-compare', '.seed-control').length) removeHighlightFromElements(sels('.cfg-control', '.cfg-compare', '.seed-control'));
		},
		complete() {}
	},
	{
		id: 'experiment-steps',
		title: '实验：步数',
		content: `<p><strong>这一步在干什么</strong>：同一提示词和种子，把总步数设为 4 / 20 / 50，比较清晰度和细节。</p><p><strong>为什么需要它</strong>：步数是第二常用的旋钮。很多人以为「越多越强」，需要亲眼看收益是否还在变大。</p><p><strong>怎么算</strong>：固定 CFG=7 和种子，分别选 4、20、50 步并走到最后。4 步通常更糊、更噪；20 步已经能认；50 步更干净，但和 20 步的差距未必有 4 到 20 那么大。</p><p><strong>在界面上看哪里</strong>：任务区里的「总步数」和下方步数轴。走完后看中间成品，以及「这一步变了什么」里对残留颗粒的提示。</p><p><strong>常见误解</strong>：不是步数越多越有创意，也不是 50 步就一定「更像大师」。它主要影响清楚和稳定。</p><p><strong>进阶</strong>：可再把调度器换一下，看中途而不是终点的差别。</p>`,
		on: () => {
			if (sels('.steps-control', '.image-timeline', '.image-canvas').length) highlightElements(sels('.steps-control', '.image-timeline', '.image-canvas'));
		},
		out: () => {
			if (sels('.steps-control', '.image-timeline', '.image-canvas').length) removeHighlightFromElements(sels('.steps-control', '.image-timeline', '.image-canvas'));
		},
		complete() {}
	},

	{
		id: 'same-step',
		title: '同一件事：再去噪一步',
		content: `<p><strong>这一步在干什么</strong>：短路里你已经看见：点一次「再去噪一步」，画布会变清一点。文字课抽出下一个词、音乐课接上下一个音，要你先看见的也是「走一步」。对象不同，但教学顺序相同。</p><p><strong>为什么需要它</strong>：若把三条路说成同一种计算，后面读论文时会混。先承认「一步」的含义不同：去噪改整张潜图，词和音是补上下一个符号。</p><p><strong>怎么算</strong>：扩散的一步是按时间表减去一点预测噪声；自回归的一步是从概率里抽出下一个符号。不必在这里把公式背下来，先能指着画面讲清差别。</p><p><strong>在界面上看哪里</strong>：回到主画布和「再去噪一步」。若切到图像 token，右边变成「下一块」的概率，那条路才更像文字课。短路走完后，研究门口的实验室清单也会指向这两处。</p><p><strong>常见误解</strong>：「都是生成，所以每一步都在猜下一个词」不准确。主路去噪不是补一块像素标签。</p><p><strong>进阶</strong>：把这一页和文字课的生成、音乐课的下一个音对照着讲。教材不是入口；想动手对照，走进本课的研究门口。</p>`,
		on: () => {
			if (sels('.denoise-button', '.image-canvas').length) highlightElements(sels('.denoise-button', '.image-canvas'));
		},
		out: () => {
			if (sels('.denoise-button', '.image-canvas').length) removeHighlightFromElements(sels('.denoise-button', '.image-canvas'));
		},
		complete() {}
	},
	{
		id: 'flow-dit-door',
		title: 'Flow Matching 与 DiT：门口怎么读',
		content: `<p><strong>这一步在干什么</strong>：你已经在界面上见过 U-Net / DiT 对照，也见过按时间表走的去噪。Flow Matching、更新的 DiT 论文，是阅读指针，不是课内要装的大检查点。</p><p><strong>为什么需要它</strong>：工具课只能带到专家门口。先守住已经看见的现象：条件、噪声、一步更新、解码、CFG、种子，再去读新名字，才不会被型号清单带走。</p><p><strong>怎么算</strong>：可以把阅读顺序想成：潜在扩散与 CFG → 调度器 → DiT 或 Flow Matching。课内仍用预计算轨迹示意「一步怎么走」，不会下载 600MB 权重。</p><p><strong>在界面上看哪里</strong>：第 11 页的 U-Net 与 DiT、第 8 页的 CFG、时间轴上的一步，已经够你对照论文插图。短路走完后，点「走进研究门口」会看到同一组实验室，不必把书库当入口。</p><p><strong>常见误解</strong>：不必先把最新模型跑起来才算学会。没有大检查点，不等于没看见过程。</p><p><strong>进阶</strong>：做完必做实验，试着用三分钟讲清「一张图是怎么从噪声里走出来的」，再去打开论文。</p>`,
		on: () => {
			if (sels('.image-canvas', '.image-timeline').length) highlightElements(sels('.image-canvas', '.image-timeline'));
		},
		out: () => {
			if (sels('.image-canvas', '.image-timeline').length) removeHighlightFromElements(sels('.image-canvas', '.image-timeline'));
		},
		complete() {}
	},
	{
		id: 'myths',
		title: '误解清单',
		content: `<p><strong>这一步在干什么</strong>：把最常见的误解收在一页，方便你合上书以前快速自查。</p><p><strong>为什么需要它</strong>：生成模型的话术很多。先能用大白话说「一步在改什么」，比会用时髦词更重要。</p><p><strong>怎么算</strong>：对着清单逐条看：是不是把 CFG 叫成温度？是不是以为一步只改一个像素？是不是把种子当成密码？是不是觉得提示词等于已经画完？</p><p><strong>在界面上看哪里</strong>：不必盯某个控件。必要时回到 CFG 滑条、步数轴、模式切换和主画布走一遍对照。</p><p><strong>常见误解</strong>：「模型在想象」「CFG 是创造力」「扩散就是 GPT 抽下一个词」——这三句都不准确。</p><p><strong>进阶</strong>：能用自己的话讲清主路，就可以进最后一页看研究方向，并去做工作台里还没勾的实验。</p>`,
		on: () => {
			if (sels('.step-hint').length) highlightElements(sels('.step-hint'));
		},
		out: () => {
			if (sels('.step-hint').length) removeHighlightFromElements(sels('.step-hint'));
		},
		complete() {}
	},
	{
		id: 'further-reading',
		title: '走向研究',
		content: `<p><strong>这一步在干什么</strong>：到这里，你已经能把潜在扩散的主路讲清楚，并知道还有一条自回归图像的对照路。接下来可以读更靠近研究的材料。</p><p><strong>为什么需要它</strong>：工具课只能带你到专家门口：会做对照、会讲过程、能把论文里的名词对上界面。短路走完后，本课的研究门口也有同一组可走进去的实验室，不必把书库当入口。</p><p><strong>怎么算</strong>：建议阅读顺序：Stable Diffusion / 潜在扩散论文 → CFG → 调度器 → DiT 或更新的 Flow Matching、SDXL。自回归图像作为对照支线。</p><p><strong>在界面上看哪里</strong>：学习工作台的「学习路径」第三层也写了同样的出口。文底还有一篇按这个结构写成的中文长文。</p><p><strong>常见误解</strong>：不必一上来就追最新模型名字。先守住：条件、噪声、一步更新、解码、CFG、种子。</p><p><strong>进阶</strong>：做完五项必做实验，试着给别人讲 3 分钟「一张图是怎么从噪声里走出来的」。</p>`,
		on: () => {
			if (sels('.mode-switch').length) highlightElements(sels('.mode-switch'));
		},
		out: () => {
			if (sels('.mode-switch').length) removeHighlightFromElements(sels('.mode-switch'));
		},
		complete() {}
	}
];
