import { get, writable } from 'svelte/store';
import { course, switchCourse, type CourseId } from '~/store/course';
import { textPathDone, imageKnobsUnlocked, musicKnobsUnlocked } from '~/store/beginnerPath';
import { coachVisible } from '~/i18n';
import { isTextbookOpen } from '~/store';
import {
	RESEARCH_HASH,
	isResearchHash,
	courseFromResearchHash,
	replaceTeachingHash
} from '~/utils/teachingHash';

export type ResearchTarget =
	| { type: 'flash'; sel: string }
	| { type: 'reading'; id: string };

export type ResearchLab = {
	id: string;
	titleZh: string;
	titleEn: string;
	hintZh: string;
	hintEn: string;
	target: ResearchTarget;
};

export { RESEARCH_HASH, isResearchHash, courseFromResearchHash };

export const researchDoorOpen = writable(false);

export function isResearchUnlocked(id: CourseId = get(course)): boolean {
	if (id === 'finetune') return false;
	if (id === 'text') return get(textPathDone);
	if (id === 'image') return get(imageKnobsUnlocked);
	if (id === 'music') return get(musicKnobsUnlocked);
	return false;
}

export function closeResearchDoor(opts?: { clearHash?: boolean }) {
	researchDoorOpen.set(false);
	if (opts?.clearHash === false) return;
	if (typeof location === 'undefined') return;
	if (isResearchHash(location.hash)) replaceTeachingHash('');
}

export function openResearchDoor(id?: Exclude<CourseId, 'finetune'>): boolean {
	const target = id ?? (get(course) === 'finetune' ? 'text' : (get(course) as Exclude<CourseId, 'finetune'>));
	if (!isResearchUnlocked(target)) return false;
	if (get(course) !== target) switchCourse(target);
	// Entering the door must not auto-open the library or start a walk.
	isTextbookOpen.set(false);
	researchDoorOpen.set(true);
	coachVisible.set(true);
	replaceTeachingHash(RESEARCH_HASH[target]);
	return true;
}

export const TEXT_RESEARCH_LABS: ResearchLab[] = [
	{
		id: 'next-token',
		titleZh: '抽出下一个词',
		titleEn: 'Draw the next word',
		hintZh: '点「推进一步」一次，看输入行多一个词。我不会替你点。',
		hintEn: 'Click 推进一步 once and watch one word appear. This will not click it for you.',
		target: { type: 'flash', sel: '.generate-button, [data-te-path="push-step"]' }
	},
	{
		id: 'attention',
		titleZh: '看中间的线',
		titleEn: 'Look at the lit lines',
		hintZh: '中间注意力圆点和连线，就是「它在看谁」。',
		hintEn: 'The dots and lines in the middle are “who it is looking at.”',
		target: { type: 'flash', sel: '.step.attention, .attention-matrix' }
	},
	{
		id: 'sampling',
		titleZh: '拧抽词旋钮',
		titleEn: 'Turn the sampling knobs',
		hintZh: '温度和 Top-k 只改怎么抽样，不改模型权重。',
		hintEn: 'Temperature and Top-k only change sampling, not the weights.',
		target: { type: 'flash', sel: '.temperature-input, .sampling-input' }
	},
	{
		id: 'same-idea',
		titleZh: '同一件事',
		titleEn: 'The same idea',
		hintZh: '下一个词、下一个音、再去噪一步，都是「先走一步」。',
		hintEn: 'The next word, the next note, and one denoise step are the same idea: take one step.',
		target: { type: 'reading', id: 'same-idea' }
	},
	{
		id: 'weights-vs-sampling',
		titleZh: '改抽样还是改权重',
		titleEn: 'Sampling vs weights',
		hintZh: '这里拧旋钮不是微调。要改权重，请走进微调课。',
		hintEn: 'Turning knobs here is not fine-tuning. To change weights, enter the fine-tune course.',
		target: { type: 'reading', id: 'weights-vs-sampling' }
	},
	{
		id: 'pointers',
		titleZh: '读什么、不必先上平台',
		titleEn: 'What to read, without a new platform',
		hintZh: '教材讲到 Dropout。门口只给阅读指针，不是工业评测平台。',
		hintEn: 'The textbook ends at Dropout. This door only offers reading pointers, not an industrial eval platform.',
		target: { type: 'reading', id: 'pointers' }
	}
];

