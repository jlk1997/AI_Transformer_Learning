import { highlightElements, removeHighlightFromElements } from '~/utils/textbook';
import type { TextbookPage } from '~/utils/textbookPages';

const sels = (...s: string[]) => s.filter(Boolean);

export const musicPages: TextbookPage[] = [
	{
		id: 'music-is-sequence',
		title: '音乐也是序列',
		content: `<p><strong>这一步在干什么</strong>：主路把旋律看成一串音符：每次只生成<strong>下一个音符</strong>，接到已有旋律后面，再继续猜。这和文字课几乎同构。</p><p><strong>为什么需要它</strong>：先抓住「一步是下一个音」，你才不会把它和「一次渲染整首」或「从噪声谱图变清晰」混在一起。</p><p><strong>怎么算</strong>：左侧是条件和已经写出的音；模型给下一个音高、时值打分；按温度和 Top-k / Top-p 抽出一个，接到卷帘末尾。</p><p><strong>在界面上看哪里</strong>：看中间钢琴卷帘和任务区里的「生成下一个音符」。点一次只多一格。下面一行会说刚接上了哪个音。</p><p><strong>常见误解</strong>：不是模型先「想好情感」再演奏。它在建模序列。点一次也不是自动生成整首歌。</p><p><strong>进阶</strong>：后面会对照波形 / 音频 token 和扩散谱图。先把主路走熟。</p>`,
		on: () => {
			if (sels('.piano-roll', '.music-step-btn').length) highlightElements(sels('.piano-roll', '.music-step-btn'));
		},
		out: () => {
			if (sels('.piano-roll', '.music-step-btn').length) removeHighlightFromElements(sels('.piano-roll', '.music-step-btn'));
		},
		complete() {}
	},
	{
		id: 'notes-vs-waveform',
		title: '音符 vs 波形',
		content: `<p><strong>这一步在干什么</strong>：音符是符号：音高和时值。波形是空气振动的细采样。同一段旋律，两种表示粒度差很多。</p><p><strong>为什么需要它</strong>：如果你只看见波形，很难做「下一个音」的教学；如果只看见音符，又会忘了真实音频还要经过编解码。</p><p><strong>怎么算</strong>：卷帘用格子表示符号事件。波形则是密密的采样点。音频 token 介于两者之间：比音符碎，比原始波形粗。</p><p><strong>在界面上看哪里</strong>：主路先看卷帘。再点「音频 token」「扩散谱图」两个对照视图，体会粒度变化。</p><p><strong>常见误解</strong>：钢琴卷帘不是声波的照片。格子齐整，并不代表真实录音只有这些频率。</p><p><strong>进阶</strong>：下一页专门看音频编解码器：波形怎样变成可预测的标签。</p>`,
		on: () => {
			if (sels('.music-view', '.piano-roll').length) highlightElements(sels('.music-view', '.piano-roll'));
		},
		out: () => {
			if (sels('.music-view', '.piano-roll').length) removeHighlightFromElements(sels('.music-view', '.piano-roll'));
		},
		complete() {}
	},
	{
		id: 'audio-codec',
		title: '音频编解码器',
		content: `<p><strong>这一步在干什么</strong>：像 MusicGen 这类系统，常先把波形压成离散的音频 token，让语言模型去预测「下一个标签」，再解码回声音。</p><p><strong>为什么需要它</strong>：直接在原始波形上做自回归，序列会极长。编解码器把问题变成「还能用下一个 token 来教」。</p><p><strong>怎么算</strong>：编码器把短时频谱或波形切成标签；语言模型预测下一标签；解码器还原波形。本课用色块示意这些标签。</p><p><strong>在界面上看哪里</strong>：切到「音频 token」。每个色块对应当前旋律里的一个事件标签，比卷帘更「碎」的感觉会出来。</p><p><strong>常见误解</strong>：音频 token 不等于五线谱上的音名，也不等于 MP3 文件本身。它是为了生成而设计的中间符号。</p><p><strong>进阶</strong>：进阶可了解 EnCodec、SoundStream、AudioLM。主路我们仍用更直观的音符。</p>`,
		on: () => {
			if (sels('.music-view', '.audio-tokens').length) highlightElements(sels('.music-view', '.audio-tokens'));
		},
		out: () => {
			if (sels('.music-view', '.audio-tokens').length) removeHighlightFromElements(sels('.music-view', '.audio-tokens'));
		},
		complete() {}
	},
	{
		id: 'condition',
		title: '条件起什么作用',
		content: `<p><strong>这一步在干什么</strong>：条件告诉模型「在什么框里写」：调式、风格或文本描述。本课用大调 / 小调 / 五声作为可切换条件。</p><p><strong>为什么需要它</strong>：没有条件，下一个音只按已经写出的音来猜。有条件后，同样的开头也可能走向更亮或更暗的音。</p><p><strong>怎么算</strong>：条件会改变音阶约束：大调、小调、五声允许的音不同，于是右边的概率排行会搬家。</p><p><strong>在界面上看哪里</strong>：看左侧条件说明，并用任务区抽音旋钮里的「条件调式」切换（若还收着，先点「显示抽音旋钮」）。换条件后再生成几个音，看排行榜和旋律走向。</p><p><strong>常见误解</strong>：条件不是「情感旋钮」。小调不一定在「表达忧伤」，它主要是换了一套更可能出现的音。</p><p><strong>进阶</strong>：必做实验里有一项就是改条件，看注意力和走向是否一起变。</p>`,
		on: () => {
			if (sels('.music-condition').length) highlightElements(sels('.music-condition'));
		},
		out: () => {
			if (sels('.music-condition').length) removeHighlightFromElements(sels('.music-condition'));
		},
		complete() {}
	},
	{
		id: 'next-note',
		title: '下一个音符',
		content: `<p><strong>这一步在干什么</strong>：右边是下一个音高和时值的概率排行。模型先打分，再变成概率，再抽样。第一名不一定被抽中。</p><p><strong>为什么需要它</strong>：这是和文字课最像的一块。你会把温度、Top-k 的经验直接迁移过来。</p><p><strong>怎么算</strong>：对每个候选音高打分（音阶内加分、音程太远减分、主题重复加分），经温度和截断后变成右边的条形。时值同样有一个小分布。</p><p><strong>在界面上看哪里</strong>：看右侧排行榜，再点生成，对照「第一名」和卷帘里实际出现的音。下面的说明会写出刚抽中的音名。</p><p><strong>常见误解</strong>：条形最高 ≠ 下一步必须是它。抽样规则还在。也不要以为排行榜是「标准答案」。</p><p><strong>进阶</strong>：把温度拉到 0.2 和 1.4 各生成几次，观察第一名被抽中的频率。</p>`,
		on: () => {
			if (sels('.music-probs', '.music-step-btn').length) highlightElements(sels('.music-probs', '.music-step-btn'));
		},
		out: () => {
			if (sels('.music-probs', '.music-step-btn').length) removeHighlightFromElements(sels('.music-probs', '.music-step-btn'));
		},
		complete() {}
	},
	{
		id: 'attention-motif',
		title: '注意力看向哪',
		content: `<p><strong>这一步在干什么</strong>：写到后面时，模型仍会回头看前面的音。主题再现时，早先的同音或同动机往往更亮。</p><p><strong>为什么需要它</strong>：没有回看，就很难出现重复和呼应，长旋律会容易散。这和文字课里「看上文」是一件事。</p><p><strong>怎么算</strong>：本课用示意权重：和最近的音相同、属于开头动机、或与即将出现的音相同的位置，权重更高。卷帘里用更不透明和黄边表示。</p><p><strong>在界面上看哪里</strong>：选「带重复主题的短句」，继续生成几个音，看前面的主题音是否带黄边。左侧音符列表也会把高亮项勾出来。</p><p><strong>常见误解</strong>：亮了不等于「它在抒情」。只说明这一计算步更依赖那些位置的信息。不要给每个头贴永久标签。</p><p><strong>进阶</strong>：必做实验第 4 项就是说出注意力亮在哪些早先的音上。</p>`,
		on: () => {
			if (sels('.piano-roll', '.note-list').length) highlightElements(sels('.piano-roll', '.note-list'));
		},
		out: () => {
			if (sels('.piano-roll', '.note-list').length) removeHighlightFromElements(sels('.piano-roll', '.note-list'));
		},
		complete() {}
	},
	{
		id: 'rhythm-position',
		title: '节奏与位置',
		content: `<p><strong>这一步在干什么</strong>：时值和下一个音落在哪一拍，相当于文字课里的位置编码：没有它们，模型分不清先后和长短。</p><p><strong>为什么需要它</strong>：只知道音高、不知道长短，旋律会摊成一串无节奏的音名。位置让「小节线」有意义。</p><p><strong>怎么算</strong>：每个音有 start 和 dur（本课用 1/16 拍为单位）。右边除了音高排行，还有时值分布。卷帘的竖线是拍子参考。</p><p><strong>在界面上看哪里</strong>：看卷帘里格子的长短，以及右侧「时值」三条概率。生成时观察新音是短是长。</p><p><strong>常见误解</strong>：格子对齐不是说真实演奏没有弹性。教学里先用整齐的格子，把规则看清。</p><p><strong>进阶</strong>：更复杂的系统还会对小节、拍号、鼓点建模。先记住：位置不能省。</p>`,
		on: () => {
			if (sels('.piano-roll').length) highlightElements(sels('.piano-roll'));
		},
		out: () => {
			if (sels('.piano-roll').length) removeHighlightFromElements(sels('.piano-roll'));
		},
		complete() {}
	},
	{
		id: 'temperature-sampling',
		title: '温度与采样',
		content: `<p><strong>这一步在干什么</strong>：意外程度（温度）把分布变尖或变平；Top-k / Top-p 先截断再抽。这和文字课是同一套旋钮，只是对象换成了音。</p><p><strong>为什么需要它</strong>：要解释「为什么有时老在重复、有时突然跑调」，必须会用这两个控件做对照。</p><p><strong>怎么算</strong>：温度低（0.2）时更常抽第一名，音型更稳；温度高（1.4）时后面的音也有机会。k 很小或 p 很小时，候选集合更窄。</p><p><strong>在界面上看哪里</strong>：任务区解开后的「意外程度」和「选音方式」（可先点「显示抽音旋钮」）。改完看右边条形是否变尖或变平，再连续生成几个音来听。</p><p><strong>常见误解</strong>：温度不是情感，也不是「更有音乐性」。它只改随机性。Top-k 也不是训练算法。</p><p><strong>进阶</strong>：必做实验第 1、2 项就是温度和 Top-k 对照。请固定同一示例开头再比。</p>`,
		on: () => {
			if (sels('.music-temp', '.music-sampling', '.music-probs').length) highlightElements(sels('.music-temp', '.music-sampling', '.music-probs'));
		},
		out: () => {
			if (sels('.music-temp', '.music-sampling', '.music-probs').length) removeHighlightFromElements(sels('.music-temp', '.music-sampling', '.music-probs'));
		},
		complete() {}
	},
	{
		id: 'long-range',
		title: '长程结构',
		content: `<p><strong>这一步在干什么</strong>：好的旋律常有重复和呼应。自回归模型要靠注意力和已经写出的音，把开头的动机在后面再做一次。</p><p><strong>为什么需要它</strong>：只盯下一个音，会忽略「整句像不像一句话」。长程结构是从专家门口往研究走时最重要的观察。</p><p><strong>怎么算</strong>：当后面的音与开头动机相同或相近，注意力会更亮在早先那些位置。你可以先写出短主题，再看它会不会回来。</p><p><strong>在界面上看哪里</strong>：用「带重复主题的短句」继续往下生成，观察黄边是否反复落在开头三个音附近。</p><p><strong>常见误解</strong>：出现重复不等于模型「听懂了曲式」。它可能只是统计上喜欢回到刚见过的音型。</p><p><strong>进阶</strong>：Music Transformer 等工作专门加强长距离依赖。你可以再读它们的注意力设计。</p>`,
		on: () => {
			if (sels('.piano-roll').length) highlightElements(sels('.piano-roll'));
		},
		out: () => {
			if (sels('.piano-roll').length) removeHighlightFromElements(sels('.piano-roll'));
		},
		complete() {}
	},
	{
		id: 'read-piano-roll',
		title: '钢琴卷帘怎么读',
		content: `<p><strong>这一步在干什么</strong>：卷帘是一张「音高 × 时间」的表：越往上音越高，越往右时间越后，格子长短表示时值。</p><p><strong>为什么需要它</strong>：会读卷帘，才能把概率条和实际写出的音对上，也才能跟别人指着图讲。</p><p><strong>怎么算</strong>：找到刚刚生成的音：它应当出现在时间最右、音高对应的那一行。对照右侧第一名，看是否一致。</p><p><strong>在界面上看哪里</strong>：中间主画布。左右是音名参考，竖线是拍。已有示例音和你新生成的音颜色略有不同。点「试听当前片段」把格子变成声音，但不会自动播完整首。</p><p><strong>常见误解</strong>：卷帘不是频谱图。也不要假设越亮越好听。亮度在本课里主要用于注意力提示。</p><p><strong>进阶</strong>：试听请用短片段。教学重点是「看见一步」，不是把页面变成播放器。</p>`,
		on: () => {
			if (sels('.piano-roll', '.music-play').length) highlightElements(sels('.piano-roll', '.music-play'));
		},
		out: () => {
			if (sels('.piano-roll', '.music-play').length) removeHighlightFromElements(sels('.piano-roll', '.music-play'));
		},
		complete() {}
	},
	{
		id: 'musicgen-path',
		title: 'MusicGen 路径',
		content: `<p><strong>这一步在干什么</strong>：MusicGen 一类模型走「音频 token 自回归再解码」：先把声音变成标签，用语言模型预测下一个标签，再还原波形。</p><p><strong>为什么需要它</strong>：你会在介绍里反复看到这个名字。先把它对上已经会的「下一个 token」，再去看它的条件（文本、旋律）。</p><p><strong>怎么算</strong>：文本或旋律作为条件 → 预测音频 token 流 → 编解码器还原。本课只展示标签带，不跑原模型。</p><p><strong>在界面上看哪里</strong>：切到「音频 token」视图，把色块想像成待解码的标签流。主路仍建议回到音符卷帘做实验。</p><p><strong>常见误解</strong>：本页不是 MusicGen 官方演示，也没有下载那个大模型。它是对照用的路径图。</p><p><strong>进阶</strong>：阅读 MusicGen / AudioLM 时，先问：条件是什么？token 是哪一层？如何解码？</p>`,
		on: () => {
			if (sels('.music-view', '.audio-tokens').length) highlightElements(sels('.music-view', '.audio-tokens'));
		},
		out: () => {
			if (sels('.music-view', '.audio-tokens').length) removeHighlightFromElements(sels('.music-view', '.audio-tokens'));
		},
		complete() {}
	},
	{
		id: 'diffusion-music',
		title: '扩散做音乐',
		content: `<p><strong>这一步在干什么</strong>：也可以像图片课那样，让一张频谱从图噪声一步步变清晰，再还原成声音。这是对照章，不是本课主路。</p><p><strong>为什么需要它</strong>：你会同时听到「下一个 token」和「去噪生成音频」。先能说出一步改的是整张谱还是一个标签，就不会混。</p><p><strong>怎么算</strong>：从噪声频谱出发，按步数更新整张时频谱图。界面上用 0–8 的示意轴重放「从噪到清」。</p><p><strong>在界面上看哪里</strong>：切到「扩散谱图」，点时间轴从 0 走到 8，看结构渐渐出现。把它和「生成下一个音符」对比。</p><p><strong>常见误解</strong>：不要因为都能出声音，就说两种方法是同一件事。主按钮含义不同。</p><p><strong>进阶</strong>：对照图片课的 CFG 与步数实验，想一想：若给音频扩散加条件，听话程度会加在哪？</p>`,
		on: () => {
			if (sels('.music-view', '.spec-diff').length) highlightElements(sels('.music-view', '.spec-diff'));
		},
		out: () => {
			if (sels('.music-view', '.spec-diff').length) removeHighlightFromElements(sels('.music-view', '.spec-diff'));
		},
		complete() {}
	},
	{
		id: 'experiment-temp',
		title: '实验：温度',
		content: `<p><strong>这一步在干什么</strong>：同一主题，把意外程度调到 0.2 / 0.8 / 1.4，各往后再生成 8 个音，听重复和意外音。</p><p><strong>为什么需要它</strong>：这是把文字课的温度经验搬到音乐里的必要一步。</p><p><strong>怎么算</strong>：选一个示例并记住开头，固定选音方式，只改温度。每次可先回退到示例开头再生成 8 步。低温度更重复，高温度更容易跑出音阶外或出现跳跃。</p><p><strong>在界面上看哪里</strong>：任务区里的「意外程度」和右侧条形，再点试听。做完在工作台勾选。</p><p><strong>常见误解</strong>：不要同时改 Top-k 再下结论。也不要把「高温度更好听」当成规律。</p><p><strong>进阶</strong>：接着做 Top-k 对照，看候选集合如何变「跑调」。</p>`,
		on: () => {
			if (sels('.music-temp', '.music-probs', '.music-play').length) highlightElements(sels('.music-temp', '.music-probs', '.music-play'));
		},
		out: () => {
			if (sels('.music-temp', '.music-probs', '.music-play').length) removeHighlightFromElements(sels('.music-temp', '.music-probs', '.music-play'));
		},
		complete() {}
	},
	{
		id: 'experiment-condition',
		title: '实验：改条件',
		content: `<p><strong>这一步在干什么</strong>：只改一个条件（例如小调改大调），观察注意力和旋律走向是否变化。</p><p><strong>为什么需要它</strong>：条件是音乐课里最容易被忽略的变量。改它，等于换了「更可能出现的音集合」。</p><p><strong>怎么算</strong>：用「小调短动机」开头，先在小调里生成几个音；再把条件调式改成大调，继续生成，看排行榜是否移向更亮的音，黄边是否仍落在主题上。</p><p><strong>在界面上看哪里</strong>：任务区抽音旋钮里的「条件调式」、左侧条件区和卷帘注意力。</p><p><strong>常见误解</strong>：一次变化不能代表所有风格迁移。先保证只改这一个变量。</p><p><strong>进阶</strong>：可以再换五声条件，看「偏音」是否更少出现。</p>`,
		on: () => {
			if (sels('.music-condition', '.piano-roll').length) highlightElements(sels('.music-condition', '.piano-roll'));
		},
		out: () => {
			if (sels('.music-condition', '.piano-roll').length) removeHighlightFromElements(sels('.music-condition', '.piano-roll'));
		},
		complete() {}
	},

	{
		id: 'same-step',
		title: '同一件事：下一个音和下一个词',
		content: `<p><strong>这一步在干什么</strong>：短路里你已经看见：点一次「生成下一个音符」，卷帘会多一格，虚线「下一个」往前走。这和文字课抽出下一个词，是同一类「先走一步」。</p><p><strong>为什么需要它</strong>：只说「音乐生成很神秘」，就看不到它和猜词机共用的那一步。先对上，再谈编解码器或扩散谱图这些对照支线。</p><p><strong>怎么算</strong>：根据已经写下的音，算出下一个音高和时值的概率，再按温度和截断抽出一个。抽到的不一定是排行第一名。</p><p><strong>在界面上看哪里</strong>：看卷帘里已弹出的音、虚线下一个音，以及右边排行榜。研究门口的清单也会指到「写出下一个音」。</p><p><strong>常见误解</strong>：不要把「下一首完整的曲子」当成一步。一步只决定下一个音。</p><p><strong>进阶</strong>：把这一页和文字课生成对照着讲。教材不是入口；要动手，走进本课的研究门口。</p>`,
		on: () => {
			if (sels('.piano-roll', '.music-step-btn').length) highlightElements(sels('.piano-roll', '.music-step-btn'));
		},
		out: () => {
			if (sels('.piano-roll', '.music-step-btn').length) removeHighlightFromElements(sels('.piano-roll', '.music-step-btn'));
		},
		complete() {}
	},
	{
		id: 'sampling-not-weights',
		title: '拧旋钮不是改模型',
		content: `<p><strong>这一步在干什么</strong>：意外程度和 Top-k 只改「怎么从右边的排行里抽下一个音」，不改模型权重。这和文字课的温度是同一类旋钮，和微调课改权重不是同一件事。</p><p><strong>为什么需要它</strong>：短路末尾你已经拧过抽音旋钮。若把「更稳」理解成「模型变聪明了」，后面学微调时会把抽样和训练混在一起。</p><p><strong>怎么算</strong>：温度把概率变尖或变平，截断决定哪些音还留在候选里。权重若要跟着你的风格走，那是另一门课的事。</p><p><strong>在界面上看哪里</strong>：看抽音旋钮和右边排行榜，不要去找「训练开始」按钮——本课没有开训。</p><p><strong>常见误解</strong>：把意外程度调低，不是把模型训练得更听话，只是更常抽第一名。</p><p><strong>进阶</strong>：研究门口有一条「改抽样还是改权重」的阅读卡片。想看改权重，再走进微调课。</p>`,
		on: () => {
			if (sels('.music-temp', '.music-sampling').length) highlightElements(sels('.music-temp', '.music-sampling'));
		},
		out: () => {
			if (sels('.music-temp', '.music-sampling').length) removeHighlightFromElements(sels('.music-temp', '.music-sampling'));
		},
		complete() {}
	},
	{
		id: 'listen-is-playback',
		title: '试听只是把写下的音放出来',
		content: `<p><strong>这一步在干什么</strong>：短路里的「听一听」，放的是已经写在卷帘上的音。它不会替你决定下一个音，也不会自动把整首播完。</p><p><strong>为什么需要它</strong>：若把试听当成模型在现场作曲，就分不清「已经写下的结果」和「下一步预测」。</p><p><strong>怎么算</strong>：播放器用简易合成把音高和时值变成声音。预测发生在点「生成下一个音符」时，不发生在按下试听时。</p><p><strong>在界面上看哪里</strong>：先看卷帘格子有没有增加，再按试听。试听前后，右边排行榜不应该因为「只是播放」而换一套预测。</p><p><strong>常见误解</strong>：好听或不好听，不能单独证明抽样规则对不对。先看格子有没有按你的操作增加。</p><p><strong>进阶</strong>：把试听、生成一步、改条件三件事分开讲，再去做必做实验。</p>`,
		on: () => {
			if (sels('.music-play', '.piano-roll').length) highlightElements(sels('.music-play', '.piano-roll'));
		},
		out: () => {
			if (sels('.music-play', '.piano-roll').length) removeHighlightFromElements(sels('.music-play', '.piano-roll'));
		},
		complete() {}
	},
	{
		id: 'teaching-scale',
		title: '本课是预计算旋律',
		content: `<p><strong>这一步在干什么</strong>：卷帘上的示例和抽样规则是预先设计的，用来把「下一个音符」看懂。Music Transformer、AudioLM、MusicGen 是阅读指针，不是课内另开的工业编曲平台。</p><p><strong>为什么需要它</strong>：先承认教学尺度，才不会因为「没有装一个大模型」就以为没学会过程。</p><p><strong>怎么算</strong>：建议阅读顺序：先复习文字课的自回归与采样 → 再读带相对注意的 Music Transformer → 再读音频 token 语言模型。扩散谱图只作对照支线。</p><p><strong>在界面上看哪里</strong>：三种表示的切换、卷帘和排行榜，已经够你对照论文里的插图。短路走完后，研究门口有同一组可走进去的实验室。</p><p><strong>常见误解</strong>：不必先把所有模型跑起来。先能指着画面讲过程，再决定要不要上真模型。</p><p><strong>进阶</strong>：做完五项必做实验，试着用三分钟讲清「一段旋律是怎样一个音一个音长出来的」。</p>`,
		on: () => {
			if (sels('.music-view', '.piano-roll').length) highlightElements(sels('.music-view', '.piano-roll'));
		},
		out: () => {
			if (sels('.music-view', '.piano-roll').length) removeHighlightFromElements(sels('.music-view', '.piano-roll'));
		},
		complete() {}
	},
	{
		id: 'myths',
		title: '误解清单',
		content: `<p><strong>这一步在干什么</strong>：快速自查：这套系统是不是在「写情感」？温度是不是情感旋钮？第一名是不是必须被选中？</p><p><strong>为什么需要它</strong>：音乐最容易被加上拟人话术。教学上要守住：它在建模序列。</p><p><strong>怎么算</strong>：对着卷帘和排行榜把这几句说完：一步只下一个音；注意力回看主题；位置不能省；对照视图不是主路。</p><p><strong>在界面上看哪里</strong>：必要时回到温度、条件、卷帘和试听按钮走一遍短实验。</p><p><strong>常见误解</strong>：「模型懂悲伤」「高温度更有灵魂」「谱图扩散就是在写下一个音符」——都不准确。</p><p><strong>进阶</strong>：能讲清主路，再读最后一页的研究出口。</p>`,
		on: () => {
			if (sels('.music-step-hint').length) highlightElements(sels('.music-step-hint'));
		},
		out: () => {
			if (sels('.music-step-hint').length) removeHighlightFromElements(sels('.music-step-hint'));
		},
		complete() {}
	},
	{
		id: 'further-reading',
		title: '走向研究',
		content: `<p><strong>这一步在干什么</strong>：你已经能把「下一个音符」讲清楚，并知道音频 token 与扩散谱图是对照支线。可以开始读 Music Transformer、AudioLM、MusicGen 等工作。</p><p><strong>为什么需要它</strong>：研究入口需要你先会做温度 / 条件对照，并能指着卷帘讲注意力。短路走完后，本课的研究门口也有同一组可走进去的实验室，不必把书库当入口。</p><p><strong>怎么算</strong>：建议：先复习文字课的自回归与采样 → 再读带相对注意的 Music Transformer → 再读音频 token 语言模型。扩散音频作为对照。</p><p><strong>在界面上看哪里</strong>：工作台路径第三层和文底长文有同样的出口说明。</p><p><strong>常见误解</strong>：不必先把所有模型跑起来。先能讲过程，再决定要不要上真模型。</p><p><strong>进阶</strong>：做完五项必做实验，试着用 3 分钟给别人讲「一段旋律是怎样一个音一个音长出来的」。</p>`,
		on: () => {
			if (sels('.music-view').length) highlightElements(sels('.music-view'));
		},
		out: () => {
			if (sels('.music-view').length) removeHighlightFromElements(sels('.music-view'));
		},
		complete() {}
	}
];
