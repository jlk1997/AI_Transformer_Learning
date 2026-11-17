<script lang="ts">
	import { locale } from '~/i18n';
	$: zh = $locale !== 'en';
</script>

<article class="course-article">
	{#if zh}
		<h1>图片生成是怎么一步步变清晰的</h1>
		<p class="lead">
			这篇文章配合顶部「图片」课使用。主路是潜在扩散：提示词是条件，主按钮是「再去噪一步」，一次更新整张潜图。后面会对照「图像 token」那条更像「下一个词」的路。界面里的画面是预先设计的示例轨迹，用来把流程看懂，不是浏览器里跑的大模型。
		</p>
		<p class="note">建议先走完底部教练条，再打开顶栏「书库」里的教材，最后做学习工作台里的实验和自测。没有分数，也没有积分。</p>

		<h2 id="article-image-is-a-process">图不是一笔画完的</h2>
		<p>生成一张图，不是模型「想好了整幅画再一次性涂上去」。主路上，它从一张噪声开始，按时间表一步一步去掉噪声。每按一次「再去噪一步」，整张图一起变清楚一点。这和文字课「一次只接一个词」不一样，先把这个差别记住。</p>

		<h2 id="article-two-routes">两条路线</h2>
		<p>今天常见的两条路是：</p>
		<ul>
			<li><strong>潜在扩散</strong>（本课主路）：在压缩过的潜图上逐步去噪，最后用 VAE 解码成像素。</li>
			<li><strong>图像 token 自回归</strong>（对照）：把图画成一块块符号，每次预测下一块，更像生成下一个词。</li>
		</ul>
		<p>两条路都能出图，但「一步」的含义完全不同。不要把它们混成同一种算法。</p>

		<h2 id="article-prompt-as-condition">提示词变成条件</h2>
		<p>你输入的句子不会直接变成图。它先被编成一组数字（可以想成 CLIP 一类的文本条件），去噪时一直被看着。没有提示词的「无条件」一路也会算，后面的听话程度就是在比较这两路。</p>

		<h2 id="article-why-latent">为什么常常在潜空间里算</h2>
		<p>一张图的像素非常多。先压成更小的潜图，再逐步去噪，计算更省，也更容易先长出大结构。VAE 负责压进去、再解出来。它不写提示词，也不替代去噪网络。</p>

		<h2 id="article-noise-and-timesteps">噪声与时间步</h2>
		<p>起点往往接近纯噪声。时间表告诉模型「现在还有多吵」。步数少，等于跳着走完这张表，细节来不及长，残留噪声会更多。</p>

		<h2 id="article-denoise-one-step">去噪一步在算什么</h2>
		<p>根据当前潜图、当前时间步和文本条件，网络估计还剩多少噪声，再按调度器更新整张潜图。一步改的是整张图，不是一个像素。画布下的「这一步变了什么」就是在用一句话提醒你看这个变化。</p>

		<h2 id="article-scheduler">调度器</h2>
		<p>调度器决定每一步迈多大。Euler 和 DDIM 是两种常见走法。它们改的是路径，不是提示词本身。本课用示意轨迹让你看到节奏差别，不必先背公式。</p>

		<h2 id="article-cfg">听话程度（CFG）</h2>
		<p>CFG 比较「有提示」和「没提示」两个方向：越高越强调提示词。它不是温度。拉到 1 往往更淡更泛；适中（比如 7）更贴题；太高（比如 15）可能过饱和，把结构毁掉。这是本课最重要的对照实验。</p>

		<h2 id="article-seed">起点编号（种子）</h2>
		<p>种子决定初始噪声。相同的提示词、CFG、步数和种子，画面应当能重现。只改种子，构图会变；固定种子只改一个词，主体可能移动，但整体布局常常还能对上。</p>

		<h2 id="article-vae-decode">VAE 解码</h2>
		<p>走完时间表后，潜图还要被解码成你看见的像素。中间画布是过程，右侧 VAE 面板更接近「如果现在结束会得到什么」。不要把 VAE 理解成在编故事。</p>

		<h2 id="article-unet-dit">U-Net 与 DiT</h2>
		<p>去噪网络可以用 U-Net，也可以用 DiT（Transformer 骨架）。换成 Transformer 并不等于改成了「生成下一个词」。只要还在逐步去噪，它就仍是扩散模型。</p>

		<h2 id="article-image-tokens">图像 token 对照</h2>
		<p>切到对照模式会看到画布按块填写，右边是下一块的概率。这才和文字课的自回归同构。用它来对比，不要把它和主路的「再去噪一步」当成同一件事。</p>

		<h2 id="article-cross-attention">跨模态注意力</h2>
		<p>去噪时，图像侧会回头看文本条件里的词。可以把它想成「这一步更盯提示词里的哪些部分」。这是依赖关系，不是模型在「理解感情」。</p>

		<h2 id="article-failure-cases">常见失败</h2>
		<p>过饱和、发糊、不听话，常常能在 CFG 或步数上对照出来。先只改一个旋钮，再说你看到了什么。不要把所有问题都归成「模型没学会审美」。</p>

		<h2 id="article-experiment-cfg">实验：CFG</h2>
		<p>同一提示词和种子，分别看 1、7、15。先描述差别，再下结论。工作台第一项实验就是这件事。</p>

		<h2 id="article-experiment-steps">实验：步数</h2>
		<p>固定 CFG=7 和种子，比较 4、20、50 步的成品。4 步通常更糊，不是「更有艺术感」的保证。</p>

		<h2 id="article-myths">常见误解</h2>
		<ul>
			<li>提示词不是已经画完的图。</li>
			<li>CFG 不是温度。</li>
			<li>去噪一步不是只改一个像素。</li>
			<li>步数更多不等于更有创意。</li>
			<li>DiT 用了 Transformer，也不等于变成了下一个词模型。</li>
		</ul>

		<h2 id="article-further-reading">走向研究</h2>
		<p>如果你能讲清「一步改什么、条件从哪来、CFG 在比什么」，就可以再向外看：潜在扩散论文、CFG、调度器，以及自回归图像 tokenizer。先把本课实验做完，比先堆名词更有用。</p>
	{:else}
		<h1>How an image becomes clear, step by step</h1>
		<p class="lead">
			Use this article with the Image course. The main path is latent diffusion: the prompt is a condition, and the main button denoises the whole latent in one step. A later contrast path fills image tokens, which is closer to “next word”. The pictures are designed example trajectories, not a live large model in the browser.
		</p>
		<p class="note">Walk the coach bar first, then the 18-step textbook, then the workbench labs and self-check. There are no scores or points.</p>
		<h2 id="article-image-is-a-process">A picture is not drawn in one stroke</h2>
		<p>The main path starts from noise and removes it on a schedule. One click updates the whole image, unlike the text course, which appends one token at a time.</p>
		<h2 id="article-two-routes">Two routes</h2>
		<p>Latent diffusion (main path) denoises a compressed latent and decodes it with a VAE. Image-token autoregression (contrast) predicts the next patch, more like next-token generation. “One step” means different things on the two paths.</p>
		<h2 id="article-prompt-as-condition">The prompt becomes a condition</h2>
		<p>Your sentence is encoded into a vector and used during denoising. An unconditional path is also computed; CFG compares the two.</p>
		<h2 id="article-why-latent">Why work in a latent space</h2>
		<p>Pixels are expensive. A smaller latent is cheaper, and a VAE compresses and decodes. The VAE does not write the prompt.</p>
		<h2 id="article-noise-and-timesteps">Noise and timesteps</h2>
		<p>The start is close to pure noise. Too few steps jump through the schedule, so leftover noise stays.</p>
		<h2 id="article-denoise-one-step">What one denoise step computes</h2>
		<p>Given the current latent, timestep, and condition, the network estimates remaining noise and the scheduler updates the whole latent. Read the one-line “what changed” under the canvas.</p>
		<h2 id="article-scheduler">Schedulers</h2>
		<p>Euler and DDIM change how large each move is, not the prompt itself.</p>
		<h2 id="article-cfg">Guidance (CFG)</h2>
		<p>CFG emphasizes the conditional direction versus the unconditional one. It is not temperature. 1 is often flatter, 7 usually follows the prompt, 15 can overcook the picture.</p>
		<h2 id="article-seed">Start number (seed)</h2>
		<p>The seed chooses the initial noise. Keep everything else fixed and the picture can be reproduced.</p>
		<h2 id="article-vae-decode">VAE decoding</h2>
		<p>The finished latent still has to be decoded into pixels. The VAE panel is closer to “what you would get if you stopped now”.</p>
		<h2 id="article-unet-dit">U-Net and DiT</h2>
		<p>A Transformer backbone (DiT) does not turn diffusion into next-token generation if the model is still denoising a whole latent.</p>
		<h2 id="article-image-tokens">Image tokens as contrast</h2>
		<p>In the contrast mode, the canvas fills patch by patch and the right side shows next-patch probabilities. That is the closer analogue of the text course.</p>
		<h2 id="article-cross-attention">Cross-attention</h2>
		<p>The image side can look back at words in the text condition. That is dependence, not “feeling”.</p>
		<h2 id="article-failure-cases">Common failures</h2>
		<p>Oversaturation, blur, and ignoring the prompt can often be compared by changing only CFG or the step count.</p>
		<h2 id="article-experiment-cfg">Lab: CFG</h2>
		<p>Same prompt and seed, compare 1 / 7 / 15. This is the first workbench lab.</p>
		<h2 id="article-experiment-steps">Lab: steps</h2>
		<p>Fix CFG = 7 and the seed, then compare 4 / 20 / 50 steps. Four steps are usually blurrier, not automatically more artistic.</p>
		<h2 id="article-myths">Myths</h2>
		<ul>
			<li>The prompt is not a finished picture.</li>
			<li>CFG is not temperature.</li>
			<li>One denoise step does not change only one pixel.</li>
			<li>More steps are not more creativity.</li>
			<li>DiT is still a diffusion model if it denoises a latent.</li>
		</ul>
		<h2 id="article-further-reading">Going further</h2>
		<p>Once you can explain what one step changes, where the condition comes from, and what CFG compares, you are ready to read about latent diffusion, guidance, schedulers, and image tokenizers.</p>
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
