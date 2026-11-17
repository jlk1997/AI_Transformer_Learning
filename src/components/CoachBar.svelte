<script lang="ts">
	import { messages, coachLessonIdx, coachVisible, locale, showEmbeddingLessonHint, workbenchOpen, workbenchTab, mathWalkExpanded } from '~/i18n';
	import { textPathBack, textPathIdAt, textPathNext, useChineseExample } from '~/courses/textPath';
	import { unlockImageKnobs, unlockMusicKnobs, unlockSampling } from '~/store/beginnerPath';
	import { inputText, isTextbookOpen, textbookCurrentPage, textbookCurrentPageId, textHasDrawnWord, tokens, inputScoreStale, isFetchingModel } from '~/store';
	import { labelsHaveSplitGroups } from '~/utils/gpt2Tokens';
	import { imageArCount, imageMode, imageStep, imageStationMark, captureImageStationMark } from '~/courses/image/store';
	import { musicExampleIdx, musicNotes, musicHasListened, musicStationMark, captureMusicStationMark } from '~/courses/music/store';
	import { MUSIC_EXAMPLES } from '~/courses/music/melodies';
	import { isBridgeSentence } from '~/courses/bridge';
	import { course, getActivePages } from '~/store/course';
	import {
		flashFinetune,
		setFinetuneNotice,
		tourFinetuneWorkbench,
		finetuneTokenPreview,
		finetuneBaselineSaved,
		finetuneStatus,
		finetuneRuns,
		finetuneSawLine,
		finetuneExploreOpen,
		finetuneSpineView,
		setSpineView,
		rewindFinetuneMain
	} from '~/courses/finetune/store';
	import { FT_COACH_TARGETS } from '~/courses/finetune/presets';
	import { openTutorPanel, tutorPanelOpen } from '~/tutor/store';
	import { courseContrastOpen } from '~/store/course';
	import { researchDoorOpen, openResearchDoor, closeResearchDoor, isResearchUnlocked } from '~/courses/researchDoor';

	$: m = $messages;
	$: coachPack =
		$course === 'image'
			? (m as any).imageCoach
			: $course === 'music'
				? (m as any).musicCoach
				: $course === 'finetune'
					? (m as any).finetuneCoach
					: m.coach;
	$: lessons = coachPack?.lessons ?? m.coach.lessons;
	$: openTextbookLabel = coachPack?.openTextbook ?? m.coach.openTextbook;
	$: idx = Math.min(Math.max($coachLessonIdx, 0), lessons.length - 1);
	$: lesson = lessons[idx];
	$: researchStop = $course !== 'finetune' && $researchDoorOpen;
	$: laterStop =
		researchStop ||
		($course === 'finetune' && ($finetuneSpineView === 'method' || $finetuneSpineView === 'explore'));
	$: laterId = researchStop
		? 'explore'
		: $course === 'finetune' && ($finetuneSpineView === 'method' || $finetuneSpineView === 'explore')
			? $finetuneSpineView
			: '';
	$: isLast = laterId === 'explore' ? true : laterId === 'method' ? false : idx >= lessons.length - 1;
	// A walk or tip may be open; the coach 「现在做」 must still stay visible.
	$: yieldMode = false;
	// On the first stop of text / image / music / finetune, 推进一步 stays the unique
	// coach-advance control but is visually secondary until the phenomenon
	// (a word, a denoise step, a next note, or token chips) has been seen.
	$: firstStop =
		!laterStop &&
		!researchStop &&
		idx === 0 &&
		($course === 'text' || $course === 'image' || $course === 'music' || $course === 'finetune');
	$: imageHasStepped = $course === 'image' && ($imageMode === 'ar' ? $imageArCount > 0 : $imageStep > 0);
	$: musicSeedLen = MUSIC_EXAMPLES[$musicExampleIdx]?.notes?.length ?? 0;
	$: musicHasStepped = $course === 'music' && $musicNotes.length > musicSeedLen;
	$: imageStationAdvanced = $course === 'image' && (($imageMode === 'ar' ? $imageArCount : $imageStep) > $imageStationMark);
	$: musicStationAdvanced = $course === 'music' && $musicNotes.length > $musicStationMark;
	let lastDoorMarkKey = '';
	$: doorMarkKey = `${$course}:${laterStop ? laterId || 'later' : lesson?.id ?? String(idx)}`;
	$: if (doorMarkKey !== lastDoorMarkKey) {
		lastDoorMarkKey = doorMarkKey;
		if ($course === 'image') captureImageStationMark();
		if ($course === 'music') captureMusicStationMark();
	}
	$: textInputEmpty = $course === 'text' && !($inputText || '').trim();
	$: emptyFirstEye = textInputEmpty && !laterStop && !researchStop;
	$: holdCoachAdvance =
		emptyFirstEye ||
		(firstStop &&
			(($course === 'text' && !$textHasDrawnWord) ||
				($course === 'image' && !imageHasStepped) ||
				($course === 'music' && !musicHasStepped) ||
				($course === 'finetune' && $finetuneTokenPreview.length === 0))) ||
		($course === 'finetune' &&
			!laterStop &&
			!researchStop &&
			lesson?.id === 'pack' &&
			$finetuneTokenPreview.length === 0) ||
		($course === 'finetune' &&
			!laterStop &&
			!researchStop &&
			lesson?.id === 'baseline' &&
			!$finetuneBaselineSaved) ||
		($course === 'image' &&
			!laterStop &&
			!researchStop &&
			(lesson?.id === 'step' || lesson?.id === 'again') &&
			!imageStationAdvanced) ||
		($course === 'music' &&
			!laterStop &&
			!researchStop &&
			lesson?.id === 'step' &&
			!musicStationAdvanced) ||
		($course === 'music' &&
			!laterStop &&
			!researchStop &&
			lesson?.id === 'listen' &&
			!$musicHasListened) ||
		(($course === 'image' || $course === 'music') &&
			!laterStop &&
			!researchStop &&
			(lesson?.id === 'invite' || isLast));
	$: onChineseExample = isBridgeSentence($inputText);
	$: chineseChipsReady =
		$course === 'text' && onChineseExample && !$inputScoreStale && labelsHaveSplitGroups($tokens || []);
	$: chineseChipsWaiting = $course === 'text' && onChineseExample && !chineseChipsReady;
	$: seenGenerate = $course === 'text' && !laterStop && lesson?.id === 'generate' && $textHasDrawnWord && !chineseChipsWaiting && !chineseChipsReady;
	$: seenChineseOnGenerate =
		$course === 'text' && !laterStop && (firstStop || lesson?.id === 'generate') && chineseChipsReady;
	$: seenChinese = $course === 'text' && !laterStop && lesson?.id === 'tokens' && chineseChipsReady;
	$: seenImageFirst = firstStop && imageHasStepped;
	$: seenImageStep = $course === 'image' && !laterStop && lesson?.id === 'step' && imageStationAdvanced;
	$: seenMusicFirst = firstStop && musicHasStepped;
	$: seenMusicStep = $course === 'music' && !laterStop && lesson?.id === 'step' && musicStationAdvanced;
	$: slotHidden = $tutorPanelOpen || $courseContrastOpen;
	// One teaching overlay at a time: opening the Library or Ask panel
	// dismisses the embedding-lesson hint so it cannot cover them.
	$: if (($isTextbookOpen || $tutorPanelOpen) && $showEmbeddingLessonHint) {
		showEmbeddingLessonHint.set(false);
	}
	const measureCoach = () => {
		if (typeof document === 'undefined') return;
		const slot = document.querySelector('[data-te-guide="slot"]') as HTMLElement | null;
		const el = slot || (document.querySelector('.coach-bar') as HTMLElement | null);
		if (!el) {
			document.documentElement.style.setProperty('--te-coach-h', '0px');
			return;
		}
		const r = el.getBoundingClientRect();
		const next = r.height > 0 ? `${Math.max(1, Math.ceil(window.innerHeight - r.top))}px` : '0px';
		if (document.documentElement.style.getPropertyValue('--te-coach-h') !== next) {
			document.documentElement.style.setProperty('--te-coach-h', next);
		}
	};
	$: if (typeof document !== 'undefined') {
		void yieldMode;
		void $mathWalkExpanded;
		void slotHidden;
		void $coachVisible;
		requestAnimationFrame(measureCoach);
	};
	$: showLibrary = isLast && !laterStop;
	$: textStepId = $course === 'text' ? textPathIdAt($coachLessonIdx) : '';
	$: ftPreviewed = $course === 'finetune' && $finetuneTokenPreview.length > 0;
	$: seenFinetuneTokens =
		$course === 'finetune' && !laterStop && !researchStop && ftPreviewed && (firstStop || lesson?.id === 'pack');
	$: laterTitle = researchStop
		? $locale !== 'en'
			? '走向研究：本课已有的实验室'
			: 'Toward research: labs already in this course'
		: laterId === 'explore'
			? $locale !== 'en'
				? '先看见过拟合、检查点和遗忘'
				: 'First see overfitting, checkpoints, and forgetting'
			: laterId === 'method'
				? $locale !== 'en'
					? '看改的是哪一块'
					: 'See which piece we change'
				: '';
	$: laterAction = researchStop
		? $locale !== 'en'
			? '下面就是本课壳子里已有的实验室。点一项就能走进去，不必另开工业平台。教材不会自动打开。'
			: 'The list below is the labs already in this course shell. Open one to walk in. This is not a separate industrial platform. The textbook does not open by itself.'
		: laterId === 'explore'
			? $locale !== 'en'
				? '下面就是本课壳子里已有的实验室。点一项就能走进去，不必另开工业平台，也不必自己翻工作室标签。'
				: 'The list below is the labs already in this course shell. Open one to walk in. This is not a separate industrial platform, and you do not have to hunt through workshop tabs.'
			: laterId === 'method'
				? $locale !== 'en'
					? '要改权重，不必一次改全部。看懂这一块怎么改，再决定要不要带上它回文字课。'
					: 'You do not have to change every weight. Read how this piece is changed, then decide whether to take it back to the text course.'
				: '';
	$: laterGoal = researchStop
		? $locale !== 'en'
			? '点下面清单里的一项，就能走进本课已有的实验室。'
			: 'Do this now: open one lab in the list below. These already live in this course.'
		: laterId === 'explore'
			? $locale !== 'en'
				? '点下面清单里的一项，就能走进本课已有的实验室。'
				: 'Do this now: go deeper and see where the difference comes from. Open one lab in the list below.'
			: laterId === 'method'
				? $locale !== 'en'
					? '先看改的是哪一块，不必一次改全部权重。'
					: 'Do this now: see which piece we change.'
				: '';
	$: laterCheck = researchStop || laterId === 'explore'
		? $locale !== 'en'
			? '我看过实验室清单'
			: 'I have seen the lab list'
			: laterId === 'method'
				? $locale !== 'en'
					? '我看过改哪一块'
					: 'I have seen which piece we change'
				: '';
	$: lessonTitle = laterStop
		? laterTitle
		: emptyFirstEye
			? (m.coach as any)?.emptyAfterClearTitle ||
			  ($locale !== 'en' ? '句子空了，先贴一句再看' : 'The sentence is empty — put one in first')
		: chineseChipsWaiting
			? (m.coach as any)?.tokenChipsWaitingTitle ||
			  ($locale !== 'en' ? '正在换上这句中文' : 'Switching to this Chinese sentence')
			: seenFinetuneTokens
			? ((coachPack as any)?.seenTokensTitle as string) ||
			  ((m as any).finetuneUi?.seenTokensTitle as string) ||
			  ($locale !== 'en' ? '句子已经被切开了' : 'The sentence has already been cut into chips')
			: seenChineseOnGenerate
				? (m.coach as any)?.seenChineseOnGenerateTitle ||
				  ($locale !== 'en' ? '左边不是把字重复写了几遍' : 'The left column is not repeating the same character')
			: seenGenerate
				? (m.coach as any)?.seenGenerateTitle || ($locale !== 'en' ? '词已经接到句子后面了' : 'The word is already on the sentence')
			: seenChinese
				? (m.coach as any)?.seenChineseTitle || ($locale !== 'en' ? '已经换上这句中文了' : 'This Chinese sentence is already in place')
			: seenImageFirst || seenMusicFirst
				? ((coachPack as any)?.seenStepTitle as string) ||
				  ($locale !== 'en'
						? $course === 'image'
							? '图已经变清了一点'
							: '下一个音已经出现了'
						: $course === 'image'
							? 'The picture is already a bit clearer'
							: 'The next note has already appeared')
			: seenImageStep || seenMusicStep
				? ((coachPack as any)?.seenStepNextTitle as string) ||
				  ($locale !== 'en'
						? $course === 'image'
							? '图变清了一点，可以再走一步'
							: '下一个音已经出现了，可以再走一步'
						: $course === 'image'
							? 'The picture is clearer; you can take another step'
							: 'The next note is there; you can take another step')
			: lesson.title;
	$: lessonGoal = laterStop
		? laterGoal
		: emptyFirstEye
			? (m.coach as any)?.emptyAfterClearGoal ||
			  ($locale !== 'en'
					? '输入框已经空了。先贴一句或选一句示例，再点「生成下一个词」。'
					: 'The input box is empty. Paste a sentence or pick an example, then click “Generate the next word”.')
		: chineseChipsWaiting
			? ($isFetchingModel
					? (m.coach as any)?.tokenChipsWaitingGoalLoading ||
					  ($locale !== 'en'
							? '模型还在下载。下载完成后会按新句子重算，词片才会出现在左边。'
							: 'The model is still downloading. It will recompute for the new sentence when the download finishes, and only then will the chips appear on the left.')
					: (m.coach as any)?.tokenChipsWaitingGoal ||
					  ($locale !== 'en'
							? '词片还没有画到左边。上一帧先留着，这句算完再更新。'
							: 'The token chips are not on the left yet. The last visible frame stays until this sentence is scored.'))
			: seenFinetuneTokens
			? ((coachPack as any)?.seenTokensGoal as string) ||
			  ((m as any).finetuneUi?.seenTokensGoal as string) ||
			  ($locale !== 'en'
					? '你刚才点的「预览分词」，已经把这句切成可以看见的词片。先确认你看见了，再往下走。'
					: '“Preview tokens” has already cut this sentence into chips you can see. Confirm you can see them, then go on.')
			: seenChineseOnGenerate
				? (m.coach as any)?.seenChineseOnGenerateGoal ||
				  ($locale !== 'en'
						? '中文一个字常被切成多片，不是界面故障。这些小片就叫词片，也就是常说的 token。'
						: 'A Chinese character is often split into several chips — that is not a display bug. These pieces are called 词片, the everyday name for tokens.')
			: seenGenerate
				? (m.coach as any)?.seenGenerateGoal ||
				  ($locale !== 'en'
						? '你刚才点的「生成下一个词」，已经把一个新词接在句子后面。先确认你看见了，再往下走。'
						: '“Generate the next word” has already appended a new word. Confirm you can see it, then go on.')
			: seenChinese
				? (m.coach as any)?.seenChineseGoal ||
				  ($locale !== 'en'
						? '中文一个字常被切成多片，不是界面故障。这些小片就叫词片，也就是常说的 token。先看清左边按字收好的切开。'
						: 'A Chinese character is often split into several chips — that is not a display bug. These pieces are called 词片, the everyday name for tokens. First confirm the grouped cut on the left.')
			: seenImageFirst || seenMusicFirst
				? ((coachPack as any)?.seenStepGoal as string) || lesson.goal
			: seenImageStep || seenMusicStep
				? ((coachPack as any)?.seenStepNextGoal as string) || lesson.goal
			: lesson.goal;
	$: lessonAction = laterStop
		? laterAction
		: emptyFirstEye
			? (m.coach as any)?.emptyAfterClearAction ||
			  ($locale !== 'en'
					? '先贴一句或选一句示例，再点「生成下一个词」。'
					: 'Paste a sentence or pick an example, then click “Generate the next word”.')
		: chineseChipsWaiting
			? (m.coach as any)?.tokenChipsWaitingAction ||
			  ($locale !== 'en' ? '请稍等，等左边出现切开的词片后再看。' : 'Please wait until the split chips appear on the left before inspecting them.')
			: seenFinetuneTokens
			? ((coachPack as any)?.seenTokensAction as string) ||
			  ((m as any).finetuneUi?.seenTokensAction as string) ||
			  ($locale !== 'en'
				? '词片已经摊开。下一步点「推进一步」。'
				: 'The token chips are already visible. Next, click “Take one step”.')
			: seenChineseOnGenerate
				? (m.coach as any)?.seenChineseOnGenerateAction ||
				  ($locale !== 'en'
						? '先看清左边按字收好的切开。也可以继续点「生成下一个词」。'
						: 'First look at the grouped cut on the left. You can also still click “Generate the next word”.')
			: seenGenerate
				? (m.coach as any)?.seenGenerateAction ||
				  ($locale !== 'en' ? '下一步点「推进一步」，去看它怎么把句子切开。' : 'Next, click “Take one step” to see how the sentence is split.')
			: seenChinese
				? (m.coach as any)?.seenChineseAction ||
				  ($locale !== 'en' ? '看左边的词片，然后点「推进一步」。' : 'Look at the chips on the left, then click “Take one step”.')
			: seenImageFirst || seenMusicFirst
				? ((coachPack as any)?.seenStepAction as string) ||
				  ($locale !== 'en' ? '下一步点「推进一步」。' : 'Next, click “Take one step”.')
			: seenImageStep || seenMusicStep
				? ((coachPack as any)?.seenStepNextAction as string) || lesson.action
			: lesson.action;
	$: if ($course === 'image' && (lesson?.id === 'knobs' || lesson?.id === 'invite' || isLast)) unlockImageKnobs(lesson?.id === 'knobs');
	$: if ($course === 'music' && (lesson?.id === 'knobs' || lesson?.id === 'invite' || isLast)) unlockMusicKnobs(lesson?.id === 'knobs');
	$: if ($course === 'text' && lesson?.id === 'knobs') unlockSampling(true);


	$: progressLabel = researchStop
		? $locale !== 'en'
			? '走向研究'
			: 'Toward research'
		: laterStop
			? laterId === 'explore'
				? $locale !== 'en'
					? '选做 · 再深挖'
					: 'Optional · Go deeper'
				: $locale !== 'en'
					? '选做 · 改哪一块'
					: 'Optional · What we change'
			: $course === 'text' && (lesson?.id === 'invite' || isLast)
				? $locale !== 'en'
					? '走向研究'
					: 'Toward research'
				: $course === 'text'
					? `${m.coach.progressPrefix}${idx + 1}${m.coach.progressMid}${Math.max(lessons.length - 1, 1)}${m.coach.progressSuffix}`
					: `${m.coach.progressPrefix}${idx + 1}${m.coach.progressMid}${lessons.length}${m.coach.progressSuffix}`;
	$: slimHasAck = !!(
		seenGenerate ||
		seenChineseOnGenerate ||
		seenChinese ||
		seenFinetuneTokens ||
		seenImageFirst ||
		seenMusicFirst ||
		seenImageStep ||
		seenMusicStep
	);
	$: showSlimAdvance = !holdCoachAdvance;
	// One narrator at a time: an open math walk (or the in-page fine-tune now-do)
	// leads. The coach action button stays; only the kicker is subordinated.
	$: coachNarratorYield = $mathWalkExpanded || ($course === 'finetune' && !$courseContrastOpen);

	const openTextbookFromStart = () => {
		const pages = getActivePages();
		textbookCurrentPage.set(0);
		textbookCurrentPageId.set(pages[0].id);
		isTextbookOpen.set(true);
		coachVisible.set(false);
	};

	const keyStepGate = (id: string | undefined) => {
		if ($course !== 'finetune' || !id) return null;
		const zhNow = $locale !== 'en';
		if (id === 'pack') {
			if ($finetuneTokenPreview.length > 0) return null;
			return {
				sel: '.ft-tokenize',
				msg: zhNow
					? '还没有预览过分词。请先跟着进度轨点「预览分词」，看到词片后再回来点「我做过了」。'
					: 'You have not previewed tokens yet. Follow the rail, click “Preview tokens”, and come back when you can see the chips.'
			};
		}
		if (id === 'baseline') {
			if ($finetuneBaselineSaved) return null;
			return {
				sel: '.ft-baseline',
				msg: zhNow
					? '还没有存下真正的基线续写。训练器连上后，请在这一步点「存下微调前的续写」。没连上时不能把这一步标成已完成。'
					: 'No real baseline continuation has been saved. When the trainer is connected, click “Save the baseline continuation” on this step. This step cannot be marked done while the trainer is off.'
			};
		}
		if (id === 'start') {
			const started =
				$finetuneStatus === 'running' ||
				$finetuneStatus === 'paused' ||
				$finetuneStatus === 'done' ||
				$finetuneRuns.some((r) => r.status === 'done' || r.stoppedReason === 'completed' || r.status === 'running');
			if (started) return null;
			return {
				sel: '.ft-start',
				msg: zhNow
					? '还没有真正开过训。请在这一步做一次极短跑。只看着按钮，还不能算做过。'
					: 'You have not actually started a run yet. Do a short run on this step. Looking at the button is not enough.'
			};
		}
		return null;
	};

	const syncFinetuneSpine = (id: string | undefined) => {
		if ($course !== 'finetune' || !id) return;
		if (id === 'map') setSpineView('see');
		else if (id === 'pack') {
			finetuneSawLine.set(true);
			setSpineView('preview');
		} else if (id === 'baseline') setSpineView('baseline');
		else if (id === 'start') setSpineView('train');
		else if (id === 'compare') setSpineView('compare');
		else if (id === 'loss') setSpineView('loss');
	};

	const advanceLesson = () => {
		if ($course === 'text') {
			textPathNext();
			return;
		}
		if ($course === 'finetune' && $finetuneSpineView === 'method') {
			setSpineView('explore');
			return;
		}
		if ($course === 'finetune' && $finetuneSpineView === 'explore') {
			return;
		}
		if (researchStop) {
			return;
		}
		if (isLast) {
			// Last short-path beat invites the textbook as a library; it does not
			// auto-open it, and finetune no longer jumps to explore (that skipped 损失是什么).
			return;
		}
		const nextIdx = idx + 1;
		coachLessonIdx.set(nextIdx);
		syncFinetuneSpine(lessons[nextIdx]?.id);
	};

	const next = async () => {
		if ($course === 'finetune') {
			const gate = keyStepGate(lesson?.id);
			if (gate) {
				setFinetuneNotice('warn', gate.msg);
				await flashFinetune(gate.sel);
				return;
			}
		}
		advanceLesson();
	};
	const back = () => {
		if ($course === 'text') {
			textPathBack();
			return;
		}
		if (researchStop) {
			closeResearchDoor();
			return;
		}
		if ($course === 'finetune' && ($finetuneSpineView === 'explore' || $finetuneSpineView === 'method')) {
			rewindFinetuneMain();
			return;
		}
		const prev = Math.max(0, idx - 1);
		coachLessonIdx.set(prev);
		syncFinetuneSpine(lessons[prev]?.id);
	};
	const skip = () => advanceLesson();
	const reset = () => {
		coachVisible.set(true);
		coachLessonIdx.set(idx);
	};
	const dismiss = () => coachVisible.set(false);
	const reopen = () => {
		coachVisible.set(true);
		if (idx >= lessons.length - 1) {
			coachLessonIdx.set(0);
		}
	};
	const toggleLocale = () => locale.update((l) => (l === 'zh-CN' ? 'en' : 'zh-CN'));
	const openWorkbench = () => {
		workbenchTab.set('path');
		workbenchOpen.set(true);
	};

	const enterResearchDoor = () => {
		openResearchDoor($course === 'image' || $course === 'music' || $course === 'text' ? $course : undefined);
	};
	const takeMe = async () => {
		const zh = $locale !== 'en';
		if (researchStop) {
			const sel =
				$course === 'image'
					? '[data-te-image="explore-labs"], [data-te-explore="lab-dir"]'
					: $course === 'music'
						? '[data-te-music="explore-labs"], [data-te-explore="lab-dir"]'
						: '[data-te-text="explore-labs"], [data-te-explore="lab-dir"]';
			const el = typeof document !== 'undefined' ? (document.querySelector(sel) as HTMLElement | null) : null;
			if (el) {
				el.classList.add('te-lab-flash');
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				setTimeout(() => el.classList.remove('te-lab-flash'), 1800);
			}
			return;
		}
		if ($course !== 'finetune') return;
		if ($finetuneSpineView === 'explore') {
			setSpineView('explore');
			const okLabs = await flashFinetune('[data-te-ft="explore-labs"], .ft-depth, .ft-now');
			if (!okLabs) {
				setFinetuneNotice(
					'warn',
					zh
						? '这一步对应的画面这会儿找不到。请先看上面的进度轨，跟着「现在做这件事」走。'
						: 'The screen for this step could not be found. Follow the progress rail and “Do this now”.'
				);
			}
			return;
		}
		if ($finetuneSpineView === 'method') {
			setSpineView('method');
			const okMethod = await flashFinetune('[data-te-ft="method"], .ft-method-path, .ft-now');
			if (!okMethod) {
				setFinetuneNotice(
					'warn',
					zh
						? '这一步对应的画面这会儿找不到。请先看上面的进度轨，跟着「现在做这件事」走。'
						: 'The screen for this step could not be found. Follow the progress rail and “Do this now”.'
				);
			}
			return;
		}
		const id = lesson?.id as string | undefined;
		if (id === 'five') {
			await tourFinetuneWorkbench();
			return;
		}
		if (id === 'map') setSpineView('see');
		else if (id === 'loss') setSpineView('loss');
		else if (id === 'method') setSpineView('method');
		else if (id === 'pack') {
			finetuneSawLine.set(true);
			setSpineView('preview');
			if ($finetuneTokenPreview.length > 0) {
				const okSeen = await flashFinetune('[data-te-ft="next-baseline"], .ft-now .ft-guide-go');
				if (!okSeen) {
					setFinetuneNotice(
						'warn',
						zh
							? '这一步对应的画面这会儿找不到。请先看上面的进度轨，跟着「现在做这件事」走。'
							: 'The screen for this step could not be found. Follow the progress rail and “Do this now”.'
					);
				}
				return;
			}
		} else if (id === 'baseline') setSpineView('baseline');
		else if (id === 'start') setSpineView('train');
		else if (id === 'compare') setSpineView('compare');
		const sel = (id && FT_COACH_TARGETS[id]) || '.ft-now';
		const ok = await flashFinetune(sel);
		if (!ok) {
			setFinetuneNotice(
				'warn',
				zh
					? '这一步对应的画面这会儿找不到。请先看上面的进度轨，跟着「现在做这件事」走。'
					: 'The screen for this step could not be found. Follow the progress rail and “Do this now”.'
			);
		}
	};