export const IMAGE_RESEARCH_LABS: ResearchLab[] = [
	{
		id: 'denoise',
		titleZh: '再去噪一步',
		titleEn: 'Denoise one step',
		hintZh: '看画布变清一点。我不会替你点按钮。',
		hintEn: 'Watch the canvas clear a little. This will not click the button for you.',
		target: { type: 'flash', sel: '.denoise-button' }
	},
	{
		id: 'cfg',
		titleZh: '听话程度对照',
		titleEn: 'Guidance contrast',
		hintZh: '同一提示词，只改 CFG，看中间和右侧对照。',
		hintEn: 'Keep the prompt fixed, change only CFG, and compare the middle and the right side.',
		target: { type: 'flash', sel: '.cfg-control, .cfg-compare' }
	},
	{
		id: 'steps',
		titleZh: '步数对照',
		titleEn: 'Step-count contrast',
		hintZh: '步数少等于跳着走完时间表，残留噪声通常更多。',
		hintEn: 'Fewer steps skip through the schedule, so leftover noise usually remains.',
		target: { type: 'flash', sel: '.steps-control, .image-timeline' }
	},
	{
		id: 'ar',
		titleZh: '切到图像 token 对照',
		titleEn: 'Switch to the image-token path',
		hintZh: '这一步改的是「下一块」，不是整张潜图。',
		hintEn: 'This path decides the next patch, not the whole latent.',
		target: { type: 'flash', sel: '.mode-switch' }
	},
	{
		id: 'same-idea',
		titleZh: '同一件事',
		titleEn: 'The same idea',
		hintZh: '再去噪一步，和文字课抽出下一个词，是同一类「走一步」。',
		hintEn: 'One denoise step is the same kind of “take one step” as drawing the next word.',
		target: { type: 'reading', id: 'same-idea' }
	},
	{
		id: 'pointers',
		titleZh: 'CFG / DiT / Flow Matching',
		titleEn: 'CFG / DiT / Flow Matching',
		hintZh: '只作阅读指针或最小示意，不在课内装 600MB 检查点。',
		hintEn: 'Reading pointers and a minimal sketch only — this course does not ship a 600MB checkpoint.',
		target: { type: 'reading', id: 'pointers' }
	}
];

export const MUSIC_RESEARCH_LABS: ResearchLab[] = [
	{
		id: 'next-note',
		titleZh: '写出下一个音',
		titleEn: 'Write the next note',
		hintZh: '看卷帘多一格、虚线「下一个」往前走。我不会替你点。',
		hintEn: 'Watch one new cell appear, and the dashed “next” move forward. This will not click for you.',
		target: { type: 'flash', sel: '.music-step-btn' }
	},
	{
		id: 'temp',
		titleZh: '意外程度对照',
		titleEn: 'Temperature contrast',
		hintZh: '把意外程度调低，再生成几个音，看是不是更稳。',
		hintEn: 'Lower the temperature, generate a few notes, and see whether it stays steadier.',
		target: { type: 'flash', sel: '.music-temp, .music-probs' }
	},
	{
		id: 'condition',
		titleZh: '改一个条件',
		titleEn: 'Change one condition',
		hintZh: '调式或示例开头是条件，不是另写一首现成的曲子。',
		hintEn: 'Mode or the example prefix is a condition, not a finished piece already written.',
		target: { type: 'flash', sel: '.music-condition' }
	},
	{
		id: 'views',
		titleZh: '三种表示',
		titleEn: 'Three representations',
		hintZh: '音符主路、音频 token、扩散谱图是对照，不是三个工业引擎。',
		hintEn: 'Notes, audio tokens, and a spectrogram diffusion sketch are contrasts, not three industrial engines.',
		target: { type: 'flash', sel: '.music-view' }
	},
	{
		id: 'same-idea',
		titleZh: '同一件事',
		titleEn: 'The same idea',
		hintZh: '下一个音和下一个词是同一件事；试听只是把已经写下的音放出来。',
		hintEn: 'The next note and the next word are the same idea. Playback only plays notes already written.',
		target: { type: 'reading', id: 'same-idea' }
	},
	{
		id: 'pointers',
		titleZh: 'Music Transformer / AudioLM / MusicGen',
		titleEn: 'Music Transformer / AudioLM / MusicGen',
		hintZh: '本课用预计算旋律。这些名字是阅读指针，不是另开的工业编曲平台。',
		hintEn: 'This course uses precomputed melodies. Those names are reading pointers, not a separate industrial studio.',
		target: { type: 'reading', id: 'pointers' }
	}
];

export function researchLabsFor(id: CourseId): ResearchLab[] {
	if (id === 'image') return IMAGE_RESEARCH_LABS;
	if (id === 'music') return MUSIC_RESEARCH_LABS;
	if (id === 'text') return TEXT_RESEARCH_LABS;
	return [];
}

export const RESEARCH_READINGS: Record<
	string,
	{ titleZh: string; titleEn: string; bodyZh: string; bodyEn: string }
