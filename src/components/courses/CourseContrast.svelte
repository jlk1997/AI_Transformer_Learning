<script lang="ts">
	import { fade } from 'svelte/transition';
	import { locale, messages } from '~/i18n';
	import { courseContrastOpen, courseContrastTarget, markContrastSeen } from '~/store/course';
	import { tutorPanelOpen } from '~/tutor/store';

	const toggleLocale = () => locale.update((l) => (l === 'zh-CN' ? 'en' : 'zh-CN'));

	$: m = ($messages as any).courseUi ?? {};
	$: zh = $locale !== 'en';
	$: target = $courseContrastTarget;

	const close = () => {
		if (target) markContrastSeen(target);
		courseContrastOpen.set(false);
		// The overlay already hid the coach via courseContrastOpen. Do not
		// force-expand a same-visit hide-for-view after the curtain closes.
	};
</script>

{#if $courseContrastOpen && target}
	<aside
		class="intro"
		class:compact={target === 'image'}
		class:with-ask={$tutorPanelOpen}
		role="dialog"
		aria-modal="false"
		data-te-contrast="overlay"
		data-te-contrast-intro={target}
		transition:fade={{ duration: 180 }}
	>
		<div class="card-scroll">
			<div class="card-head">
				<p class="kicker">{zh ? '先看这一眼' : 'Look at this first'}</p>
				<button type="button" class="locale" data-te-locale="contrast" aria-label={zh ? '切换为英文' : 'Switch to Chinese'} on:click={toggleLocale}>
					{$locale === 'zh-CN' ? 'EN' : '中文'}
				</button>
			</div>
			<h2>
				{#if target === 'image'}
					{m.contrastTitleImage ?? (zh ? '先看图是怎么一步步变清楚的' : 'How a picture gets clearer, one step at a time')}
				{:else if target === 'music'}
					{m.contrastTitleMusic ?? (zh ? '先看旋律是怎么接上下一个音的' : 'How a melody grows, one note at a time')}
				{:else}
					{zh ? '先分清：改的是权重，不是温度' : 'First see the line: we change weights, not temperature'}
				{/if}
			</h2>
			<div class="body">
				{#if target === 'image'}
					<p>
						{zh
							? '不必先上完文字课。这堂课从一张噪声开始，每点一次「再去噪一步」，整张图一起变清楚一点。左边的提示词是条件，不是已经画完的图。后面有一章「图像 token」，才更像一次补一块。'
							: 'You do not need to finish the text course first. This course starts from noise. Each click of “Denoise one step” clears the whole picture a little. The prompt on the left is a condition, not a finished picture. A later chapter on image tokens is the closer analogue of “next patch”.'}
					</p>
					<ul>
						<li>{zh ? '主按钮：再去噪一步（整张图一起变清）。' : 'Main button: denoise one step (the whole picture clears together).'}</li>
						<li>{zh ? '三块区域：左边是提示词（条件），中间是画布，右边是本步对照。' : 'Three areas: the prompt (a condition) on the left, the canvas in the middle, and this step’s comparison on the right.'}</li>
						<li>{zh ? '先看中间和右边怎么变，再给后面的旋钮起名字。' : 'First watch the middle and the right change; name the knobs only after that.'}</li>
					</ul>
				{:else if target === 'music'}
					<p>
						{zh
							? '不必先上完文字课。这堂课每次只生成下一个音符，接到已经有的旋律后面再猜。中间是钢琴卷帘，右边是下一个音的排行。后面会对照音频 token 和扩散谱图。'
							: 'You do not need to finish the text course first. This course generates only the next note, appends it, and repeats. The middle is a piano roll; the right side ranks the next note. Later chapters contrast audio tokens and a diffusion spectrogram.'}
					</p>
					<ul>
						<li>{zh ? '主按钮：生成下一个音符。' : 'Main button: generate the next note.'}</li>
						<li>{zh ? '三块区域：左边是已经有的音，中间是钢琴卷帘，右边是下一个音的排行。' : 'Three areas: the notes so far on the left, the piano roll in the middle, and the ranking of the next note on the right.'}</li>
						<li>{zh ? '可试听当前片段，但不会自动把整首播完。先看排行和卷帘怎么变，再给后面的旋钮起名字。' : 'You can play the current snippet; a full song will not auto-play. First watch the ranking and the roll change; name the knobs only after that.'}</li>
					</ul>
				{:else}
					<p>
						{zh
							? '文字课的模型是冻结的，只会猜下一个词。温度，或「只从最可能的几个里抽」，只改怎么抽样，不改权重。这一课才改权重，让续写跟着你的语料走。'
							: 'In the text course the model is frozen and only guesses the next word. Temperature, or “only sample from the top few”, changes how we draw a word — not the weights. This course is the one that changes weights, so the writing follows your corpus.'}
					</p>
					<ul>
						<li>{zh ? '主按钮「推进一步」只把训练的一步讲清楚，不开训。动手在工作室。' : 'The main button, “Take one step”, only explains one training step. It does not start training. The hands-on work is in the studio.'}</li>
						<li>{zh ? '前几步只需走这一条路：看见分词 → 存基线 → 极短跑 → 看前后差别 → 再看损失是什么。' : 'The first few steps follow one path: see tokens → save a baseline → do a short run → see the change → then see what loss is.'}</li>
						<li>{zh ? '这是本机 GPT-2 上的小实验，不是在调 ChatGPT。相同的是损失、数据和「在旁边加一小块」的想法；不同的是规模和工具链。' : 'This is a small GPT-2 experiment on your machine, not tuning ChatGPT. The same ideas are loss, data, and adding a small piece beside the original weights. The scale and tooling are different.'}</li>
						<li>{zh ? '模型会跟着你喂的文本走。只做自己的学习实验，不要拿去骚扰别人。' : 'The model follows the text you feed it. Use this for your own study, not to harass anyone.'}</li>
					</ul>
				{/if}
			</div>
		</div>
		<div class="cta-wrap">
			<button type="button" class="primary" data-te-contrast="start" on:click={close}>
				{target === 'image' ? (zh ? '开始看图' : 'Start the image course') : target === 'music' ? (zh ? '开始看谱' : 'Start the music course') : (zh ? '开始微调课' : 'Start the fine-tune course')}
			</button>
		</div>
	</aside>
{/if}

<style>
	.intro {
		position: relative;
		z-index: 2;
		width: 100%;
		max-height: min(34vh, 20rem);
		overflow: auto;
		background: rgba(255, 255, 255, 0.98);
		border: 1px solid #ddd6fe;
		border-radius: 0.7rem;
		box-shadow: 0 10px 28px rgba(76, 29, 149, 0.14);
		padding: 0.4rem 0.75rem 0.5rem;
		line-height: 1.4;
		color: var(--te-ink-soft, #4b5563);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.intro.compact {
		max-height: min(28vh, 16.5rem);
		padding: 0.35rem 0.7rem 0.45rem;
	}
	.intro.with-ask {
		max-height: min(22vh, 13rem);
	}
	.intro.compact.with-ask {
		max-height: min(20vh, 12rem);
	}
	.card-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}
	.cta-wrap {
		position: sticky;
		bottom: 0;
		z-index: 6;
		flex: 0 0 auto;
		background: rgba(255, 255, 255, 0.98);
		padding-top: 0.2rem;
		margin-top: 0.05rem;
	}
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.1rem;
	}
	.kicker {
		margin: 0;
		font-size: var(--te-fs-caption, 0.75rem);
		font-weight: 700;
		color: #6d28d9;
	}
	.locale {
		border: 1px solid #ddd6fe;
		background: white;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.08rem 0.5rem;
		cursor: pointer;
		font-weight: 700;
		font-size: var(--te-fs-caption, 0.75rem);
	}
	h2 {
		margin: 0 0 0.28rem;
		font-size: var(--te-fs-title, 0.95rem);
		line-height: 1.3;
		color: #4c1d95;
		font-weight: 700;
	}
	.body p {
		margin: 0 0 0.25rem;
		font-size: var(--te-fs-body, 0.84rem);
		color: var(--te-ink-soft, #4b5563);
	}
	.intro.compact .body p {
		font-size: var(--te-fs-caption, 0.75rem);
		line-height: 1.4;
	}
	ul {
		margin: 0;
		padding-left: 1.05rem;
		font-size: var(--te-fs-caption, 0.75rem);
	}
	li {
		margin: 0.06rem 0;
	}
	.primary {
		margin-top: 0.2rem;
		background: #7c3aed;
		color: white;
		border: none;
		border-radius: 0.45rem;
		padding: 0.32rem 0.8rem;
		cursor: pointer;
		font-weight: 600;
		font-size: var(--te-fs-body, 0.84rem);
	}
</style>