</script>

{#if $showEmbeddingLessonHint && $course === 'text'}
	<div class="hint-banner" role="status">
		<span>{m.coach.embeddingHint}</span>
		<button type="button" class="link" on:click={() => showEmbeddingLessonHint.set(false)}>{m.coach.ok}</button>
	</div>
{/if}

{#if $coachVisible && !slotHidden}
	<aside class="coach-bar" class:yield={yieldMode} class:narrator-yield={coachNarratorYield} aria-live="polite" data-te-coach={yieldMode ? 'yield' : 'full'} data-te-coach-cut={chineseChipsWaiting ? 'waiting' : chineseChipsReady ? 'ready' : 'none'} data-te-coach-narrator={coachNarratorYield ? 'yield' : 'lead'}>
		<div class="meta">
			<span class="progress" data-te-coach="progress">{progressLabel}</span>
			<h2 class="title">{lessonTitle}</h2>
			{#if $locale === 'en'}
				<button type="button" class="ghost locale-secondary" data-te-locale="coach" on:click={toggleLocale}>中文</button>
			{/if}
			<button type="button" class="ghost quiet" data-te-tutor="coach-ask-mini" on:click={() => openTutorPanel()}>{(m as any).tutor?.ask || ($locale !== 'en' ? '问导师' : 'Ask tutor')}</button>
			<button type="button" class="ghost quiet" data-te-coach="dismiss" on:click={dismiss}>{m.coach.dismiss}</button>
		</div>
		<p class="goal">{lessonGoal}</p>
		<p class="action" class:yield-narrator={coachNarratorYield} data-te-coach="now-do" data-te-coach-narrator={coachNarratorYield ? 'yield' : 'lead'}>
			{#if coachNarratorYield}
				<span class="yield-kicker">{$locale !== 'en' ? '这一站还要做' : 'Still to do at this station'}</span>{$locale !== 'en' ? '：' : ': '}
			{:else}
				<strong>{m.coach.nowDo}</strong>{(m.coach.nowDo || '').endsWith('：') || (m.coach.nowDo || '').endsWith(': ') || (m.coach.nowDo || '').endsWith(':') ? '' : ($locale !== 'en' ? '：' : ': ')}
			{/if}{lessonAction}
		</p>
		<button type="button" class="ask-line" data-te-tutor="coach-ask" on:click={() => openTutorPanel()}>
			{(m as any).tutor?.askLine || ($locale !== 'en' ? '这一步有问题，可以直接问' : 'If this step is unclear, you can ask right now')}
		</button>
		<div class="actions">
			{#if !firstStop}
				<button type="button" class="ghost quiet" on:click={back} disabled={idx === 0 && !laterStop}>{m.coach.back}</button>
			{/if}
			{#if !yieldMode}
			{#if !firstStop}
				<button type="button" class="ghost quiet" on:click={skip}>{m.coach.skip}</button>
			{/if}
			<button type="button" class="ghost quiet" on:click={reset}>{m.coach.lost}</button>
			{#if $course === 'text' && textStepId === 'tokens' && !firstStop && !onChineseExample}
				<button type="button" class="ghost" data-te-path="use-chinese" on:click={useChineseExample}>{m.useChinese || ($locale !== 'en' ? '换上这句中文' : 'Use this Chinese sentence')}</button>
			{/if}
			{#if showLibrary}
				<button type="button" class="ghost" data-te-path="invite" on:click={openWorkbench}>{m.workbench.open}</button>
				<button type="button" class="ghost" on:click={openTextbookFromStart}>{openTextbookLabel}</button>
				{#if isResearchUnlocked()}
					<button type="button" class="ghost" data-te-path="research-door" on:click={enterResearchDoor}>{$locale !== 'en' ? '走进研究门口' : 'Enter the research door'}</button>
				{/if}
			{/if}
			{/if}
			{#if ($course === 'finetune' || researchStop) && !firstStop && !($course === 'finetune' && lesson?.id === 'pack')}
				<button type="button" class="primary" data-te-coach="take-me" on:click={takeMe}>{(coachPack as any)?.takeMe ?? ($locale !== 'en' ? '带我去这一步' : 'Take me there')}</button>
				<button type="button" class="primary done" on:click={next}>{laterStop ? laterCheck : isLast ? lesson.check : ((coachPack as any)?.iDidThis ?? lesson.check)}</button>
			{:else}
				<span data-te-path="push-step"><button type="button" class:primary={!holdCoachAdvance} class:ghost={holdCoachAdvance} data-te-path="coach-next" data-te-path-door={holdCoachAdvance ? 'held' : 'ready'} on:click={next}>{isLast ? lesson.check : (m.textPush || lesson.check)}</button></span>
			{/if}
		</div>
	</aside>
{:else if !$coachVisible && !$tutorPanelOpen && !$courseContrastOpen}
	<aside
		class="coach-slim"
		class:ack={slimHasAck}
		data-te-coach="slim"
		data-te-coach-ack={slimHasAck ? '1' : '0'}
		aria-live="polite"
	>
		<span class="slim-text">
			<span class="slim-progress" data-te-coach="slim-progress">{progressLabel}</span>
			<span class="slim-dot" aria-hidden="true">·</span>
			<span class="slim-title" data-te-coach="slim-title">{lessonTitle}</span>
		</span>
		<div class="slim-actions">
			{#if showSlimAdvance}
				<button
					type="button"
					class="ghost quiet"
					data-te-path="coach-next"
					data-te-path-door="ready"
					on:click={next}>{isLast ? lesson.check : (m.textPush || lesson.check)}</button
				>
			{/if}
			<button type="button" class="slim-expand" data-te-coach="reopen" on:click={reopen}
				>{m.coach.expand || ($locale !== 'en' ? '展开引导' : 'Expand guidance')}</button
			>
		</div>
	</aside>
{/if}

<style lang="scss">
	.hint-banner {
		position: fixed;
		top: 4.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10001;
		max-width: min(720px, 92vw);
		background: #5b21b6;
		color: white;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		display: flex;
		gap: 1rem;
		align-items: center;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
	}
	.hint-banner .link {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.5);
		color: white;
		border-radius: 0.35rem;
		padding: 0.2rem 0.55rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.coach-bar {
		position: relative;
		z-index: 1;
		width: 100%;
		background: rgba(255, 255, 255, 0.97);
		border: 1px solid #ddd6fe;
		border-radius: 0.7rem;
		box-shadow: 0 10px 28px rgba(76, 29, 149, 0.14);
		padding: 0.5rem 0.85rem 0.55rem;
	}
	.meta {
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		margin-bottom: 0.15rem;
	}
	.progress {
		font-size: 0.75rem;
		color: #6d28d9;
		font-weight: 600;
		flex-shrink: 0;
	}
	.title {
		font-size: 0.95rem;
		font-weight: 700;
		color: #1f2937;
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
		line-height: 1.3;
	}
	.goal,
	.action {
		margin: 0.08rem 0;
		color: #374151;
		font-size: 0.82rem;
		line-height: 1.35;
	}
	.goal {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		color: #6b7280;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.4rem;
		justify-content: flex-end;
		align-items: center;
	}
	button {
		font-size: 0.8rem;
	}
	.ghost {
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.35rem;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
		color: #4b5563;
	}
	.ghost.quiet {
		background: transparent;
		border-color: transparent;
		color: #6b7280;
		padding: 0.15rem 0.35rem;
		font-weight: 500;
	}
	.ghost.quiet:hover {
		color: #4c1d95;
		background: #f5f3ff;
	}
	.action.yield-narrator {
		color: #4b5563;
	}
	.action.yield-narrator .yield-kicker {
		font-weight: 600;
		color: #6b7280;
		font-size: 0.78rem;
	}
	.ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.primary {
		background: #7c3aed;
		color: white;
		border: none;
		border-radius: 0.4rem;
		padding: 0.35rem 0.85rem;
		cursor: pointer;
		font-weight: 600;
	}
	.primary.done {
		background: #5b21b6;
	}
	.coach-bar.yield {
		padding: 0.4rem 0.9rem 0.5rem;
	}
	.coach-bar.yield .goal,
	.coach-bar.yield .action {
		display: -webkit-box;
	}
	.coach-bar.yield .action {
		display: block;
	}
	.coach-bar.yield .title {
		font-size: 0.88rem;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.coach-bar.yield .actions {
		margin-top: 0.2rem;
	}
	.ask-line {
		display: inline-block;
		margin: 0.15rem 0 0;
		padding: 0;
		border: none;
		background: transparent;
		color: #6d28d9;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
	}

	.coach-slim {
		position: relative;
		z-index: 1;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.97);
		border: 1px solid #ddd6fe;
		border-radius: 999px;
		box-shadow: 0 4px 14px rgba(76, 29, 149, 0.1);
		padding: 0.22rem 0.4rem 0.22rem 0.75rem;
		min-height: 2.05rem;
		box-sizing: border-box;
	}
	.slim-text {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		font-size: 0.8rem;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.slim-progress {
		color: #6d28d9;
		font-weight: 600;
		flex-shrink: 0;
	}
	.slim-dot {
		color: #6d28d9;
		flex-shrink: 0;
	}
	.slim-title {
		color: #1f2937;
		font-weight: 650;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.slim-actions {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
	}
	.slim-expand {
		border: 1px solid #ddd6fe;
		background: #f5f3ff;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.18rem 0.7rem;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.78rem;
		white-space: nowrap;
	}
	.slim-expand:hover {
		background: #ede9fe;
		color: #4c1d95;
	}
	.reopen {
		position: relative;
		right: auto;
		bottom: auto;
		z-index: 1;
		background: rgba(255, 255, 255, 0.95);
		color: #6d28d9;
		border: 1px solid #ddd6fe;
		border-radius: 999px;
		padding: 0.28rem 0.7rem;
		cursor: pointer;
		font-size: var(--te-fs-caption, 0.75rem);
		font-weight: 600;
		box-shadow: 0 4px 12px rgba(76, 29, 149, 0.1);
		width: auto;
		max-width: max-content;
	}
</style>
