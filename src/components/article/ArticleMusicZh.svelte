<script lang="ts">
	import { locale } from '~/i18n';
	$: zh = $locale !== 'en';
</script>

<article class="course-article">
	{#if zh}
		<h1>音乐是怎么一个音一个音接上去的</h1>
		<p class="lead">
			这篇文章配合顶部「音乐」课使用。主路和文字课几乎同构：每次只生成下一个音符，接到已有旋律后面再猜。中间是钢琴卷帘，右边是下一个音高和时值的概率排行。试听只放当前片段，不会自动把整首播完。这里用的是预先设计的示例旋律和采样规则，用来把流程看懂。
		</p>
		<p class="note">建议先走完底部教练条，再翻紫色 16 步教材，最后做工作台实验和自测。没有分数，也没有积分。</p>

		<h2 id="article-music-is-sequence">音乐也是序列</h2>
		<p>主路把旋律看成一串事件。已经写出的音是上文，下一步只问：下一个音是什么。这和「生成下一个词」是同一类问题。</p>

		<h2 id="article-notes-vs-waveform">音符和波形不是同一层</h2>
		<p>音符是音高加时值，是符号。波形是空气振动的细采样，细得多。本课主路走符号；后面会对照更碎的音频 token，以及整张谱图上的扩散。</p>

		<h2 id="article-audio-codec">音频编解码器</h2>
		<p>一些系统先把声音压成离散标签，再在标签上做自回归，最后解码回波形。可以把它想成声音世界里的「分词器」。本课只展示示意色块，不下载大模型。</p>

		<h2 id="article-condition">条件起什么作用</h2>
		<p>大调、小调、五声这些条件，会改变哪些音更可能出现。它们不是「写伤感」的旋钮。实验时请只改一个条件，例如把小调换成大调，再看排行榜和后面几个音。</p>

		<h2 id="article-next-note">下一个音符</h2>
		<p>模型（在本课里是可解释的示例规则）根据条件和已有音，给出下一个音高和时值的分布，再按温度和 Top-k / Top-p 抽样。右边第一名不一定被选中。每按一次，卷帘只多一格。</p>

		<h2 id="article-attention-motif">注意力看向哪</h2>
		<p>写后面的音时，计算会回看前面的音。黄边表示更被依赖的位置。若你选了带重复主题的示例，常常会看到开头的动机被点亮。这是依赖关系，不是情感标签。</p>

		<h2 id="article-rhythm-position">节奏与位置</h2>
		<p>没有起点和时值，旋律会摊成一串音名。这和文字课的位置编码是同一类问题：顺序本身携带信息。卷帘上的格子长短，就是在画这件事。</p>

		<h2 id="article-temperature-sampling">意外程度与采样</h2>
		<p>温度让分布变尖或变平：0.2 更常抽第一名，音型更稳；1.4 更容易出现意外音。Top-k / Top-p 是抽样前截断候选的规则，不是训练算法。温度不是情感旋钮。</p>

		<h2 id="article-long-range">长程结构</h2>
		<p>短句可以只看最近几个音；完整旋律还要照顾重复和呼应。注意力回看主题，就是在为这种结构提供一个看得见的把手。</p>

		<h2 id="article-read-piano-roll">钢琴卷帘怎么读</h2>
		<p>竖轴是音高，横轴是时间。越往上越高，越往右越后。试听可以把格子变成声音，但请自己决定听哪一段，系统不会自动播完整首。</p>

		<h2 id="article-musicgen-path">MusicGen 一类路径</h2>
		<p>一条常见路线是：在音频 token 上自回归，再解码回波形。切到「音频 token」视图，只为对照粒度，不必把它当成主路。</p>

		<h2 id="article-diffusion-music">扩散做音乐</h2>
		<p>另一条路是让整张频谱从噪声变清，一步改的是整张谱，而不是下一个音符。打开「扩散谱图」看一眼，是为了分清「一步」的含义。</p>

		<h2 id="article-experiment-temp">实验：温度</h2>
		<p>同一示例开头，分别用 0.2、0.8、1.4 再生成约 8 个音，必要时试听。先描述重复和意外，再下结论。</p>

		<h2 id="article-experiment-condition">实验：改条件</h2>
		<p>固定温度，只把调式从一种换成另一种，看排行榜是否移动。不要同时改好几个旋钮。</p>

		<h2 id="article-myths">常见误解</h2>
		<ul>
			<li>温度不是情感旋钮。</li>
			<li>右边第一名不一定被选中。</li>
			<li>注意力亮度不是在写思念或伤感。</li>
			<li>音符序列、音频 token、扩散谱图不是同一条路。</li>
			<li>系统首先在建模序列，不是在直接写出人类情感。</li>
		</ul>

		<h2 id="article-further-reading">走向研究</h2>
		<p>能讲清「下一个音符、温度、条件、回看」之后，再向外看音频 tokenizer、MusicGen 一类模型和音频扩散。先把本课五个实验做完。</p>
	{:else}
		<h1>How music is built one note at a time</h1>
		<p class="lead">
			Use this article with the Music course. The main path has the same shape as the text course: generate the next note, append it, and repeat. The middle is a piano roll; the right side ranks the next pitch and duration. Playback covers only the current snippet. These are designed example melodies and sampling rules, not a live large model.
		</p>
		<p class="note">Walk the coach bar, then the 16-step textbook, then the workbench. No scores or points.</p>
		<h2 id="article-music-is-sequence">Music is also a sequence</h2>
		<p>Notes already written are the context. The only question at each step is: what is the next note?</p>
		<h2 id="article-notes-vs-waveform">Notes and waveforms sit on different layers</h2>
		<p>A note is a symbol (pitch plus duration). A waveform is a fine sampling of air vibration. The main path uses symbols; later views contrast audio tokens and a diffusion spectrogram.</p>
		<h2 id="article-audio-codec">Audio codecs</h2>
		<p>Some systems compress sound into discrete labels, generate the next label, and decode back to a waveform. Think of this as a tokenizer for sound. This course only shows a schematic.</p>
		<h2 id="article-condition">What the condition does</h2>
		<p>Major, minor, and pentatonic frames change which pitches are more likely. They are not an “emotion” knob. Change only one condition when you experiment.</p>
		<h2 id="article-next-note">The next note</h2>
		<p>A distribution over pitch and duration is sampled with temperature and top-k / top-p. First place is not always chosen. One click adds one cell.</p>
		<h2 id="article-attention-motif">Where attention looks</h2>
		<p>Later notes look back at earlier ones. A gold outline marks more depended-on positions, often the opening motif. That is dependence, not feeling.</p>
		<h2 id="article-rhythm-position">Rhythm and position</h2>
		<p>Without onset and duration, a melody collapses into a list of pitch names. Order itself carries information, as in positional encoding.</p>
		<h2 id="article-temperature-sampling">Surprise and sampling</h2>
		<p>0.2 is more repetitive; 1.4 is more surprising. Top-k / top-p truncate candidates before sampling. Temperature is not an emotion knob.</p>
		<h2 id="article-long-range">Long-range structure</h2>
		<p>A full melody also needs repetition and return. Motif attention is a visible handle for that idea.</p>
		<h2 id="article-read-piano-roll">How to read the piano roll</h2>
		<p>Up is higher in pitch; right is later in time. You choose when to play the snippet; a full song will not auto-play.</p>
		<h2 id="article-musicgen-path">A MusicGen-like path</h2>
		<p>One common route autoregresses on audio tokens and then decodes. The token view is only contrast.</p>
		<h2 id="article-diffusion-music">Diffusion for music</h2>
		<p>Another route clears a whole spectrogram step by step. “One step” there is not “the next note”.</p>
		<h2 id="article-experiment-temp">Lab: temperature</h2>
		<p>From the same opening, generate about eight notes at 0.2, 0.8, and 1.4.</p>
		<h2 id="article-experiment-condition">Lab: change the condition</h2>
		<p>Keep temperature fixed and switch the mode. Watch the ranking move.</p>
		<h2 id="article-myths">Myths</h2>
		<ul>
			<li>Temperature is not an emotion knob.</li>
			<li>First place is not always sampled.</li>
			<li>Attention is not writing longing.</li>
			<li>Notes, audio tokens, and diffusion spectrograms are different paths.</li>
			<li>The system is modeling a sequence first, not writing human emotion.</li>
		</ul>
		<h2 id="article-further-reading">Going further</h2>
		<p>After the five labs, you are ready to read about audio tokenizers, MusicGen-like models, and audio diffusion.</p>
	{/if}
</article>

<style lang="scss">
	.course-article {
		max-width: 52rem;
		margin: 0 auto 4rem;
		padding: 0 1.2rem 3rem;
		color: #1f2937;
		line-height: 1.75;
		font-size: 1.02rem;
	}
	.course-article h1 {
		font-size: 1.6rem;
		color: #4c1d95;
		margin: 0 0 0.6rem;
	}
	.course-article .lead {
		color: #4b5563;
		margin-bottom: 1.2rem;
	}
	.course-article h2 {
		font-size: 1.2rem;
		color: #5b21b6;
		margin: 1.8rem 0 0.5rem;
		scroll-margin-top: 5.5rem;
	}
	.course-article p,
	.course-article li {
		margin: 0.45rem 0;
	}
	.course-article ul,
	.course-article ol {
		padding-left: 1.3rem;
	}
	.course-article .note {
		background: #f5f3ff;
		border: 1px solid #ddd6fe;
		border-radius: 0.45rem;
		padding: 0.6rem 0.8rem;
		color: #4b5563;
		font-size: 0.95rem;
	}
</style>