> = {
	'same-idea': {
		titleZh: '同一件事：先走一步',
		titleEn: 'The same idea: take one step',
		bodyZh:
			'文字课抽出下一个词，音乐课接上下一个音，图片课再去噪一步：都是先看见「走一步」的现象，再给它起名字。对象不同，这一步的含义也不同——词、音是补上下一个符号，去噪是改整张潜图。不要把三条路说成同一种计算，只要记住它们都要求你先看见一步。',
		bodyEn:
			'Drawing the next word, writing the next note, and denoising one step are the same teaching idea: see one step first, then name it. The object is different, and so is what “a step” means — a token or a note appends one symbol; denoise edits the whole latent. Do not collapse the three paths into one computation. Just remember that each one asks you to see a step first.'
	},
	'weights-vs-sampling': {
		titleZh: '改抽样不是改权重',
		titleEn: 'Changing sampling is not changing weights',
		bodyZh:
			'温度、Top-k、听话程度、意外程度，都是在已经算好的分数上改「怎么抽」。模型权重没动。若要让它跟你的文字走，那是微调课的事：改旁边一小块权重，再对照续写。两边可以互相看，但不要把旋钮当成训练。',
		bodyEn:
			'Temperature, Top-k, guidance, and musical “surprise” all change how you sample from scores that are already computed. The weights do not move. If you want the model to follow your text, that is the fine-tune course: change a small piece of the weights, then compare continuations. The courses can point at each other, but a knob is not training.'
	},
	pointers: {
		titleZh: '门口怎么读，而不是另开平台',
		titleEn: 'How to read at the door — not a second platform',
		bodyZh:
			'本课仍是教学尺度。文字课教材讲到 Dropout；图片课可以把 CFG、调度器、DiT、Flow Matching 当作阅读顺序，不会在课内装大检查点；音乐课可以接着读 Music Transformer、AudioLM、MusicGen，卷帘和示意谱图已经够你对照。这些清单都在这一课的壳子里，不是工业 DPO / RLHF / 评测平台。微调课的「再深挖」里，已经可以走进去看过拟合曲线、检查点对照和遗忘对照；那是预置教学示意，不是另开的工业平台。',
		bodyEn:
			'This stays at teaching scale. The text textbook ends at Dropout. For images, treat CFG, schedulers, DiT, and Flow Matching as a reading order — this course does not install a large checkpoint. For music, read Music Transformer, AudioLM, and MusicGen after you can point at the piano roll and the spectrogram sketch. The list already lives in this course shell. It is not an industrial DPO / RLHF / eval platform. In the fine-tune course’s “Go deeper” door, you can walk in and see an overfitting curve, a checkpoint contrast, and a forgetting contrast — preset teaching sketches, not a separate industrial platform.'
	}
};

export function flashResearchTarget(sel: string): boolean {
	if (!sel || typeof document === 'undefined') return false;
	const el = document.querySelector(sel) as HTMLElement | null;
	if (!el) return false;
	el.classList.add('te-lab-flash');
	el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
	setTimeout(() => el.classList.remove('te-lab-flash'), 1800);
	return true;
}

let hooksBound = false;

export function bootResearchDoorHooks() {
	if (hooksBound || typeof window === 'undefined') return;
	hooksBound = true;
	(window as any).__teOpenResearchDoor = (courseId?: string) => {
		const id = courseId === 'image' || courseId === 'music' || courseId === 'text' ? courseId : undefined;
		return openResearchDoor(id);
	};
	const applyHash = () => {
		if (typeof location === 'undefined') return;
		const id = courseFromResearchHash(location.hash);
		if (!id) {
			if (get(researchDoorOpen) && get(course) !== 'finetune') {
				/* hash cleared elsewhere */
			}
			return;
		}
		if (get(course) === 'finetune') return;
		if (!isResearchUnlocked(id)) return;
		if (get(course) !== id) return;
		if (!get(researchDoorOpen)) {
			isTextbookOpen.set(false);
			researchDoorOpen.set(true);
			coachVisible.set(true);
		}
	};
	window.addEventListener('hashchange', applyHash);
	queueMicrotask(applyHash);
	course.subscribe((value) => {
		if (value === 'finetune') {
			if (get(researchDoorOpen)) closeResearchDoor({ clearHash: true });
			return;
		}
		if (typeof location === 'undefined') return;
		if (get(researchDoorOpen) && isResearchHash(location.hash)) {
			const want = courseFromResearchHash(location.hash);
			if (want && want !== value) closeResearchDoor({ clearHash: true });
		}
		queueMicrotask(applyHash);
	});
}
