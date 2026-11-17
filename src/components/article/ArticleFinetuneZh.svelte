<script lang="ts">
	import { locale } from '~/i18n';
	$: zh = $locale !== 'en';
</script>

<details class="ft-article-fold">
	<summary>{zh ? '需要时再读：微调是怎么把「下一个词」写成一种口吻的' : 'Read when you need it: how fine-tuning turns “next token” into a voice'}</summary>
<article class="course-article">
	{#if zh}
		<h1>微调是怎么把「下一个词」写成一种口吻的</h1>
		<p class="lead">这篇文章配合顶部「微调」课使用。文字课里的模型是冻结的，只会推理；这一课在本机 Python 服务里改权重。主按钮「推进一步」只讲解训练的一拍，不开训。开训、暂停和续写放在工作室。模型会跟着你喂的文本走，只做自己的学习实验，不要拿去骚扰别人。</p>
		<p class="note">先走完上面「分清 → 看见分词 → 存基线 → 极短跑 → 看见差别」这条短路。教材和自测需要时再打开。训练器没启动时，书和自测仍然可用。没有分数，也没有积分。</p>
		<h2 id="article-infer-vs-train">推理与训练</h2>
		<p>推理是固定权重、计算下一个词的概率再抽样。温度和 top-k 只出现在这一步。训练则是根据损失更新允许改动的参数。不要把调温度当成已经微调。</p>
		<h2 id="article-three-ways">三种调法</h2>
		<p>预训练得到基座；微调在你的小语料上继续改权重；提示词不改权重，只改输入。本课主路是微调，方法可以是 LoRA、冻结层或全量。</p>
		<h2 id="article-still-next-token">目标还是下一个词</h2>
		<p>损失仍然是下一个 token 的交叉熵。口吻变化是这个目标的结果，不是另设的「文采分」。</p>
		<h2 id="article-cross-entropy">交叉熵与概率表</h2>
		<p>真正的下一个词如果只得到很小的概率，损失就大。这和文字课右边的排行榜是同一张表的另一种读法。</p>
		<h2 id="article-perplexity">困惑度</h2>
		<p>困惑度由损失派生，表示有多犹豫。低困惑度不等于已经会写，更可能只是对训练文本更确定。</p>
		<h2 id="article-dataset">数据</h2>
		<p>一条样本是一段完整文本。示例口吻包只有笔记、短诗和技术小段子。请用 80–300 条量级的自己的学习材料，并先清理空白和重复。</p>
		<h2 id="article-tokenize">分词与截断</h2>
		<p>先切成 token，再按序列长度截断。预览分词，以免把你想保留的结尾切掉。</p>
		<h2 id="article-split-leakage">拆分与泄露</h2>
		<p>验证集必须在开训前单独留下，并且不参加更新。推荐大约 9:1。泄露会让验证损失假好。</p>
		<h2 id="article-full-ft">全量微调</h2>
		<p>几乎所有权重都更新。更灵活，也更吃显存，数据少时更容易过拟合和遗忘。学习率建议从 5e-5 起。</p>
		<h2 id="article-freeze-layers">冻结层</h2>
		<p>只解冻最后 1–4 层，或只训输出层。用来问「最少动哪些参数，口吻会不会变」。</p>
		<h2 id="article-lora">LoRA</h2>
		<p>在原矩阵旁训练很小的适配矩阵。推荐 r=16、alpha=32，默认加在注意力投影上。r 更大不一定更好。</p>
		<h2 id="article-lr-warmup">学习率与调度器</h2>
		<p>LoRA 推荐 2e-4，并配合预热和余弦调度。学习率不是温度，也不是创造力。</p>
		<h2 id="article-batch-vram">批次、序列长度与显存</h2>
		<p>推荐批次 2、累积 4、序列长度 512。显存不够时先减小这三项，而不是立刻上全量。</p>
		<h2 id="article-epoch-earlystop">epoch 与早停</h2>
		<p>推荐 3 个 epoch；验证损失连续 2 次不再下降可以早停。多训几轮不一定更好。</p>
		<h2 id="article-amp-clip-seed">混合精度、裁剪与种子</h2>
		<p>默认 fp16、裁剪 1.0、种子 42。种子是为了对照实验能重现。</p>
		<h2 id="article-read-curves">看曲线</h2>
		<p>同时看训练损失和验证损失。只截「最后很小」的一张图，可能会把背诵当成成功。</p>
		<h2 id="article-overfit-forget">过拟合与遗忘</h2>
		<p>训练变好、验证变差，要警惕过拟合。新口吻把原来写句子的能力冲掉，则是遗忘。语料外提示能帮忙分辨。</p>
		<h2 id="article-evaluate">怎么评估</h2>
		<p>先存微调前的基线，再用同一批提示词、同一套抽样对照；并加一条语料里没见过的提示。</p>
		<h2 id="article-temp-after-ft">微调后的温度</h2>
		<p>权重决定概率表，温度和 top-k 仍决定怎么取样。同一套权重上比较 0.2 和 0.8，不必重新开训。</p>
		<h2 id="article-save-export">保存与导出</h2>
		<p>档案应留下配方、曲线和续写。检查点用于恢复。导出的是适配器，不是整个基座，也不能拿去骚扰别人。</p>
		<h2 id="article-one-knob">一次只改一个旋钮</h2>
		<p>打开全部旋钮之后更要克制。锁定数据和种子，只改学习率或只改 r，再把两次跑并排对比。</p>
		<h2 id="article-further-map">进阶地图</h2>
		<p>第一期不必上量化。先在 GPT-2 small（可选 medium）上把循环跑通。更大的模型和多卡是后面的事。</p>
	{:else}
		<h1>How fine-tuning turns “next token” into a voice</h1>
		<p class="lead">Use this article with the Fine-tune course. The text-course model is frozen and only does inference. This course updates weights in a local Python service. The main button “Take one step” only explains one training beat; it does not start training. Starting, pausing, and generation live in the workshop. The model follows the text you feed it; use it only for your own study, and do not use it to harass anyone.</p>
		<p class="note">First walk the short path above: see the line, see tokens, save a baseline, do a short run, then see the change. Open the textbook and self-check when you need them. They still work if the trainer is down. No scores or points.</p>
		<h2 id="article-infer-vs-train">Inference vs training</h2>
		<p>Inference keeps weights fixed and samples the next token. Temperature and top-k belong here. Training updates the parameters that are allowed to change. Turning temperature down is not fine-tuning.</p>
		<h2 id="article-three-ways">Three ways to change the writing</h2>
		<p>Pretraining builds a base model; fine-tuning continues on your small corpus; prompting leaves weights alone and only changes the input. This course’s main path is fine-tuning, via LoRA, freezing, or a full update.</p>
		<h2 id="article-still-next-token">The objective is still the next token</h2>
		<p>The loss is still next-token cross-entropy. A change of voice is a result of that objective, not a separate “style score”.</p>
		<h2 id="article-cross-entropy">Cross-entropy and the probability table</h2>
		<p>If the true next token gets little probability, the loss is large. This is another way of reading the same table as the text course’s ranking.</p>
		<h2 id="article-perplexity">Perplexity</h2>
		<p>Perplexity is derived from the loss and says how hesitant the model is. A low number is not the same as “it can write now”.</p>
		<h2 id="article-dataset">Data</h2>
		<p>A sample is a complete piece of text. The example packs are only notes, short verses, and short technical notes. Aim for 80–300 of your own study rows, cleaned of blanks and duplicates.</p>
		<h2 id="article-tokenize">Tokenizing and truncation</h2>
		<p>Text is cut into tokens, then truncated to the sequence length. Preview tokens so you do not cut off an ending you cared about.</p>
		<h2 id="article-split-leakage">Splits and leakage</h2>
		<p>Hold out the validation set before training, and do not update on it. About 9:1 is the default. Leakage makes validation look falsely good.</p>
		<h2 id="article-full-ft">Full fine-tuning</h2>
		<p>Almost all weights move. It is flexible, memory-hungry, and easier to overfit or forget when data is scarce. Start the learning rate around 5e-5.</p>
		<h2 id="article-freeze-layers">Freezing layers</h2>
		<p>Unfreeze the last 1–4 layers, or train only the output layer, to see how little you can move and still change the voice.</p>
		<h2 id="article-lora">LoRA</h2>
		<p>Small adapter matrices are trained beside the original weights. The recommended settings are r = 16, alpha = 32, on the attention projections. A larger r is not automatically better.</p>
		<h2 id="article-lr-warmup">Learning rate and the scheduler</h2>
		<p>For LoRA, 2e-4 with warmup and a cosine schedule is the starting point. Learning rate is not temperature, and not creativity.</p>
		<h2 id="article-batch-vram">Batch, sequence length, and memory</h2>
		<p>The recommended starting point is batch 2, accumulation 4, and sequence length 512. If you run out of memory, shrink these first, not jump to a full update.</p>
		<h2 id="article-epoch-earlystop">Epochs and early stopping</h2>
		<p>Three epochs is the default; stop if validation loss does not improve twice in a row. More epochs are not automatically better.</p>
		<h2 id="article-amp-clip-seed">Precision, clipping, and the seed</h2>
		<p>Defaults are fp16, clip 1.0, and seed 42. The seed is there so a comparison can be reproduced.</p>
		<h2 id="article-read-curves">Reading the curves</h2>
		<p>Watch training and validation loss together. A tiny final training loss can be memorization.</p>
		<h2 id="article-overfit-forget">Overfitting and forgetting</h2>
		<p>Better training and worse validation is a warning. A new voice that washes out ordinary sentences is forgetting. Prompts outside the corpus help you tell the two apart.</p>
		<h2 id="article-evaluate">How to evaluate</h2>
		<p>Save a baseline first. Compare the same prompts with the same sampling; add at least one prompt that never appeared in the corpus.</p>
		<h2 id="article-temp-after-ft">Temperature after fine-tuning</h2>
		<p>Weights shape the table; temperature and top-k still decide how we sample it. Compare 0.2 and 0.8 on the same weights; do not start a new run just for that.</p>
		<h2 id="article-save-export">Saving and export</h2>
		<p>Keep the recipe, the curves, and the continuations. Checkpoints are for resuming. An export is an adapter, not the whole base model, and not something to use against other people.</p>
		<h2 id="article-one-knob">Change only one knob</h2>
		<p>After you open all the knobs, be more careful, not less. Lock the data and seed, change only the learning rate or only r, and compare the two runs side by side.</p>
		<h2 id="article-further-map">A map for later</h2>
		<p>Phase one does not need quantization. Get the loop working on GPT-2 small (medium is optional). Larger models and several GPUs can wait.</p>
	{/if}
</article>
</details>

<style lang="scss">
	.ft-article-fold {
		max-width: 52rem;
		margin: 0 auto 2.5rem;
		padding: 0 1.2rem 1rem;
	}
	.ft-article-fold > summary {
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 600;
		color: #5b21b6;
		background: #f5f3ff;
		border: 1px solid #ddd6fe;
		border-radius: 0.5rem;
		padding: 0.65rem 0.9rem;
		list-style: none;
	}
	.ft-article-fold > summary::-webkit-details-marker {
		display: none;
	}
	.ft-article-fold[open] > summary {
		margin-bottom: 0.8rem;
	}

	.course-article {
		max-width: 52rem;
		margin: 0 auto 4rem;
		padding: 0 1.2rem 3rem;
		color: #1f2937;
		line-height: 1.75;
		font-size: 1.02rem;
	}
	.course-article h1 { font-size: 1.6rem; color: #4c1d95; margin: 0 0 0.6rem; }
	.course-article .lead { color: #4b5563; margin-bottom: 1.2rem; }
	.course-article h2 { font-size: 1.2rem; color: #5b21b6; margin: 1.8rem 0 0.5rem; scroll-margin-top: 5.5rem; }
	.course-article p, .course-article li { margin: 0.45rem 0; }
	.course-article ul, .course-article ol { padding-left: 1.3rem; }
	.course-article .note { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 0.45rem; padding: 0.6rem 0.8rem; color: #4b5563; font-size: 0.95rem; }
</style>
