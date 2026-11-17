<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { locale, messages, coachLessonIdx, coachVisible } from '~/i18n';
	import { isTextbookOpen, textbookCurrentPage, textbookCurrentPageId } from '~/store';
	import { getActivePages } from '~/store/course';
	import { stationIndexById } from '~/tutor/pathMap';
	import {
		LORA_MODULE_OPTIONS,
		ONE_KNOB_STEPS,
		OVERFIT_MAX_STEPS,
		RECIPE_RANGES as R,
		SHORT_RUN_STEPS,
		ampLabel,
		cloneRecipe,
		evalPromptsFor,
		evalReading,
		formatLr,
		knobDelta,
		knobHintFor,
		methodLabel,
		runPlainSummary,
		sftDemoTexts,
		DEMO_OVERFIT_METRICS,
		type EvalKind,
		type KnobHint,
		type Recipe
	} from '~/courses/finetune/presets';
	import FtEvalCard from './FtEvalCard.svelte';
	import FtLossChart from './FtLossChart.svelte';
	import FtMethodDiagram from './FtMethodDiagram.svelte';
	import FtProbBars from './FtProbBars.svelte';
	import FtTrainStepDiagram from './FtTrainStepDiagram.svelte';
	import FtLossAsTable from './FtLossAsTable.svelte';
	import FtTokChips from './FtTokChips.svelte';
	import { BRIDGE_SENTENCE_ZH, BRIDGE_SENTENCE_EN, goToTextCourseWithSentence, goToTextCourseWithLora } from '~/courses/bridge';
	import FtSpineRail from './FtSpineRail.svelte';
	import FtDepthPath from './FtDepthPath.svelte';
	import { isFtLaterHash } from '~/utils/teachingHash';
	import { courseContrastOpen } from '~/store/course';
	import { PACK_IDS, TEXT_PACKS } from '~/courses/finetune/packs';
	import {
		applyMethod,
		applyTrainEvent,
		appendLog,
		finetuneAdvanced,
		finetuneBaselineSaved,
		finetuneCompareIds,
		finetuneConnected,
		finetuneError,
		finetuneExplainStep,
		finetuneGenMaxLen,
		finetuneGenTemp,
		finetuneGenTopK,
		finetuneGenTopP,
		finetuneGenerations,
		finetuneHealth,
		finetuneLogs,
		finetuneMetrics,
		finetunePackId,
		finetunePanel,
		finetunePrompts,
		finetuneRecipe,
		finetuneRunId,
		finetuneRuns,
		finetuneSamples,
		finetuneStatus,
		finetuneTokenPreview,
		loadPack,
		newSample,
		refreshHealth,
		restoreRecommended,
		splitSamples,
		startHealthLoop,
		stopHealthLoop,
		computeGuide,
		flashFinetune,
		scrollFinetuneIntoView,
		finetuneComparedAfter,
		finetuneJustFinished,
		finetuneNotice,
		finetuneSawLine,
		finetuneSawLoss,
		finetuneSawMethod,
		finetuneExploreOpen,
		finetuneSpineView,
		FT_SPINE_STOPS,
		setSpineView,
		setFinetuneNotice,
		type Sample,
		type SpineId
	} from '~/courses/finetune/store';
	import {
		approxPieces,
		approxTokenCount,
		downloadExport,
		fetchHealth,
		fetchNextToken,
		generateCompare,
		openEventSource,
		previewTokenize,
		saveEvalCard,
		startTrain,
		trainControl,
		TrainerTimeoutError,
		type TokenProb
	} from '~/courses/finetune/api';

	$: m = ($messages as any).courseUi ?? {};
	$: ui = (($messages as any).finetuneUi ?? {}) as Record<string, string>;
	$: zh = $locale !== 'en';
	const TEASER_ZH = BRIDGE_SENTENCE_ZH;
	const TEASER_EN = BRIDGE_SENTENCE_EN;
	// Canonical shared sentence stays Chinese so both courses tokenize the same line.
	const teaserText = BRIDGE_SENTENCE_ZH;
	type TeaserRow = { tokens: string[]; groups: { group: string | null; items: { text: string; group?: string; incomplete?: boolean }[] }[]; approx: boolean; count?: number };
	let teaserRow: TeaserRow | null = null;
	let teaserLoading = false;
	let autoPreviewTried = false;
	$: liveSplit = splitSamples(
		$finetuneSamples,
		$finetuneRecipe.valRatio,
		$finetuneRecipe.seed,
		$finetuneRecipe.testRatio ?? 0.1
	);
	$: split = splitLocked && lockedSplit ? lockedSplit : liveSplit;
	$: r = $finetuneRecipe;
	$: connected = $finetuneConnected;
	$: health = $finetuneHealth;
	$: running = $finetuneStatus === 'running';
	$: paused = $finetuneStatus === 'paused';
	$: guide = computeGuide({
		sawLine: $finetuneSawLine,
		previewed: $finetuneTokenPreview.length > 0,
		baselineSaved: $finetuneBaselineSaved,
		status: $finetuneStatus,
		runs: $finetuneRuns,
		compared: $finetuneComparedAfter,
		sawLoss: $finetuneSawLoss,
		sawMethod: $finetuneSawMethod
	});
	$: studioOpen = $finetuneExploreOpen;
	$: view = $finetuneSpineView;
	// On 存基线 / 对照, the playground hero is the single in-page now-do.
	$: heroIsNowDo = !studioOpen && (view === 'baseline' || view === 'compare');
	// Optional in-course loss-sketch door, beside 存基线, not a second now-do.
	let lossSketchOpen = false;
	$: if (view !== 'baseline') lossSketchOpen = false;
	const openLossSketch = async () => {
		if (view !== 'baseline') {
			setSpineView('baseline');
			await tick();
		}
		lossSketchOpen = true;
		await tick();
		if (typeof document !== 'undefined') {
			const el =
				document.querySelector('[data-te-ft="loss-sketch"]') ||
				document.querySelector('[data-te-math="loss-walk"]');
			scrollFinetuneIntoView(el);
		}
	};

	$: hasCk =
		$finetuneStatus === 'done' ||
		$finetuneRuns.some((run) => run.status === 'done' || run.stoppedReason === 'completed');
	$: playRunId = (() => {
		const done = (run: (typeof $finetuneRuns)[number]) =>
			run.status === 'done' || run.stoppedReason === 'completed';
		if ($finetuneRunId && $finetuneRuns.some((run) => run.id === $finetuneRunId && done(run))) return $finetuneRunId;
		const found = $finetuneRuns.find(done);
		return found?.id ?? null;
	})();

	let pasteText = '';
	let busy = false;
	let previewing = false;
	let previewEmpty = false;
	let previewApproxReason: 'offline' | 'late' | '' = '';
	let statusMsg = '';
	let maxSteps: number | null = null;
	let shortRun = false;
	let es: EventSource | null = null;
	let showStartHelp = false;
	let showExplainOnExplore = false;
	let prevViewForExplain = view;
	$: if (view !== prevViewForExplain) {
		prevViewForExplain = view;
		if (view === 'explore') {
			showExplainOnExplore = false;
			if (typeof document !== 'undefined') {
				requestAnimationFrame(() => {
					scrollFinetuneIntoView(document.querySelector('[data-te-ft="explore-labs"]') || document.querySelector('.ft-depth'));
				});
			}
		}
		if (view === 'loss' && typeof document !== 'undefined') {
			void tick().then(() => {
				requestAnimationFrame(() => {
					const el =
						document.querySelector('[data-te-math="loss-walk"]') ||
						document.querySelector('.ft-loss-path');
					scrollFinetuneIntoView(el);
				});
			});
		}
		if (view === 'baseline' && typeof document !== 'undefined') {
			void tick().then(() => {
				requestAnimationFrame(() => pinBaselineSave());
			});
		}
	}
	let healthChecking = false;
	let startKind: 'start' | 'short' | 'resume' | 'overfit' | 'oneknob' | '' = '';
	let ctrlKind: 'pause' | 'resume' | 'stop' | '' = '';
	let genKind: 'compare' | 'baseline' | '' = '';
	let exportingId: string | null = null;
	let showAllSamples = false;
	let showRawLogs = false;
	let knobHint: KnobHint | null = null;
	let probsWaiting = false;
	let probTimer: ReturnType<typeof setTimeout> | null = null;
	let loopTick = 0;
	let loopTimer: ReturnType<typeof setInterval> | null = null;
	let leakVal = false;
	let useBest = true;
	let splitLocked = false;
	let lockedSplit: { train: Sample[]; val: Sample[]; test: Sample[] } | null = null;
	let sftMode = false;
	$: sftSampleText = zh
		? '问：残差连接是干什么的？\n答：它把前面的信号直接加到后面，让训练更容易走通。'
		: 'Q: What does a residual connection do?\nA: It adds the earlier signal to the later one, which makes training easier to get through.';
	let oneKnob: 'lr' | 'loraR' = 'lr';
	let knobBaseId: string | null = null;
	let evalFilling = false;
	let evalItems: {
		id: string;
		kind: EvalKind;
		prompt: string;
		base?: string;
		tuned?: string;
		baseProbs?: TokenProb[] | null;
		tunedProbs?: TokenProb[] | null;
	}[] = [];
	let evalReadingText = '';
	let showOverfitDemo = false;
	$: chartMetrics = showOverfitDemo && !running ? DEMO_OVERFIT_METRICS : $finetuneMetrics;

	$: altLr = Math.abs(r.lr - 2e-4) < 1e-8 ? 5e-5 : 2e-4;
	$: altR = r.loraR === 16 ? 8 : 16;
	$: doneRuns = $finetuneRuns.filter((run) => run.status === 'done' || run.stoppedReason === 'completed' || run.stoppedReason === 'early_stop');
	$: knobBase = (knobBaseId && $finetuneRuns.find((x) => x.id === knobBaseId)) || doneRuns[0] || null;
	$: evalSource = ($finetuneRunId && $finetuneRuns.find((x) => x.id === $finetuneRunId)) || $finetuneRuns.find((x) => x.id === playRunId) || doneRuns[0] || null;
	$: evalPromptList = evalPromptsFor({ zh, sftMode });
	$: if (!evalItems.length && evalPromptList.length) {
		evalItems = evalPromptList.map((p) => ({ id: p.id, kind: p.kind, prompt: p.text }));
	}

	const failText = (err: any, fallback: string) => {
		if (err instanceof TrainerTimeoutError || err?.name === 'TrainerTimeoutError' || err?.message === 'TIMEOUT') {
			return ui.timeoutHint || (zh ? '训练器这次没有及时返回。请确认服务还在 8787 端口，然后再点一次。' : 'The trainer did not answer in time. Confirm the service is still on port 8787, then try again.');
		}
		return String(err?.message || err || fallback);
	};

	const tell = async (tone: 'info' | 'warn' | 'ok', text: string, scrollSel?: string) => {
		statusMsg = text;
		setFinetuneNotice(tone, text);
		await tick();
		const sel = scrollSel || '.ft-notice';
		scrollFinetuneIntoView(document.querySelector(sel));
	};

	const offlineLesson = () =>
		ui.offlineCanDo ||
		(zh
			? '还能读教材、预览约数，但不能真开训或存真实续写。'
			: 'You can still read the textbook and preview approximate tokens, but you cannot actually start training or save a real continuation.');

	const tabs: { id: typeof $finetunePanel; zh: string; en: string }[] = [
		{ id: 'explain', zh: '学习步骤', en: 'Learning steps' },
		{ id: 'data', zh: '数据台', en: 'Data' },
		{ id: 'recipe', zh: '方法与参数', en: 'Recipe' },
		{ id: 'train', zh: '训练监控', en: 'Monitor' },
		{ id: 'play', zh: '对照游乐场', en: 'Playground' },
		{ id: 'archive', zh: '实验档案', en: 'Archive' }
	];

	let depthStop: 'overfit' | 'ckpt' | 'forget' | 'eval' | 'sft' = 'overfit';
	let depthLater: 'map' | 'dpo' | 'qlora' | null = null;
	let depthWalkedIn = false;
	const depthTitleZh: Record<string, string> = {
		overfit: '看过拟合',
		ckpt: '选检查点',
		forget: '看遗忘',
		eval: '看评测卡',
		sft: '试问答格式'
	};
	const depthTitleEn: Record<string, string> = {
		overfit: 'Overfitting',
		ckpt: 'Checkpoint',
		forget: 'Forgetting',
		eval: 'Eval card',
		sft: 'Q/A format'
	};

	const applyDepthHash = () => {
		if (typeof location === 'undefined') return;
		const h = location.hash;
		if (!isFtLaterHash(h)) return;
		setSpineView('explore');
		courseContrastOpen.set(false);
		if (h === '#ft-eval') {
			depthStop = 'eval';
			depthLater = null;
			depthWalkedIn = true;
		} else if (h === '#ft-dpo') {
			depthLater = 'dpo';
			depthWalkedIn = false;
		} else if (h === '#ft-qlora') {
			depthLater = 'qlora';
			depthWalkedIn = false;
		} else if (h === '#ft-map') {
			depthLater = 'map';
			depthWalkedIn = false;
		}
	};

	onMount(() => {
		startHealthLoop();
		if ($finetuneSamples.length === 0) loadPack('notes');
		applyDepthHash();
		window.addEventListener('hashchange', applyDepthHash);
		(window as any).__teFtGotoSpine = (id: string) => {
			// Open the loss sketch beside 存基线 without writing a live baseline
			// and without starting a train. 'loss' still jumps to the later spine
			// view, which already shows the same numbers-on-this-screen walk.
			if (id === 'loss-sketch') {
				void openLossSketch();
				return;
			}
			const next = (id === 'watching' ? 'train' : id) as SpineId;
			// A hook jump is just a view change. It must not mark method/loss as
			// already seen, or coach Back after an early 再深挖 would walk into
			// those unearned stations.
			setSpineView(next);
		};
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') delete (window as any).__teFtGotoSpine;
		window.removeEventListener('hashchange', applyDepthHash);
		stopHealthLoop();
		if (es) es.close();
		if (probTimer) clearTimeout(probTimer);
		if (loopTimer) clearInterval(loopTimer);
	});

	const translateLog = (msg: string) => {
		if (!msg) return '';
		let m: RegExpMatchArray | null;
		if ((m = msg.match(/^device=(\S+) base=(\S+) method=(\S+)/))) {
			const dev = m[1].includes('cuda') || m[1] !== 'cpu' ? (zh ? '本机显卡' : 'this GPU') : 'CPU';
			const base = m[2] === 'gpt2-medium' ? 'GPT-2 medium' : 'GPT-2 small';
			const method = methodLabel(m[3], zh);
			return zh ? `用${dev}加载 ${base}，方法是${method}。` : `Loading ${base} on ${dev}, method: ${method}.`;
		}
		if ((m = msg.match(/^model=(\S+) trainable=(\d+) \/ (\d+)/))) {
			return zh
				? `模型 ${m[1] === 'gpt2-medium' ? 'GPT-2 medium' : 'GPT-2 small'} 已就绪。正在训练 ${Number(m[2]).toLocaleString()} 个参数，总共约 ${Number(m[3]).toLocaleString()} 个。`
				: `Model ${m[1]} is ready. Training ${Number(m[2]).toLocaleString()} parameters out of about ${Number(m[3]).toLocaleString()}.`;
		}
		if (msg.startsWith('LEAK on')) {
			const mm = msg.match(/train=(\d+) val=(\d+) test=(\d+)/);
			return zh
				? `演示：验证集漏进了训练（训练 ${mm?.[1] ?? '?'}，验证 ${mm?.[2] ?? '?'}，测试 ${mm?.[3] ?? '0'}）。验证读数可能假好。`
				: `Demo: the validation set leaked into training (train ${mm?.[1] ?? '?'}, val ${mm?.[2] ?? '?'}, test ${mm?.[3] ?? '0'}). The val score may look falsely good.`;
		}
		if ((m = msg.match(/^split train=(\d+) val=(\d+)(?: test=(\d+))?/))) {
			return zh
				? `已拆好：用来训练 ${m[1]} 条，留下来检查 ${m[2]} 条${m[3] ? `，另留测试 ${m[3]} 条` : ''}。验证集和测试集不会进入更新。`
				: `Split: ${m[1]} for training, ${m[2]} held out${m[3] ? `, ${m[3]} test` : ''}. Held-out sets are not used in the update.`;
		}
		if ((m = msg.match(/^resumed from step (\d+)/))) {
			return zh ? `已从第 ${m[1]} 步的检查点继续。` : `Resumed from step ${m[1]}.`;
		}
		if (msg.startsWith('resume failed')) {
			return zh ? `没能从检查点恢复，改为从头开始。${msg.replace(/^resume failed,?\s*/i, '')}` : msg;
		}
		if ((m = msg.match(/^step (\d+)\/(\d+) train_loss=([0-9.]+)/))) {
			return zh ? `第 ${m[1]} / ${m[2]} 步，训练损失 ${m[3]}。` : `Step ${m[1]} / ${m[2]}, training loss ${m[3]}.`;
		}
		if (msg.startsWith('eval failed')) {
			return zh ? `这一轮验证没算成：${msg.replace(/^eval failed:\s*/i, '')}` : msg;
		}
		if ((m = msg.match(/^early stop after (\d+)/))) {
			return zh
				? `验证损失连续 ${m[1]} 次没有变好，已提前停下。多训几轮不一定更好。`
				: `Validation did not improve for ${m[1]} checks, so training stopped early. More passes are not automatically better.`;
		}
		if (msg.startsWith('save failed')) {
			return zh ? `保存检查点时出了问题：${msg.replace(/^save failed:\s*/i, '')}` : msg;
		}
		if ((m = msg.match(/^finished \((.+)\) at step (\d+)/))) {
			const why =
				m[1] === 'early_stop' ? (zh ? '因为验证不再变好而提前停下' : 'stopped early') : m[1] === 'completed' ? (zh ? '按计划跑完' : 'finished as planned') : m[1];
			return zh ? `训练结束（${why}），停在第 ${m[2]} 步。` : `Training finished (${why}) at step ${m[2]}.`;
		}
		if ((m = msg.match(/^kept best validation checkpoint at step (\d+) \(val_loss=([0-9.]+)\)/))) {
			return zh
				? `已尽量选中验证最好的那一次：第 ${m[1]} 步，验证损失 ${m[2]}。导出的仍是旁边加的一小块；没合并前，基座原文件通常还在。`
				: `Kept the checkpoint with the best validation loss: step ${m[1]}, val loss ${m[2]}. The export is still the small add-on; until you merge, the original base file usually stays.`;
		}
		if ((m = msg.match(/^test_loss=([0-9.]+)/))) {
			return zh
				? `开训前留下的测试集损失是 ${m[1]}。它不参与更新，只作最后一看。`
				: `Test-set loss is ${m[1]}. It was not used in the update, only as a final look.`;
		}
		if (msg === 'paused') return zh ? '已暂停。' : 'Paused.';
		if (msg === 'resumed') return zh ? '已继续训练。' : 'Resumed.';
		if (msg === 'stopping') return zh ? '正在停下。' : 'Stopping.';
		return msg;
	};

	$: keyEvents = $finetuneLogs.map(translateLog).filter(Boolean).slice(-12);

	const memUsedGb = () => ((health?.vramUsedMb ?? 0) / 1024).toFixed(1);
	$: memTight =
		((health?.vramUsedMb ?? 0) / Math.max(1, health?.vramTotalMb ?? 8192) > 0.82) ||
		r.seqLen >= 1024 ||
		r.batchSize * r.gradAccum >= 16;
	$: memLine = zh ? `已用 ${memUsedGb()} / 共约 8GB` : `Used ${memUsedGb()} / about 8GB`;

	const lockSplit = () => {
		lockedSplit = liveSplit;
		splitLocked = true;
	};
	const unlockSplit = () => {
		splitLocked = false;
		lockedSplit = null;
	};
	const loadSftDemo = () => {
		const texts = sftDemoTexts(zh);
		finetuneSamples.set(texts.map((text) => newSample(text)));
		finetunePackId.set(null);
		sftMode = true;
		unlockSplit();
		const prompts = evalPromptsFor({ zh, sftMode: true }).filter((p) => p.kind === 'sft').map((p) => p.text);
		if (prompts.length) finetunePrompts.set(prompts);
		evalItems = evalPromptsFor({ zh, sftMode: true }).map((p) => ({ id: p.id, kind: p.kind, prompt: p.text }));
		evalReadingText = '';
	};
	const chosenRun = () =>
		evalSource || $finetuneRuns.find((x) => x.id === playRunId) || doneRuns[0] || null;

	const fillEvalCard = async () => {
		if (evalFilling) return;
		const prompts = evalPromptsFor({ zh, sftMode });
		evalItems = prompts.map((p) => ({ id: p.id, kind: p.kind, prompt: p.text }));
		if (!connected) {
			await tell('warn', ui.offlineGenHint || (zh ? '训练器未连接，不能填写真实评测卡。' : 'The trainer is not connected, so the eval card cannot be filled with real continuations.'), '.ft-eval');
			return;
		}
		evalFilling = true;
		try {
			const run = chosenRun();
			const rid = run?.id ?? playRunId;
			const gen = await generateCompare(
				{
					prompts: prompts.map((p) => p.text),
					temperature: $finetuneGenTemp,
					topK: $finetuneGenTopK,
					topP: $finetuneGenTopP,
					maxLength: 40,
					runId: rid
				},
				120000
			);
			let probs: { items: { prompt: string; baseProbs?: TokenProb[]; tunedProbs?: TokenProb[] }[] } = { items: [] };
			try {
				probs = await fetchNextToken({
					prompts: prompts.map((p) => p.text),
					temperature: $finetuneGenTemp,
					topK: $finetuneGenTopK,
					topP: $finetuneGenTopP,
					runId: rid
				});
			} catch {
				probs = { items: [] };
			}
			evalItems = prompts.map((p, i) => {
				const g = gen.items?.[i];
				const pr = probs.items?.[i];
				return {
					id: p.id,
					kind: p.kind,
					prompt: p.text,
					base: g?.base,
					tuned: g?.tuned,
					baseProbs: pr?.baseProbs || g?.baseProbs,
					tunedProbs: pr?.tunedProbs || g?.tunedProbs
				};
			});
			evalReadingText = evalReading(evalItems, { leak: !!(run?.leakVal || run?.recipe?.leakVal), zh });
			if (rid) {
				try {
					await saveEvalCard(rid, {
						reading: evalReadingText,
						readingEn: evalReading(evalItems, { leak: !!(run?.leakVal || run?.recipe?.leakVal), zh: false }),
						valLoss: run?.bestValLoss ?? lastLoss(run as any, 'valLoss'),
						testLoss: run?.testLoss ?? null,
						items: evalItems,
						kind: 'course-card'
					});
				} catch {
					/* archive save is optional */
				}
			}
			await tell('ok', zh ? '评测卡已填写。请同时看验证损失、语料内外提示、概率条和续写。' : 'The eval card is filled. Look at val loss, in- and out-of-corpus prompts, bars, and continuations together.', '.ft-eval');
		} catch (err: any) {
			await tell('warn', failText(err, zh ? '评测卡没能填写完成。' : 'Could not fill the eval card.'), '.ft-eval');
		} finally {
			evalFilling = false;
		}
	};

	const refreshProbs = async () => {
		if (!connected) return;
		const prompts = $finetunePrompts.filter((p) => p.trim());
		if (!prompts.length) return;
		probsWaiting = true;
		try {
			const data = await fetchNextToken({
				prompts,
				temperature: $finetuneGenTemp,
				topK: $finetuneGenTopK,
				topP: $finetuneGenTopP,
				runId: playRunId
			});
			const items = data.items || [];
			finetuneGenerations.update((cur) =>
				prompts.map((prompt) => {
					const n = items.find((x) => x.prompt === prompt);
					const old = cur.find((x) => x.prompt === prompt);
					return {
						prompt,
						base: old?.base || '',
						tuned: old?.tuned || '',
						baseProbs: n?.baseProbs || old?.baseProbs || [],
						tunedProbs: n?.tunedProbs || old?.tunedProbs || [],
						hasTuned: n?.hasTuned ?? old?.hasTuned ?? false
					};
				})
			);
		} catch (err: any) {
			if ($finetunePanel === 'play') {
				setFinetuneNotice('warn', failText(err, zh ? '没能取到下一个词的概率排行。请确认训练器仍在。' : 'Could not fetch the next-token ranking.'));
			}
		} finally {
			probsWaiting = false;
		}
	};

	const scheduleProbs = () => {
		if (probTimer) clearTimeout(probTimer);
		probTimer = setTimeout(() => {
			refreshProbs();
		}, 450);
	};

	$: playProbKey = `${$finetunePanel}|${connected}|${playRunId}|${$finetunePrompts.join('\n')}|${$finetuneGenTemp}|${$finetuneGenTopK}|${$finetuneGenTopP}`;
	$: if ($finetunePanel === 'play' && connected) {
		void playProbKey;
		scheduleProbs();
	}

	$: if (running) {
		if (!loopTimer) {
			loopTimer = setInterval(() => {
				loopTick = (loopTick + 1) % 4;
			}, 900);
		}
	} else if (loopTimer) {
		clearInterval(loopTimer);
		loopTimer = null;
	}

	$: loopActive = view === 'loss' ? 1 : running ? loopTick : $finetuneExplainStep;

	const setR = (patch: Partial<Recipe>) => {
		knobHint = knobHintFor(patch, get(finetuneRecipe));
		finetuneRecipe.update((x) => ({ ...x, ...patch }));
	};

	const chooseMethod = (method: Recipe['method']) => {
		knobHint = knobHintFor({ method }, get(finetuneRecipe));
		applyMethod(method);
	};

	const toggleModule = (id: string) => {
		finetuneRecipe.update((x) => {
			const has = x.loraModules.includes(id);
			const loraModules = has ? x.loraModules.filter((m) => m !== id) : [...x.loraModules, id];
			return { ...x, loraModules };
		});
	};

	const addBlank = () => finetuneSamples.update((xs) => [...xs, newSample('')]);
	const removeSample = (id: string) => finetuneSamples.update((xs) => xs.filter((s) => s.id !== id));
	const editSample = (id: string, text: string) =>
		finetuneSamples.update((xs) => xs.map((s) => (s.id === id ? { ...s, text } : s)));

	const importPaste = () => {
		const chunks = pasteText
			.split(/\n\s*\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (!chunks.length) {
			tell(
				'warn',
				ui.importEmpty ||
					(zh
						? '粘贴框是空的，没有导入任何样本。请先贴上文本，空一行表示下一条。'
						: 'The paste box is empty, so nothing was imported.')
			);
			return;
		}
		finetuneSamples.update((xs) => [...xs, ...chunks.map((t) => newSample(t))]);
		pasteText = '';
		tell('ok', (ui.importOk || (zh ? '已导入 {n} 条样本。' : 'Imported {n} samples.')).replace('{n}', String(chunks.length)));
	};

	const onUpload = async (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		const raw = await f.text();
		let texts: string[] = [];
		const name = f.name.toLowerCase();
		if (name.endsWith('.json')) {
			try {
				const parsed = JSON.parse(raw);
				const arr = Array.isArray(parsed)
					? parsed
					: parsed.texts || parsed.samples || parsed.data || [];
				if (!Array.isArray(arr)) throw new Error('not-array');
				texts = (arr as any[])
					.map((x) => (typeof x === 'string' ? x : x?.text || x?.content || ''))
					.filter((s) => String(s).trim())
					.map((s) => String(s));
			} catch {
				input.value = '';
				await tell(
					'warn',
					ui.importJsonFail ||
						(zh
							? '这份 JSON 解析失败，没有导入任何样本。请检查是不是完整的 JSON 数组，或改用每行一条的 jsonl、纯文本。'
							: 'This JSON could not be parsed, so nothing was imported.')
				);
				return;
			}
		} else if (name.endsWith('.jsonl')) {
			const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
			let bad = 0;
			for (const line of lines) {
				try {
					const o = JSON.parse(line);
					const s = typeof o === 'string' ? o : o.text || o.content || '';
					if (String(s).trim()) texts.push(String(s));
					else bad += 1;
				} catch {
					bad += 1;
				}
			}
			if (!texts.length) {
				input.value = '';
				await tell(
					'warn',
					ui.importJsonFail ||
						(zh
							? '这份 JSON 解析失败，没有导入任何样本。请检查是不是完整的 JSON 数组，或改用每行一条的 jsonl、纯文本。'
							: 'This JSON could not be parsed, so nothing was imported.')
				);
				return;
			}
		} else {
			texts = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
			if (texts.length <= 1) texts = raw.split('\n').map((s) => s.trim()).filter(Boolean);
		}
		input.value = '';
		if (!texts.length) {
			await tell('warn', ui.importNone || (zh ? '文件里没有读到可用的文本，没有导入任何样本。' : 'No usable text was found in the file, so nothing was imported.'));
			return;
		}
		finetuneSamples.update((xs) => [...xs, ...texts.map((s) => newSample(s))]);
		await tell('ok', (ui.importOk || (zh ? '已导入 {n} 条样本。' : 'Imported {n} samples.')).replace('{n}', String(texts.length)));
	};

	const approxPreview = (texts: string[]) =>
		texts.map((text) => {
			const n = approxTokenCount(text);
			const tokens = approxPieces(text);
			const truncated = n > r.seqLen;
			return {
				count: Math.min(r.seqLen, n),
				tokens,
				truncated,
				approx: true as const,
				totalCount: n,
				dropped: truncated ? tokens.slice(-4) : [],
				droppedInfos: truncated ? tokens.slice(-4).map((t: string) => ({ text: t })) : []
			};
		});

	const fillPieces = (rows: any[], texts: string[]) =>
		rows.map((row, i) => ({
			...row,
			count: row.count,
			tokens: row.tokens && row.tokens.length ? row.tokens : approxPieces(texts[i] ?? ''),
			truncated: !!row.truncated,
			approx: !!row.approx,
			tokenInfos: row.tokenInfos,
			dropped: row.dropped,
			droppedInfos: row.droppedInfos,
			totalCount: row.totalCount,
			keptHidden: row.keptHidden,
			droppedHidden: row.droppedHidden
		}));

	const tokenChip = (tok: string) =>
		(tok || '').replace(/\n/g, '↵').replace(/\r/g, '').replace(/\t/g, '⇥').replace(/ /g, '␣') || '∅';

	type Chip = { text: string; group?: string; incomplete?: boolean };
	const chipGroups = (infos?: Chip[], tokens?: string[]) => {
		const list: Chip[] = infos && infos.length ? infos : (tokens || []).map((text) => ({ text }));
		const groups: { group: string | null; items: Chip[] }[] = [];
		let i = 0;
		while (i < list.length) {
			const g = list[i].group;
			if (g) {
				let j = i + 1;
				while (j < list.length && list[j].group === g) j += 1;
				groups.push({ group: g, items: list.slice(i, j) });
				i = j;
			} else {
				groups.push({ group: null, items: [list[i]] });
				i += 1;
			}
		}
		return groups;
	};

	$: previewRows = (() => {
		const samples = $finetuneSamples.filter((s) => s.text.trim()).slice(0, 40);
		const valIds = new Set(split.val.map((s) => s.id));
		const rows = $finetuneTokenPreview.map((p, i) => {
			const sample = samples[i];
			const side = sample && valIds.has(sample.id) ? 'val' : 'train';
			return {
				...p,
				side,
				index: i,
				sourceText: sample?.text ?? '',
				groups: chipGroups((p as any).tokenInfos, p.tokens),
				dropGroups: chipGroups((p as any).droppedInfos, p.dropped)
			};
		});
		const vis = rows.slice(0, 8);
		if (vis.length && !vis.some((r) => r.side === 'val')) {
			const v = rows.find((r) => r.side === 'val');
			if (v) vis[vis.length - 1] = v;
		}
		return vis;
	})();

	const doPreview = async () => {
		if (previewing) return;
		const texts = $finetuneSamples.map((s) => s.text).filter((t) => t.trim()).slice(0, 40);
		if (!texts.length) {
			previewEmpty = true;
			await tell(
				'warn',
				ui.tokEmpty ||
					(zh
						? '还没有可预览的文本。请先载入示例包、粘贴文本，或新增一条，再点预览。'
						: 'There is no text to preview yet.'),
				'.ft-tok-empty, .ft-notice'
			);
			return;
		}
		previewEmpty = false;
		previewApproxReason = '';
		previewing = true;
		try {
			const healthNow = await fetchHealth(2500);
			let remote = null;
			if (healthNow && healthNow.ok) {
				remote = await previewTokenize(texts, r.seqLen, 35000);
			}
			if (remote && remote.length) {
				finetuneTokenPreview.set(fillPieces(remote, texts));
				previewApproxReason = remote[0]?.approx ? 'late' : '';
			} else {
				previewApproxReason = healthNow && healthNow.ok ? 'late' : 'offline';
				finetuneTokenPreview.set(approxPreview(texts));
			}
			await tick();
			pinTokensBelowNowDo();
		} catch {
			finetuneTokenPreview.set(approxPreview(texts));
			await tick();
			pinTokensBelowNowDo();
		} finally {
			previewing = false;
		}
	};

	const closeEs = () => {
		if (es) {
			es.close();
			es = null;
		}
	};

	const listen = (runId: string) => {
		closeEs();
		es = openEventSource(runId, (ev) => applyTrainEvent(ev));
		es.onerror = () => appendLog(zh ? '进度连接中断了，接下来会靠刷新状态继续。' : 'The live progress link dropped; status will keep refreshing.');
	};

	const doStart = async (opts?: {
		resume?: boolean;
		dry?: boolean;
		experiment?: 'short' | 'overfit' | 'one-knob' | 'leak';
		maxSteps?: number | null;
		recipePatch?: Record<string, unknown>;
		leak?: boolean;
	}) => {
		if (busy) return;
		busy = true;
		startKind = opts?.experiment === 'overfit' ? 'overfit' : opts?.experiment === 'one-knob' ? 'oneknob' : opts?.dry || opts?.experiment === 'short' ? 'short' : opts?.resume ? 'resume' : 'start';
		statusMsg = '';
		finetuneError.set(null);
		const startingMsg =
			startKind === 'short'
				? ui.startingShort || (zh ? '正在开始极短跑…' : 'Starting a short run…')
				: startKind === 'resume'
					? ui.resuming || (zh ? '正在恢复…' : 'Resuming…')
					: ui.startingTrain || (zh ? '正在开训…' : 'Starting training…');
		await tell('info', startingMsg, '.ft-notice, .ft-start');
		try {
			const h = await refreshHealth();
			if (!h?.ok) {
				finetunePanel.set('train');
				await tell('warn', ui.offlineTrainHint || (zh ? '训练器未连接，不能真开训。还能读教材、预览约数。请先展开启动说明，把服务开起来。' : 'The trainer is not connected, so training cannot start.'), '.ft-notice');
				return;
			}
			if (!h.torch) {
				await tell(
					'warn',
					zh
						? '服务已启动，但还没有安装 PyTorch 等训练依赖。请看启动说明或 finetune-lab/README.md。'
						: 'The service is up, but PyTorch is not installed. See the start instructions or finetune-lab/README.md.'
				);
				return;
			}
			const texts = $finetuneSamples.map((s) => s.text.trim()).filter(Boolean);
			if (texts.length < 8) {
				finetunePanel.set('data');
				await tell('warn', zh ? '请至少准备大约 8 条文本（实验建议 80–300 条）。请先到数据台补样本。' : 'Please prepare at least about 8 texts (labs suggest 80–300).');
				return;
			}
			if (!splitLocked) lockSplit();
			const recipe: Record<string, unknown> = { ...cloneRecipe($finetuneRecipe), ...(opts?.recipePatch || {}) };
			const leak = opts?.leak ?? leakVal;
			recipe.leakVal = leak;
			recipe.useBestCheckpoint = useBest;
			recipe.testRatio = $finetuneRecipe.testRatio ?? 0.1;
			if (opts?.experiment) recipe.experiment = opts.experiment;
			if (opts?.experiment === 'overfit') {
				recipe.earlyStop = 0;
				recipe.evalEvery = 2;
				recipe.epochs = Math.max(Number(recipe.epochs) || 3, 6);
			}
			if (opts?.experiment === 'one-knob' && knobBase?.id) {
				recipe.baselineRunId = knobBase.id;
			}
			const steps =
				opts?.maxSteps != null
					? opts.maxSteps
					: opts?.dry || opts?.experiment === 'short' || shortRun
						? SHORT_RUN_STEPS
						: opts?.experiment === 'overfit'
							? OVERFIT_MAX_STEPS
							: opts?.experiment === 'one-knob'
								? ONE_KNOB_STEPS
								: maxSteps;
			const payload: Record<string, unknown> = {
				recipe,
				texts,
				trainTexts: split.train.map((s) => s.text),
				valTexts: split.val.map((s) => s.text),
				testTexts: split.test.map((s) => s.text),
				leakVal: leak,
				useBestCheckpoint: useBest,
				resumeFrom: opts?.resume ? $finetuneRunId : null,
				maxSteps: steps
			};
			const { runId } = await startTrain(payload);
			finetuneRunId.set(runId);
			finetuneStatus.set('running');
			finetuneMetrics.set([]);
			if (opts?.experiment === 'one-knob') {
				knobBaseId = knobBase?.id ?? knobBaseId;
				finetuneCompareIds.set([knobBaseId, runId]);
			}
			appendLog((zh ? '已开始训练：' : 'Started run: ') + runId);
			listen(runId);
			setSpineView('train');
			await tell('ok', (zh ? '训练已开始：' : 'Training started: ') + runId, '.ft-curve, .ft-notice');
		} catch (err: any) {
			const msg = failText(err, zh ? '无法开始训练' : 'Could not start training');
			finetuneError.set(msg);
			finetuneStatus.set('error');
			await tell('warn', msg);
		} finally {
			busy = false;
			startKind = '';
		}
	};

	const doCtrl = async (action: 'pause' | 'resume' | 'stop') => {
		if (ctrlKind || busy) return;
		ctrlKind = action;
		const waiting =
			action === 'pause'
				? ui.pausing || (zh ? '正在暂停…' : 'Pausing…')
				: action === 'resume'
					? ui.resuming || (zh ? '正在恢复…' : 'Resuming…')
					: ui.stopping || (zh ? '正在停止…' : 'Stopping…');
		await tell('info', waiting, '.ft-notice');
		try {
			await trainControl(action, $finetuneRunId ?? undefined);
			if (action === 'resume' && $finetuneRunId) listen($finetuneRunId);
			if (action === 'stop') closeEs();
			await refreshHealth();
			await tell(
				'ok',
				action === 'pause'
					? (zh ? '已请求暂停。' : 'Pause requested.')
					: action === 'resume'
						? (zh ? '已请求恢复。' : 'Resume requested.')
						: (zh ? '已请求停止。' : 'Stop requested.')
			);
		} catch (err: any) {
			const msg = failText(err, zh ? '训练控制失败' : 'Training control failed');
			finetuneError.set(msg);
			await tell('warn', msg);
		} finally {
			ctrlKind = '';
		}
	};

	const doGenerate = async (asBaseline: boolean) => {
		if (busy) return;
		busy = true;
		genKind = asBaseline ? 'baseline' : 'compare';
		statusMsg = '';
		await tell(
			'info',
			asBaseline
				? ui.savingBaseline || (zh ? '正在生成微调前的基线续写…' : 'Generating the pre-training baseline…')
				: ui.comparing || (zh ? '正在对照续写…' : 'Comparing continuations…'),
			'.ft-notice, .ft-baseline, .ft-compare'
		);
		try {
			const h = await refreshHealth();
			if (!h?.ok) {
				if (asBaseline) finetuneBaselineSaved.set(false);
				await tell('warn', asBaseline
					? (ui.baselineNeedTrainer || (zh ? '还没存下真正续写。训练器没连上时，不能把这一步标成已完成。请先启动训练器，再点一次「存下微调前的续写」。' : 'No real continuation was saved.'))
					: (ui.offlineGenHint || (zh ? '训练器未连接，不能存真实续写或对照。还能读教材、预览约数。请先启动训练器。' : 'The trainer is not connected.')));
				return;
			}
			const data = await generateCompare({
				prompts: $finetunePrompts.filter((p) => p.trim()),
				temperature: $finetuneGenTemp,
				topK: $finetuneGenTopK,
				topP: $finetuneGenTopP,
				maxLength: $finetuneGenMaxLen,
				runId: playRunId
			});
			const items = data.items || [];
			finetuneGenerations.set(items);
			const hasText = items.some((it) => (it.base || '').trim());
			if (asBaseline) {
				if (hasText) {
					finetuneBaselineSaved.set(true);
					await tell('ok', (ui.baselineSaved || (zh ? '已存下微调前的基线续写。' : 'Baseline saved.')) + ' ' + (ui.nextTrain || (zh ? '下一步：先跑 2 步，确认能通。' : 'Next: run 2 steps to confirm it works.')), '.ft-playground, .ft-notice');
				} else {
					finetuneBaselineSaved.set(false);
					await tell('warn', ui.baselineEmpty || (zh ? '训练器没有返回可用的续写，基线没有存下。请稍后再试。' : 'No baseline was saved.'));
				}
			} else if (hasCk) {
				finetuneComparedAfter.set(true);
				await tell('ok', zh ? '对照续写已生成，请看下面的前后两段。' : 'The comparison is ready. See the two continuations below.', '.ft-playground, .ft-notice');
			} else {
				await tell('ok', zh ? '基座续写已生成。「微调后」还要等一次训练完成。' : 'The base continuation is ready. The fine-tuned side needs a finished run.');
			}
		} catch (err: any) {
			if (asBaseline) finetuneBaselineSaved.set(false);
			const msg = failText(err, zh ? '续写失败' : 'Generation failed');
			finetuneError.set(msg);
			await tell('warn', msg);
		} finally {
			busy = false;
			genKind = '';
		}
	};

	const doRecheck = async (from: 'banner' | 'archive') => {
		if (healthChecking) return;
		healthChecking = true;
		await tell(
			'info',
			from === 'archive'
				? ui.archiveChecking || (zh ? '正在刷新档案…' : 'Refreshing the archive…')
				: ui.recheckChecking || (zh ? '正在检测训练器…' : 'Checking the trainer…')
		);
		const h = await refreshHealth();
		healthChecking = false;
		if (!h?.ok) {
			await tell(
				'warn',
				from === 'archive'
					? ui.archiveStillDown || (zh ? '还是没连上训练器。档案要向本机服务要列表，请先启动训练器再刷新。' : 'Still not connected to the trainer.')
					: ui.recheckStillDown || (zh ? '还是没连上。教材、自测和数据台还能用；要真开训或存真实续写，需要先展开下面的启动说明，把训练器开起来。' : 'Still not connected.')
			);
			return;
		}
		if (from === 'archive' && !$finetuneRuns.length) {
			await tell('warn', ui.archiveStillEmpty || (zh ? '训练器已连上，但还是没有已保存的跑次。开训成功后会出现在这里。' : 'Connected, but there are still no saved runs.'));
			return;
		}
		await tell('ok', ui.recheckOk || (zh ? '已连上训练器。' : 'The trainer is connected.'));
	};

	const doExport = async (runId: string) => {
		if (exportingId) return;
		exportingId = runId;
		await tell('info', ui.exporting || (zh ? '正在准备导出…' : 'Preparing the export…'));
		try {
			const h = await fetchHealth(2500);
			if (!h?.ok) {
				await tell('warn', ui.exportNeedTrainer || (zh ? '训练器没开，没法导出旁边加的那一小块。导出要向本机训练器要文件。请先展开启动说明，把服务开起来，再点一次导出。' : 'The trainer is off, so the small add-on cannot be exported.'));
				return;
			}
			await downloadExport(runId);
			await tell('ok', ui.exportOk || (zh ? '旁边加的那一小块已开始下载。默认还没有合并回基座原文件。' : 'The small add-on download has started. By default it has not been merged back into the original base file.'));
		} catch (err: any) {
			await tell('warn', failText(err, ui.exportFail || (zh ? '导出失败。请确认训练器仍在线，并且这次跑已经完成。' : 'Export failed.')));
		} finally {
			exportingId = null;
		}
	};

	const curvePoints = (key: 'trainLoss' | 'valLoss') => {
		const pts = $finetuneMetrics
			.map((x, i) => ({ i, y: x[key] }))
			.filter((p) => typeof p.y === 'number') as { i: number; y: number }[];
		if (pts.length < 1) return '';
		const ys = pts.map((p) => p.y as number);
		const min = Math.min(...ys);
		const max = Math.max(...ys);
		const span = max - min || 1;
		const w = 420;
		const h = 140;
		return pts
			.map((p, idx) => {
				const x = pts.length === 1 ? 10 : 10 + (idx / (pts.length - 1)) * (w - 20);
				const y = 8 + (1 - ((p.y as number) - min) / span) * (h - 16);
				return `${x},${y}`;
			})
			.join(' ');
	};

	$: trainPoly = curvePoints('trainLoss');
	$: valPoly = curvePoints('valLoss');
	$: lastMetric = $finetuneMetrics.length ? $finetuneMetrics[$finetuneMetrics.length - 1] : null;

	const fmt = (n: number | null | undefined, d = 4) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—');


	const statusLabel = (s: string) => {
		const map: Record<string, [string, string]> = {
			idle: [ui.statusIdle || '未开始', 'Not started'],
			running: [ui.statusRunning || '训练中', 'Training'],
			paused: [ui.statusPaused || '已暂停', 'Paused'],
			stopping: [ui.statusStopping || '正在停止', 'Stopping'],
			done: [ui.statusDone || '已完成', 'Finished'],
			error: [ui.statusError || '出错', 'Error']
		};
		const pair = map[s] || [s, s];
		return zh ? pair[0] : pair[1];
	};

	const shortGpu = (name: string) => {
		const m = name.match(/RTX\s*\d{3,4}\s*(Ti|Super)?/i);
		if (m) return m[0].replace(/\s+/g, ' ').toUpperCase();
		return name.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/\s+Laptop GPU$/i, '').trim();
	};

	const deviceLabel = () => {
		if (!connected || !health) return '';
		if (health.cuda && health.device && health.device !== 'cpu') {
			const tmpl = ui.connectedGpu || (zh ? '已连接本机显卡 {name}' : 'Connected to this computer’s GPU {name}');
			return tmpl.replace('{name}', shortGpu(health.device));
		}
		return ui.connectedCpu || (zh ? '已连接本机 CPU' : 'Connected to this computer’s CPU');
	};

	const loadTeaser = async () => {
		const text = teaserText;
		const approxToks = approxPieces(text, 48);
		teaserRow = {
			tokens: approxToks,
			groups: chipGroups(undefined, approxToks),
			approx: true,
			count: approxToks.length
		};
		teaserLoading = true;
		try {
			const remote = await previewTokenize([text], Math.max(32, r.seqLen || 64), 8000);
			if (remote && remote[0] && !remote[0].approx) {
				const filled = fillPieces(remote, [text])[0] as any;
				teaserRow = {
					tokens: filled.tokens || approxToks,
					groups: chipGroups(filled.tokenInfos, filled.tokens || approxToks),
					approx: false,
					count: filled.count || (filled.tokens || approxToks).length
				};
			}
		} catch {
			/* keep the approximate chips so the first screen is never empty */
		} finally {
			teaserLoading = false;
		}
	};
	onMount(() => {
		void loadTeaser();
	});

	const pinTokensBelowNowDo = () => {
		const place = () => {
			const panel = document.querySelector('.ft-tok-panel');
			if (panel) scrollFinetuneIntoView(panel);
			const now = document.querySelector('[data-te-ft="now"]') as HTMLElement | null;
			if (!now) return;
			const r = now.getBoundingClientRect();
			const coach = document.querySelector('.coach-bar, [data-te-coach]') as HTMLElement | null;
			const coachTop = coach ? coach.getBoundingClientRect().top : window.innerHeight;
			// The now-do card lives in the sticky stack; if any edge slipped under the coach, nudge up.
			if (r.bottom > coachTop - 8 || r.top < 0) {
				scrollFinetuneIntoView(now);
			}
		};
		place();
		requestAnimationFrame(() => {
			place();
			requestAnimationFrame(place);
		});
	};
	const pinBaselineSave = () => {
		const place = () => {
			const save =
				document.querySelector('[data-te-ft="baseline-save"]') ||
				document.querySelector('.ft-hero-card .ft-baseline') ||
				document.querySelector('.ft-now .ft-guide-go');
			const hero = document.querySelector('.ft-hero-card');
			scrollFinetuneIntoView((hero || save) as Element | null);
		};
		place();
		requestAnimationFrame(() => {
			place();
			requestAnimationFrame(place);
		});
	};

	const goSeeTokens = async () => {
		finetuneSawLine.set(true);
		setSpineView('preview');
		await tick();
		await doPreview();
	};
	const goGuide = async () => {
		if (guide.id === 'see' || (guide.id === 'preview' && view === 'see')) {
			await goSeeTokens();
			return;
		}
		if (guide.id === 'preview') {
			await doPreview();
			return;
		}
		if (guide.id === 'baseline') {
			if (view !== 'baseline') {
				setSpineView('baseline');
				await tick();
				await flashFinetune('.ft-baseline');
				return;
			}
			await doGenerate(true);
			return;
		}
		if (guide.id === 'train') {
			if (view !== 'train' && view !== 'watching') {
				setSpineView('train');
				await tick();
				await flashFinetune('.ft-short');
				return;
			}
			if (!busy && !running && connected) await doStart({ dry: true, experiment: 'short' });
			return;
		}
		if (guide.id === 'watching') {
			setSpineView('train');
			await tick();
			await flashFinetune('.ft-curve');
			return;
		}
		if (guide.id === 'compare') {
			if (view !== 'compare') {
				setSpineView('compare');
				await tick();
			}
			await doGenerate(false);
			return;
		}
		if (guide.id === 'loss') {
			if (view !== 'loss') {
				setSpineView('loss');
				await tick();
				await flashFinetune('.ft-loss-path');
				return;
			}
			finetuneSawLoss.set(true);
			setSpineView('method');
			return;
		}
		if (guide.id === 'method') {
			if (view !== 'method') {
				setSpineView('method');
				await tick();
				await flashFinetune('.ft-method-path');
				return;
			}
			finetuneSawMethod.set(true);
			setSpineView('explore');
			return;
		}
		if (guide.id === 'explore') {
			setSpineView('explore');
			return;
		}
		goPanel(guide.panel, guide.sel);
	};
	const goPanel = (panel: typeof $finetunePanel, sel?: string) => {
		if (panel === 'recipe' || panel === 'archive') finetuneExploreOpen.set(true);
		finetunePanel.set(panel);
		if (sel) flashFinetune(sel);
	};
	const dismissFinished = () => finetuneJustFinished.set(false);
	$: if (
		view === 'preview' &&
		!autoPreviewTried &&
		!$finetuneTokenPreview.length &&
		!previewing &&
		$finetuneSamples.some((s) => s.text.trim())
	) {
		autoPreviewTried = true;
		void doPreview();
	}

	$: if (!$finetuneExploreOpen && view !== 'explore' && view !== 'loss' && view !== 'method') {
		const want =
			view === 'see'
				? 'explain'
				: view === 'preview'
					? 'data'
					: view === 'baseline' || view === 'compare'
						? 'play'
						: view === 'train' || view === 'watching'
							? 'train'
							: $finetunePanel;
		if ($finetunePanel !== want) finetunePanel.set(want as typeof $finetunePanel);
	}

	const goCompareNow = () => {
		finetuneJustFinished.set(false);
		setSpineView('compare');
	};

	let lossPlaceSeq = 0;
	$: if (view === 'loss') {
		const seq = ++lossPlaceSeq;
		void tick().then(() => {
			requestAnimationFrame(() => {
				if (seq !== lossPlaceSeq) return;
				const el =
					document.querySelector('[data-te-bridge="loss-table"]') ||
					document.querySelector('.ft-loss-path');
				scrollFinetuneIntoView(el);
			});
		});
	}

	const onSpineSelect = (e: CustomEvent<string>) => {
		const id = e.detail as SpineId;
		setSpineView(id === 'watching' ? 'train' : id);
	};

	const openStudio = () => {
		finetuneExploreOpen.set(true);
	};
	const backToSpine = () => {
		finetuneExploreOpen.set(false);
		if (guide.id !== 'explore') setSpineView(view === 'explore' ? (guide.id as SpineId) : view);
	};
	const openBookWhenNeeded = (pageId?: string) => {
		const pages = getActivePages();
		const idx = pageId ? pages.findIndex((p) => p.id === pageId) : 0;
		const i = idx >= 0 ? idx : 0;
		textbookCurrentPage.set(i);
		if (pages[i]) textbookCurrentPageId.set(pages[i].id);
		isTextbookOpen.set(true);
	};

	const hasCheckpoint = () =>
		$finetuneStatus === 'done' ||
		$finetuneRuns.some((run) => run.status === 'done' || run.stoppedReason === 'completed');

	const packName = () => {
		const id = $finetunePackId;
		if (!id) return zh ? '示例' : 'example';
		return zh ? TEXT_PACKS[id].labelZh : TEXT_PACKS[id].labelEn;
	};

	const schedName = (s: string) =>
		s === 'constant' ? ui.schedConstant || (zh ? '恒定' : 'constant') : s === 'linear' ? ui.schedLinear || (zh ? '线性' : 'linear') : ui.schedCosine || (zh ? '余弦' : 'cosine');

	const lastLoss = (run: (typeof $finetuneRuns)[number], key: 'trainLoss' | 'valLoss') => {
		const pts = (run.metrics || []).filter((x) => typeof x[key] === 'number');
		return pts.length ? pts[pts.length - 1][key] : null;
	};

	const canExport = (run: (typeof $finetuneRuns)[number]) =>
		run.status === 'done' || run.stoppedReason === 'completed';


	const startHelpZh = `要启动本机教学服务和课堂，请双击项目文件夹里的「启动帮手」。

它会打开本机课堂。请在浏览器中打开 http://127.0.0.1:5173 。

如果还缺 Python 或 Node.js，帮手会用白话告诉你还缺什么。教材和自测在教学服务还没连上时也可以先看，只是还不能开训。`;

	const startHelpEn = `To start the local teaching service and classroom, double-click “启动帮手” (Start helper) in the project folder.

It opens the local classroom. Then open http://127.0.0.1:5173 in your browser.

If Python or Node.js is missing, the helper will tell you in plain language. The textbook and self-checks still work if the teaching service is not connected; training cannot start until it is.`;
</script>

<div class="ft-studio">
	<p class="disclaimer">
		{m.finetuneDisclaimer ??
			(zh
				? '本机 GPT-2 小实验，不是在调 ChatGPT。模型会跟着你喂的文本走，只做自己的学习实验。'
				: 'A small GPT-2 experiment on your machine, not tuning ChatGPT. The model follows the text you feed it.')}
	</p>
	<div class="ft-server-help status quiet-fact" class:ok={connected} class:down={!connected} data-te-ft="device-fact">
		{#if connected}
			<span>
				{deviceLabel()}
				{#if health?.cuda && health?.vramTotalMb}
					· {memLine}
				{/if}
				{#if !health?.cuda && health?.torch}
					· {ui.connectedCpuHint || (zh ? '这台机器有独立显卡，但当前 PyTorch 还没用上它。' : 'This machine has a GPU, but the current PyTorch build is not using it.')}
				{/if}
				{#if health?.torch === false}
					· {zh ? '尚未安装 PyTorch，还不能开训' : 'PyTorch is not installed; training is unavailable'}
				{/if}
			</span>
		{:else}
			<span>{m.finetuneServerDown ?? (zh ? '训练器还没连上。教材和数据台仍可用。' : 'Trainer is not connected.')}</span>
		{/if}
		<button type="button" class="ghost" on:click={() => doRecheck('banner')} disabled={healthChecking}>
			{healthChecking ? (ui.recheckChecking || (zh ? '正在检测训练器…' : 'Checking the trainer…')) : (zh ? '重新检测' : 'Recheck')}
		</button>
	</div>
	{#if !connected || health?.torch === false}
		<p class="ft-offline-can">{ui.offlineCanDo || (zh ? '还能读教材、预览约数，但不能真开训或存真实续写。' : 'You can still read the textbook and preview approximate tokens, but you cannot actually start training or save a real continuation.')}</p>
		<button type="button" class="ghost ft-help-toggle" on:click={() => (showStartHelp = !showStartHelp)}>
			{showStartHelp
				? ui.startHelpHide || (zh ? '收起启动说明' : 'Hide start instructions')
				: ui.startHelpToggle || (zh ? '如何启动训练器（本机命令，默认收起）' : 'How to start the trainer (local commands, collapsed by default)')}
		</button>
		{#if showStartHelp}
			<pre class="help">{zh ? startHelpZh : startHelpEn}</pre>
		{/if}
	{/if}
	<div class="ft-spine-sticky" class:walked={view === "explore" && depthWalkedIn}>
	{#if $finetuneNotice}
		<div class="ft-notice {$finetuneNotice.tone}" role="status">{$finetuneNotice.text}</div>
	{/if}

	<FtSpineRail stops={FT_SPINE_STOPS} viewId={view} unlockedId={guide.id} alsoOpen={['method', 'explore']} optionalIds={['method', 'explore']} {zh} on:select={onSpineSelect} />

	{#if !$courseContrastOpen && !heroIsNowDo}
	<section class="ft-now card" data-te-ft="now">
		<p class="kicker">{ui.nowKicker || ui.guideKicker || (zh ? '现在做这件事' : 'Do this now')}</p>
		{#if view === 'explore'}
			{#if depthWalkedIn}
				<h3>{zh ? `正在看：${depthTitleZh[depthStop] || '实验室'}（预置示意）` : `Looking at: ${depthTitleEn[depthStop] || 'a lab'} (preset sketch)`}</h3>
				<p class="now-why">{zh ? '曲线和对照就在下面。这不是工业平台，也不是通用评测套件，也不会开训。' : 'The figure and contrast are below. This is not an industrial platform or a general eval suite, and it does not start training.'}</p>
			{:else}
				<h3>{ui.depthNowTitle || (zh ? '先看见过拟合、检查点和遗忘' : 'First see overfitting, checkpoints, and forgetting')}</h3>
				<p class="now-why">{ui.depthNowWhy || (zh ? '下面就是本课壳子里已有的实验室。点一项就能走进去，不必另开工业平台，也不必自己翻工作室标签。' : 'The list below is the labs already in this course shell. Open one to walk in. This is not a separate industrial platform, and you do not have to hunt through workshop tabs.')}</p>
			{/if}
		{:else if view === 'preview' && guide.id === 'baseline'}
			<h3>{ui.seenTokensTitle || (zh ? '句子已经被切开了' : 'The sentence has already been cut into chips')}</h3>
			<p class="now-why">{ui.seenTokensWhy || (zh ? '词片已经摊开。下一步点「推进一步」，再去存微调前的续写。' : 'The token chips are already visible. Next, click “Take one step”, then save the before-training continuation.')}</p>
			<button type="button" class="ghost ft-guide-go" data-te-ft="next-baseline" on:click={() => setSpineView('baseline')}>{ui.nextBaseline || (zh ? '下一步：存下微调前的续写' : 'Next: save the before-training continuation')}</button>
		{:else if view === 'baseline' && guide.id === 'baseline'}
			<h3>{zh ? guide.titleZh : guide.titleEn}</h3>
			<p class="now-why">{zh ? guide.whyZh : guide.whyEn}</p>
			<p class="tiny now-why">{zh ? '请点下面对照游乐场里的「存下微调前的续写」。这里只留这一处主按钮。' : 'Use “Save the before-training continuation” in the playground below. That is the single primary save control.'}</p>
		{:else if view === 'loss'}
			<h3>{zh ? '损失是什么' : 'What loss is'}</h3>
			<p class="now-why">{zh ? '损失就是概率表上那一行：正确答案那一个词片，概率够不够高。先把下面这张表示意算完，还不要记公式，也不要先背学习率。' : 'Loss is a row on the probability table: did the correct next chip get enough probability? Walk through the sketch table below first. No formula yet, and no learning rate yet.'}</p>
		{:else}
			<h3>{zh ? guide.titleZh : guide.titleEn}</h3>
			<p class="now-why">{zh ? guide.whyZh : guide.whyEn}</p>
			<button type="button" class="primary ft-guide-go" data-te-ft={guide.id === 'baseline' && view === 'baseline' ? 'baseline-save' : 'guide-go'} on:click={goGuide} disabled={guide.id === 'watching' && running && view === 'train'}
				>{zh ? guide.goZh : guide.goEn}</button
			>
		{/if}
		{#if guide.id === 'baseline' && $finetuneBaselineSaved && view === 'baseline'}
			<button type="button" class="primary" on:click={() => setSpineView('train')}>{ui.nextTrain || (zh ? '下一步：先跑 2 步，确认能通' : 'Next: run 2 steps to confirm it works')}</button>
		{/if}
		{#if guide.id === 'explore'}
			<button type="button" class="ghost" on:click={() => openBookWhenNeeded()}>{ui.openBookWhenNeeded || (zh ? '需要时打开教材' : 'Open the textbook when you need it')}</button>
		{/if}
	</section>
	{/if}
	</div>

	{#if !(view === 'explore' && !studioOpen)}
	{#if view === 'train' || view === 'watching' || (showExplainOnExplore && view !== 'see' && view !== 'loss')}
	<div class="ft-explain-dock">
		<p class="ft-step-only">{ui.stepOnly || (zh ? '顶栏「推进一步」只讲解训练的一拍，不会开训。下面四拍会跟着高亮。' : 'The top-bar “Take one step” only explains one training beat. It does not start training.')}</p>
		<FtTrainStepDiagram {zh} method={r.method} active={loopActive} {running} />
		{#if view !== 'train' && view !== 'watching'}
			<p class="tiny"><button type="button" class="ghost" on:click={() => (showExplainOnExplore = false)}>{zh ? '收起四拍讲解' : 'Hide the four-beat explainer'}</button></p>
		{/if}
	</div>
	{:else if view !== 'see' && view !== 'loss'}
	<p class="ft-explain-toggle"><button type="button" class="ghost" data-te-explore="show-beats" on:click={() => (showExplainOnExplore = true)}>{zh ? '现在还不用看四拍「训练的一步」示意图' : 'The four-beat “one training step” figure is folded away for now'}</button></p>
	{/if}

	{#if $finetuneJustFinished && view !== 'compare'}
		<div class="done-banner" role="status">
			<p>{ui.doneAutoCompare || ui.doneBanner || (zh ? '极短跑结束了，正在带你看同一批提示词的前后差别。' : 'The short run is finished.')}</p>
			<button type="button" class="primary" on:click={goCompareNow}>{ui.doneGo || (zh ? '去看前后差别' : 'See the change')}</button>
			<button type="button" class="ghost" on:click={dismissFinished}>{zh ? '先留在这里' : 'Stay here'}</button>
		</div>
	{/if}

	{#if studioOpen}
		<nav class="tabs">
			{#each tabs as t}
				<button type="button" class:on={$finetunePanel === t.id} on:click={() => finetunePanel.set(t.id)}>
					{zh ? t.zh : t.en}
				</button>
			{/each}
		</nav>
		<p class="ft-explore-link">
			<button type="button" class="ghost" on:click={backToSpine}>{ui.backToSpine || (zh ? '回到主线' : 'Back to the main path')}</button>
			<button type="button" class="ghost" on:click={() => openBookWhenNeeded()}>{ui.openBookWhenNeeded || (zh ? '需要时打开教材' : 'Open the textbook when you need it')}</button>
		</p>
	{:else if view !== 'see' && !(view === 'preview' && !$finetuneTokenPreview.length)}
		<p class="ft-explore-link">
			<button type="button" class="ghost" on:click={openStudio}>{ui.openStudio || (zh ? '打开工作室（深挖用，不是现在的必经路）' : 'Open the workshop (for later, not the required path)')}</button>
		</p>
	{/if}
	{/if}

	{#if view === 'loss' && !studioOpen}
		<section class="card ft-loss-path" data-te-ft="loss">
			<p class="kicker">{zh ? '现在做这件事' : 'Do this now'}</p>
			<h3>{zh ? '损失就是概率表上那一行' : 'Loss is a row on the probability table'}</h3>
			<p class="now-why">{zh ? '刚才看见了续写有没有变。现在把「损失」指回那张熟悉的概率表：正确答案那一个词片，概率够不够高。还不要记公式，也不要先背学习率。' : 'You have seen whether the continuation changed. Now point “loss” back at the familiar probability table: did the correct next chip get enough probability? No formula yet, and no learning rate yet.'}</p>
			<FtLossAsTable {zh} showWalk />
			<div class="ft-explain-dock">
				<p class="ft-step-only">{ui.stepOnly || (zh ? '顶栏「推进一步」只讲解训练的一拍，不会开训。下面四拍会跟着高亮。' : 'The top-bar “Take one step” only explains one training beat. It does not start training.')}</p>
				<FtTrainStepDiagram {zh} method={r.method} active={loopActive} {running} />
			</div>
			<button type="button" class="primary" data-te-ft="next-method" on:click={() => { finetuneSawLoss.set(true); setSpineView('method'); }}>{zh ? '下一步：看改的是哪一块' : 'Next: see which piece we change'}</button>
		</section>
	{:else if view === 'method' && !studioOpen}
		<section class="card ft-method-path" data-te-ft="method">
			<p class="kicker">{zh ? '现在做这件事' : 'Do this now'}</p>
			<h3>{zh ? '把方法画在同一套块上' : 'Draw the method on the same blocks'}</h3>
			<p class="now-why">{zh ? '要改权重，不必一次改全部。本课默认在旁边加一小块——这一小块就叫 LoRA。看懂这张图，再决定要不要带上它回文字课。' : 'You do not have to change every weight. The default here is to add a small piece beside the original — that piece is called LoRA. Read the diagram, then decide whether to take it back to the text course.'}</p>
			<FtMethodDiagram
				{zh}
				showPicks
				method={r.method}
				layers={r.base === 'gpt2-medium' ? 24 : 12}
				unfreezeLast={r.freezeUnfreezeLast}
				outputOnly={r.freezeOutputOnly}
				loraR={r.loraR}
				modules={r.loraModules}
				on:choose={(e) => chooseMethod(e.detail)}
			/>
			<p class="ft-bridge-actions">
				<button type="button" class="primary ft-bridge-lora" data-te-bridge="to-text-lora" on:click={() => { finetuneSawMethod.set(true); goToTextCourseWithLora(playRunId); }}>{zh ? '带上这次 LoRA，去文字课对照桑基图' : 'Take this LoRA to the text course and contrast it on the Sankey'}</button>
				<button type="button" class="ghost" data-te-ft="next-explore" on:click={() => { finetuneSawMethod.set(true); setSpineView('explore'); }}>{zh ? '下一步：再深挖' : 'Next: go deeper'}</button>
			</p>
		</section>
	{:else if view === 'explore' && !studioOpen}
		<FtDepthPath
			{zh}
			bind:stop={depthStop}
			bind:later={depthLater}
			bind:walkedIn={depthWalkedIn}
			bind:useBest
			liveMetrics={$finetuneMetrics}
			bestValStep={evalSource?.bestValStep ?? null}
			bestValLoss={evalSource?.bestValLoss ?? null}
			lastValLoss={evalSource ? lastLoss(evalSource, 'valLoss') : lastLoss({ metrics: $finetuneMetrics } as any, 'valLoss')}
			lastStep={($finetuneMetrics.length ? $finetuneMetrics[$finetuneMetrics.length - 1].step : null) ?? null}
			{sftMode}
			sftSample={sftSampleText}
			{evalItems}
			evalReading={evalReadingText || (evalSource?.evalCard && (zh ? evalSource.evalCard.reading : evalSource.evalCard.readingEn || evalSource.evalCard.reading)) || ''}
			{evalFilling}
			valLoss={evalSource ? (evalSource.bestValLoss ?? lastLoss(evalSource, 'valLoss')) : lastLoss({ metrics: $finetuneMetrics } as any, 'valLoss')}
			testLoss={evalSource?.testLoss ?? null}
			leakVal={!!(evalSource?.leakVal || evalSource?.recipe?.leakVal || leakVal)}
			{connected}
			on:toggleBest={(e) => (useBest = e.detail)}
			runId={playRunId}
			on:loadSft={loadSftDemo}
			on:fillEval={fillEvalCard}
			on:openBook={(e) => openBookWhenNeeded(e.detail)}
		>
			<div slot="after-labs">
				{#if showExplainOnExplore}
				<div class="ft-explain-dock">
					<p class="ft-step-only">{ui.stepOnly || (zh ? '顶栏「推进一步」只讲解训练的一拍，不会开训。下面四拍会跟着高亮。' : 'The top-bar “Take one step” only explains one training beat. It does not start training.')}</p>
					<FtTrainStepDiagram {zh} method={r.method} active={loopActive} {running} />
					<p class="tiny"><button type="button" class="ghost" on:click={() => (showExplainOnExplore = false)}>{zh ? '收起四拍讲解' : 'Hide the four-beat explainer'}</button></p>
				</div>
				{:else}
				<p class="ft-explain-toggle"><button type="button" class="ghost" data-te-explore="show-beats" on:click={() => (showExplainOnExplore = true)}>{zh ? '现在还不用看四拍「训练的一步」示意图' : 'The four-beat “one training step” figure is folded away for now'}</button></p>
				{/if}
				{#if $finetuneJustFinished}
					<div class="done-banner" role="status">
						<p>{ui.doneAutoCompare || ui.doneBanner || (zh ? '极短跑结束了，正在带你看同一批提示词的前后差别。' : 'The short run is finished.')}</p>
						<button type="button" class="primary" on:click={goCompareNow}>{ui.doneGo || (zh ? '去看前后差别' : 'See the change')}</button>
						<button type="button" class="ghost" on:click={dismissFinished}>{zh ? '先留在这里' : 'Stay here'}</button>
					</div>
				{/if}
				<p class="ft-explore-link">
					<button type="button" class="ghost" on:click={openStudio}>{ui.openStudio || (zh ? '打开工作室（深挖用，不是现在的必经路）' : 'Open the workshop (for later, not the required path)')}</button>
				</p>
			</div>
		</FtDepthPath>
	{:else if $finetunePanel === 'explain'}
		<section class="ft-step-panel ft-contrast-lead card">
			<div class="ft-see-line" data-te-bridge="ready">
				<p class="ft-first-line" data-te-ft="first-line">{zh ? '刚才那台猜词机还在，现在要让它跟你喂的文字走得更近。' : 'The guessing machine is still here. Now we want it to follow the text you feed it more closely.'}</p>
				<p class="kicker">{zh ? '先分清这一条线：改的是权重，不是怎么抽词' : 'First see this line: we change weights, not how a word is drawn'}</p>
				<div class="ft-see-cols">
					<article>
						<p class="tag">{zh ? '文字课' : 'Text course'}</p>
						<h4>{zh ? '权重锁住' : 'Weights stay frozen'}</h4>
						<p>{zh ? '只会猜下一个词。拧温度只改怎么抽，不改参数。' : 'It only guesses the next word. Temperature changes sampling, not the parameters.'}</p>
					</article>
					<article class="here">
						<p class="tag">{zh ? '这一课' : 'This course'}</p>
						<h4>{zh ? '用新文本改权重' : 'New text changes weights'}</h4>
						<p>{zh ? '这还是猜下一个词，只是权重可以动了。算损失，按方法更新。本机 GPT-2 小实验，不是在调 ChatGPT。' : 'This is still next-token prediction — the weights are just allowed to move. Compute a loss and update by method. A small local GPT-2 experiment, not tuning ChatGPT.'}</p>
					</article>
				</div>
				<p class="ft-teaser-src" data-te-bridge="sentence">{zh ? '贯穿例句：' : 'Shared sentence: '}「{BRIDGE_SENTENCE_ZH}」{#if !zh}<span class="tiny"> {BRIDGE_SENTENCE_EN}</span>{/if}</p>
				<p class="ft-bridge-actions">
					<button type="button" class="ghost ft-bridge-go" data-te-bridge="to-text" on:click={goToTextCourseWithSentence}>{ui.goTextCourse || (zh ? '去文字课看这一句怎么算下一个词' : 'See how this sentence predicts the next word in the text course')}</button>
				</p>
				<p class="tiny ft-bridge-hint">{ui.bridgeHint || (zh ? '两门课尽量用同一句。你可以只上其中一门，不必两边都走完。跳过去不会自动打开 22 页教材。' : 'Both courses try to use the same sentence. You can take only one course — this is not a gate. Jumping over will not auto-open the 22-page textbook.')}</p>
			</div>

			<div class="ft-see-tokens" data-te-ft="tokenize">
				<p class="tiny">{zh ? '贯穿例句还是这一句：' : 'The shared sentence is still '}「{teaserText}」{zh ? '。点「预览分词」，看它会被切成哪些词片。' : '. Click “Preview tokens” to see how it is cut into chips.'}</p>
			</div>
		</section>
	{:else if $finetunePanel === 'data'}
		<section class="ft-data card" data-te-ft="tokenize">
			<h3>{zh ? '数据台' : 'Data desk'}</h3>
			<p class="pack-note">
				{(ui.packLoaded || (zh
					? '已为你载入「{name}」示例，可直接预览分词，也可换成短诗、技术小段子，或粘贴、上传自己的文本。'
					: 'The “{name}” example pack is already loaded. You can preview tokens now, or switch packs or use your own text.')).replace('{name}', packName())}
			</p>
			<p class="tiny warn">
				{zh
					? '模型跟你喂的文本走。示例口吻包只有笔记、短诗、技术小段子。只做自己的学习实验，不要拿去骚扰别人。'
					: 'The model follows the text you feed it. Example packs are only notes, short verses, and technical notes. Use this for your own study, not to harass anyone.'}
			</p>
			<label class="ft-pack">
				<span class="lbl">{zh ? '示例口吻包' : 'Example voice pack'}</span>
				<select
					class="ctrl"
					value={$finetunePackId ?? ''}
					on:change={(e) => {
						const v = e.currentTarget.value;
						if (v) {
							sftMode = false;
							unlockSplit();
							loadPack(v as any);
							evalItems = evalPromptsFor({ zh, sftMode: false }).map((p) => ({ id: p.id, kind: p.kind, prompt: p.text }));
						}
					}}
				>
					{#each PACK_IDS as id}
						<option value={id}>{zh ? TEXT_PACKS[id].labelZh : TEXT_PACKS[id].labelEn}（{TEXT_PACKS[id].texts.length}）</option>
					{/each}
				</select>
			</label>
			{#if $finetunePackId}
				<p class="tiny">{zh ? TEXT_PACKS[$finetunePackId].hintZh : TEXT_PACKS[$finetunePackId].hintEn}</p>
			{/if}

			<button type="button" class="ft-tokenize" class:primary={!$finetuneTokenPreview.length} class:ghost={!!$finetuneTokenPreview.length} data-te-ft="tokenize-btn" on:click={doPreview} disabled={previewing}>
				{previewing
					? ui.tokPreviewing || (zh ? '正在分词…' : 'Tokenizing…')
					: ui.tokPreview || (zh ? '预览分词' : 'Preview tokens')}
			</button>
			<p class="tiny ft-why">
				{zh
					? '先看下面的原句，再看它被切成哪些能读的字块。预览不会开训。'
					: 'Read the original sentence first, then the readable chips it was split into. Previewing does not start training.'}
			</p>
			{#if previewEmpty && !$finetuneTokenPreview.length}
				<div class="ft-tok-empty ft-notice warn" role="status">
					{ui.tokEmpty || (zh ? '还没有可预览的文本。请先载入示例包、粘贴文本，或新增一条，再点预览。' : 'There is no text to preview yet.')}
				</div>
			{/if}
			{#if $finetuneTokenPreview.length}
				<div class="ft-tok-panel" data-te-ft="tokenize-panel" class:approx={!!($finetuneTokenPreview[0] && $finetuneTokenPreview[0].approx)}>
					<p class="ft-tok-banner">
						{#if $finetuneTokenPreview[0] && $finetuneTokenPreview[0].approx && previewApproxReason === 'late'}
							{ui.tokLateNote ||
								(zh
									? '训练器已连上，但这次没有及时返回真正的分词。下面先用约数，请再点一次预览；连上并返回后能看到真正的 GPT-2 词片。'
									: 'The trainer is connected, but the exact tokens did not come back in time. These are approximate pieces — click preview again to see real GPT-2 tokens.')}
						{:else if $finetuneTokenPreview[0] && $finetuneTokenPreview[0].approx}
							{ui.tokApproxNote ||
								(zh
									? '还没连上训练器，或这次没有及时返回。下面是约数，只帮助你感觉句子会被切成多少块；连上训练器后能看到真正的 GPT-2 分词。'
									: 'The trainer is not connected, or it did not answer in time. These are rough counts and pieces so you can still see how a sentence is split. Connect the trainer to see real GPT-2 tokens.')}
						{:else}
							{ui.tokExactNote ||
								(zh
									? '下面先给出原句，再按相同顺序用色块标出能读的字或符号。角上有数字的，表示这个字被切成了几小片，点一下可看说明。预览不会开训。'
									: 'The original sentence is shown first, then readable chips in the same order.')}
						{/if}
					</p>
										{#each previewRows as p, i}
						<div class="ft-tok-row" class:val={p.side === 'val'} class:train={p.side === 'train'}>
							<div class="ft-tok-meta">
								<strong>{zh ? `第 ${p.index + 1} 句` : `Sentence ${p.index + 1}`}</strong>
								<span class="ft-split-tag {p.side}">{p.side === 'val' ? (zh ? '留下来检查，不拿去训练' : 'Held out for a check, not used in training') : (zh ? '会用来训练' : 'Used for training')}</span>
								<span>{zh ? `切成 ${p.count} 个词片` : `Split into ${p.count} token chips`}{#if p.totalCount && p.totalCount !== p.count}{zh ? `（全文约 ${p.totalCount}）` : ` (${p.totalCount} in all)`}{/if}</span>
								{#if p.truncated}
									<em class="ft-tok-cut">{ui.tokTruncated || (zh ? '原句后面超出长度的一截不会进入训练' : 'The tail past the length limit will not enter training')}</em>
								{/if}
								{#if p.approx}
									<em>{zh ? '约数' : 'approx'}</em>
								{/if}
							</div>
							{#if p.sourceText}
								<blockquote class="ft-tok-source">
									<span class="lbl">{zh ? '原句' : 'Original'}</span>
									{p.sourceText}
								</blockquote>
							{/if}
							<FtTokChips groups={p.groups} {zh} />
							{#if p.truncated}
								<div class="ft-tok-drop">
									<p>{zh ? '原句后面这一截超过了设定的长度，不会进入训练。' : 'This tail is past the sequence length. It will not enter training.'}</p>
									<FtTokChips groups={p.dropGroups || []} {zh} dropped />
								</div>
							{/if}
						</div>
					{/each}
				</div>
				{#if !studioOpen && view === 'preview'}
					<button type="button" class="ghost ft-guide-go ft-next-after-tok" data-te-ft="next-baseline" on:click={() => setSpineView('baseline')}>
						{ui.nextBaseline || (zh ? '下一步：存下微调前的续写' : 'Next: save the before-training continuation')}
					</button>
				{/if}
			{/if}
			<details class="ft-more ft-data-more" class:bare={studioOpen} open={studioOpen}>
				<summary>{ui.dataMore || (zh ? '更多：上传、拆分和选做实验' : 'More: upload, split, and optional experiments')}</summary>
			<label class="ft-upload">
				<span class="lbl">{zh ? '上传 .txt / .jsonl' : 'Upload .txt / .jsonl'}</span>
				<input type="file" accept=".txt,.jsonl,.json" on:change={onUpload} />
			</label>
			<label>
				<span class="lbl">{zh ? '粘贴文本（空行分段）' : 'Paste text (blank line = new sample)'}</span>
				<textarea rows="4" bind:value={pasteText}></textarea>
			</label>
			<button type="button" class="ghost" on:click={importPaste}>{zh ? '导入粘贴' : 'Import paste'}</button>
			<button type="button" class="ghost" on:click={addBlank}>{zh ? '新增一条' : 'Add a row'}</button>
			<div class="ft-split row">
				<label>
					<span class="lbl">{zh ? '验证集比例' : 'Validation ratio'}</span>
					<input
						type="range"
						min="0.05"
						max="0.3"
						step="0.05"
						value={r.valRatio}
						disabled={splitLocked}
						on:input={(e) => setR({ valRatio: +e.currentTarget.value })}
					/>
					<strong>{Math.round(r.valRatio * 100)}%</strong>
				</label>
				<label class="ft-test-split">
					<span class="lbl">{zh ? '测试集比例' : 'Test ratio'}</span>
					<input
						type="range"
						min="0"
						max="0.2"
						step="0.05"
						value={r.testRatio ?? 0.1}
						disabled={splitLocked}
						on:input={(e) => setR({ testRatio: +e.currentTarget.value })}
					/>
					<strong>{Math.round((r.testRatio ?? 0.1) * 100)}%</strong>
				</label>
				<p class="tiny">
					{zh ? '用来训练' : 'Training'} {split.train.length} · {zh ? '留下来检查（验证）' : 'Held out (val)'} {split.val.length} · {zh ? '最后再看一眼（测试）' : 'Final look (test)'}
					{split.test.length} · {zh ? '共' : 'Total'}
					{$finetuneSamples.filter((s) => s.text.trim()).length}
				</p>
				<details class="ft-more">
					<summary>{zh ? '为什么要先固定拆分？' : 'Why freeze the split first?'}</summary>
					<p class="tiny ft-why">
						{zh
							? '验证集用来在训练过程中检查，测试集即使很小，也只在最后看一眼，不当场拿去更新。拆分中途重洗，检查就不公平。验证集漏进训练，成绩会假好。'
							: 'The validation set is the check during training; the test set, even if tiny, is only a final look. Reshuffling mid-run makes the check unfair. If the held-out set leaks into training, the score looks falsely good.'}
					</p>
				</details>
				<div class="row">
					<button type="button" class="ghost" on:click={lockSplit} disabled={splitLocked}>
						{zh ? '固定这次拆分（开训前）' : 'Freeze this split (before training)'}
					</button>
					<button type="button" class="ghost" on:click={unlockSplit} disabled={!splitLocked}>
						{zh ? '解除固定并按新比例重拆' : 'Unlock and re-split'}
					</button>
				</div>
				<p class="tiny">{splitLocked ? (zh ? '拆分已固定，训练中途不会重洗。要改比例请先解除固定。' : 'The split is frozen and will not be reshuffled mid-run. Unlock it first to change the ratios.') : (zh ? '还没固定。开训时会自动按当前比例固定下来。' : 'Not frozen yet. Starting a run will freeze the current split automatically.')}</p>
			</div>
			<details class="ft-more exp-card ft-leak">
				<summary><h3>{zh ? '数据泄漏意识实验（选做）' : 'Leakage-awareness experiment (optional)'}</h3></summary>
				<label class="chk">
					<input type="checkbox" bind:checked={leakVal} />
					{zh ? '演示：让验证集漏进训练（会让验证读数假好）' : 'Demo: leak the validation set into training (makes the val score look falsely good)'}
				</label>
				<p class="tiny">
					{zh
						? '这是故意做的反面教材：勾上后再跑，验证数字可能会看起来很好，但那是因为它已经见过这些句子。正确做法是关掉这项，用上面已固定的同一拆分再对照一次。测试集即使勾了泄漏，也仍会留下来不当场训练。'
						: 'This is a deliberate counter-example: if you turn it on and run, the validation number may look great because the model has already seen those sentences. The correct move is to turn it off and compare again with the same frozen split. Even with leak on, the test set still stays out of the update.'}
				</p>
			</details>
			<details class="ft-more exp-card ft-sft">
				<summary><h3>{zh ? '最小问答格式实验（选做）' : 'Minimal Q/A format experiment (optional)'}</h3></summary>
				<p class="tiny">
					{zh
						? '这是最小演示，不是完整指令微调平台。载入后，每条都是「问：… / 答：…」。训练时怎么写，推理时就该怎么问——在游乐场和评测卡里也要用同样的格式提问。不要拿去骚扰别人。'
						: 'This is a minimal demo, not a full instruction-tuning platform. Each example is “Q: … / A: …”. Ask at inference time in the same format you trained on — use that format in the playground and on the eval card. Do not use this to bother other people.'}
				</p>
				<button type="button" class="primary" on:click={loadSftDemo}>{zh ? '载入最小问答模板（演示）' : 'Load the minimal Q/A template (demo)'}</button>
				{#if sftMode}
					<pre class="sft-sample">{sftSampleText}</pre>
					<p class="ok-line">{zh ? '当前语料已换成问答模板。请在推理时用「问：…」来提问，再等「答：」后面的续写。' : 'The corpus is now the Q/A template. At inference, ask with “Q: …” and wait for the continuation after “A:”.'}</p>
				{/if}
			</details>
			</details>
			<button type="button" class="ghost ft-toggle-samples" on:click={() => (showAllSamples = !showAllSamples)}>
				{showAllSamples
					? (zh ? '收起全部样本，先看上面的词片' : 'Hide the sample list and keep the chips in view')
					: (zh ? `查看或编辑全部样本（共 ${$finetuneSamples.filter((s) => s.text.trim()).length} 条）。预览结果在上面，不会被列表挤走。` : `Show all samples (${$finetuneSamples.filter((s) => s.text.trim()).length}). The preview above stays in view.`)}
			</button>
			{#if showAllSamples || !$finetuneTokenPreview.length}
			<ul class="samples">
				{#each $finetuneSamples as s, i}
					<li>
						<span class="idx">{i + 1}</span>
						<span class="ft-split-tag {split.val.some((v) => v.id === s.id) ? 'val' : 'train'}">{split.val.some((v) => v.id === s.id) ? (zh ? '验证' : 'Val') : (zh ? '训练' : 'Train')}</span>
						<textarea rows="2" value={s.text} on:input={(e) => editSample(s.id, e.currentTarget.value)}></textarea>
						<button type="button" class="ghost" on:click={() => removeSample(s.id)}>{zh ? '删' : 'Del'}</button>
					</li>
				{/each}
			</ul>
			{/if}
		</section>
	{:else if $finetunePanel === 'recipe'}
		<section class="card">
			<div class="row ft-recommend">
				<button type="button" class="primary" on:click={() => restoreRecommended()}>{ui.restore || (zh ? '恢复推荐配方' : 'Restore recommended')}</button>
				<button type="button" class="ghost ft-advanced" on:click={() => finetuneAdvanced.update((v) => !v)}>
					{$finetuneAdvanced ? (ui.hideKnobs || (zh ? '收起全部旋钮' : 'Hide extra knobs')) : (ui.openKnobs || (zh ? '一键打开全部旋钮' : 'Show all knobs'))}
				</button>
				<p class="tiny">{ui.restoreHint || (zh ? '恢复推荐不会丢掉已经编辑的语料。' : 'Restoring the recipe does not clear your edited data.')}</p>
			</div>
			<label class="ft-method">
				<span class="lbl">{zh ? '方法' : 'Method'}</span>
				<span class="hint">{ui.hintMethod}</span>
				<select class="ctrl" value={r.method} on:change={(e) => chooseMethod(e.currentTarget.value as Recipe['method'])}>
					<option value="lora">{zh ? '旁边加一小块（LoRA）' : 'A small add-on (LoRA)'}</option>
					<option value="freeze">{zh ? '只改最后几层（冻结）' : 'Only the last layers (freeze)'}</option>
					<option value="full">{zh ? '几乎全部改（全量）' : 'Almost all weights (full)'}</option>
				</select>
			</label>
			<FtMethodDiagram
				{zh}
				method={r.method}
				layers={r.base === 'gpt2-medium' ? 24 : 12}
				unfreezeLast={r.freezeUnfreezeLast}
				outputOnly={r.freezeOutputOnly}
				loraR={r.loraR}
				modules={r.loraModules}
			/>
			{#if knobHint}
				<div class="ft-knob-hint" data-kind={knobHint.kind}>
					<p class="kicker">{zh ? knobHint.titleZh : knobHint.titleEn}</p>
					<p>{zh ? knobHint.bodyZh : knobHint.bodyEn}</p>
					{#if knobHint.kind === 'lr'}
						<div class="hint-viz lr">
							<span class="step" class:big={(knobHint.bodyZh || '').includes('变大') || (knobHint.bodyEn || '').includes('larger')}></span>
							<em>{zh ? '一步有多大' : 'How large one step is'}</em>
						</div>
					{:else if knobHint.kind === 'seq'}
						<div class="hint-viz seq">
							<span class="mem"></span>
							<span class="cut">{zh ? '超长会被截掉，截掉的不训练' : 'The tail is cut and not trained'}</span>
						</div>
					{:else if knobHint.kind === 'r'}
						<div class="hint-viz r">
							<span class="base-w"></span><span class="add-w" style="--r:{Math.max(0.35, Math.min(1.4, r.loraR / 16))}"></span>
						</div>
					{/if}
				</div>
			{/if}
			{#if $finetuneAdvanced}
				<label>
					<span class="lbl">{zh ? '基座' : 'Base model'}</span>
					<span class="hint">{ui.hintBase}</span>
					<select class="ctrl" value={r.base} on:change={(e) => setR({ base: e.currentTarget.value as Recipe['base'] })}>
						<option value="gpt2">GPT-2 small（{zh ? '推荐' : 'recommended'}）</option>
						<option value="gpt2-medium">GPT-2 medium</option>
					</select>
				</label>
			{/if}
			{#if !$finetuneAdvanced}
				<div class="recipe-summary">
					<p class="tiny">{ui.recipeLead || (zh ? '下面是推荐配方的大白话摘要。按这个设定可以直接开训。旁边加一小块并不等于已经改了基座原文件。' : 'A plain-language summary of the recommended recipe. A small add-on does not mean the original base file has already been rewritten.')}</p>
					<ul>
						<li>
							{r.method === 'lora'
								? (ui.sumMethodLora || (zh ? 'LoRA：在原权重旁边训练很小的适配矩阵，省显存，也是本课默认。' : 'LoRA is the default.'))
								: r.method === 'freeze'
									? (ui.sumMethodFreeze || (zh ? '冻结部分层：只训练最后几层或输出层。' : 'Freeze last layers.'))
									: (ui.sumMethodFull || (zh ? '全量微调：几乎所有权重都更新。' : 'Full fine-tune.'))}
						</li>
						<li>{ui.sumBase || (zh ? '基座是 GPT-2 small，适合先把循环跑通。' : 'Base is GPT-2 small.')}{r.base === 'gpt2-medium' ? '（medium）' : ''}</li>
						{#if r.method === 'lora'}
							<li>{(ui.sumLora || 'LoRA r={r}, alpha={alpha}').replace('{r}', String(r.loraR)).replace('{alpha}', String(r.loraAlpha))}</li>
						{:else if r.method === 'freeze'}
							<li>{r.freezeOutputOnly ? (ui.hintOut || (zh ? '只训练输出层。' : 'Output layer only.')) : (zh ? `解冻最后 ${r.freezeUnfreezeLast} 层。` : `Unfreeze the last ${r.freezeUnfreezeLast} layers.`)}</li>
						{/if}
						<li>{(ui.sumLr || '').replace('{lr}', formatLr(r.lr, zh)).replace('{warmup}', String(r.warmup)).replace('{sched}', schedName(r.scheduler))}</li>
						<li>{(ui.sumSize || '').replace('{epochs}', String(r.epochs)).replace('{batch}', String(r.batchSize)).replace('{accum}', String(r.gradAccum)).replace('{seq}', String(r.seqLen)).replace('{eff}', String(r.batchSize * r.gradAccum))}</li>
						<li>{(ui.sumExtra || '').replace('{amp}', ampLabel(r.amp, zh)).replace('{seed}', String(r.seed)).replace('{early}', String(r.earlyStop ?? 0))}</li>
					</ul>
				</div>
			{:else}
			{#if r.method === 'lora'}
				<div class="ft-lora grid">
					<label><span class="lbl">{zh ? '旁路块的宽度（秩 r）' : 'Add-on width (rank r)'}</span><span class="hint">{ui.hintLoraR}</span>
						<input type="range" min={R.loraR.min} max={R.loraR.max} step="1" value={r.loraR} on:input={(e) => setR({ loraR: +e.currentTarget.value })} />
						<strong>{r.loraR}</strong></label>
					<label><span class="lbl">{zh ? '旁路块的缩放（alpha）' : 'Add-on scale (alpha)'}</span><span class="hint">{ui.hintLoraAlpha}</span>
						<input type="range" min={R.loraAlpha.min} max={R.loraAlpha.max} step="1" value={r.loraAlpha} on:input={(e) => setR({ loraAlpha: +e.currentTarget.value })} />
						<strong>{r.loraAlpha}</strong></label>
					<label><span class="lbl">{zh ? '旁路块随机丢掉一些（dropout）' : 'Add-on dropout'}</span><span class="hint">{ui.hintLoraDrop}</span>
						<input type="range" min="0" max="0.2" step="0.01" value={r.loraDropout} on:input={(e) => setR({ loraDropout: +e.currentTarget.value })} />
						<strong>{r.loraDropout}</strong></label>
					<div>
						<span class="lbl">{zh ? '作用模块' : 'Target modules'}</span><span class="hint">{ui.hintModules}</span>
						{#each LORA_MODULE_OPTIONS as opt}
							<label class="chk"><input type="checkbox" checked={r.loraModules.includes(opt.id)} on:change={() => toggleModule(opt.id)} /> {zh ? opt.labelZh : opt.labelEn}</label>
						{/each}
					</div>
				</div>
			{:else if r.method === 'freeze'}
				<div class="ft-freeze">
					<label><span class="lbl">{zh ? '解冻最后几层' : 'Unfreeze last layers'}</span><span class="hint">{ui.hintFreeze}</span>
						<input type="range" min="1" max="4" step="1" value={r.freezeUnfreezeLast} disabled={r.freezeOutputOnly} on:input={(e) => setR({ freezeUnfreezeLast: +e.currentTarget.value })} />
						<strong>{r.freezeUnfreezeLast}</strong></label>
					<label class="chk"><input type="checkbox" checked={r.freezeOutputOnly} on:change={(e) => setR({ freezeOutputOnly: e.currentTarget.checked })} /> {zh ? '只训输出层' : 'Output layer only'} <span class="hint">{ui.hintOut}</span></label>
				</div>
			{/if}
			<div class="grid">
				<label class="ft-lr"><span class="lbl">{zh ? '学习率' : 'Learning rate'}</span><span class="hint">{ui.hintLr}</span>
					<input type="range" min="0.00001" max="0.0005" step="0.00001" value={r.lr} on:input={(e) => setR({ lr: +e.currentTarget.value })} />
					<strong>{formatLr(r.lr, zh)}</strong></label>
				<label><span class="lbl">{zh ? '预热步数' : 'Warmup steps'}</span><span class="hint">{ui.hintWarm}</span>
					<input type="range" min="0" max="200" step="1" value={r.warmup} on:input={(e) => setR({ warmup: +e.currentTarget.value })} />
					<strong>{r.warmup}</strong></label>
				<label class="ft-scheduler"><span class="lbl">{zh ? '调度器' : 'Scheduler'}</span><span class="hint">{ui.hintSched}</span>
					<select class="ctrl" value={r.scheduler} on:change={(e) => setR({ scheduler: e.currentTarget.value as Recipe['scheduler'] })}>
						<option value="cosine">{zh ? '余弦' : 'cosine'}</option>
						<option value="constant">{zh ? '恒定' : 'constant'}</option>
						<option value="linear">{zh ? '线性' : 'linear'}</option>
					</select></label>
				<label><span class="lbl">{zh ? '权重衰减' : 'Weight decay'}</span><span class="hint">{ui.hintWd}</span>
					<input type="range" min="0" max="0.1" step="0.01" value={r.weightDecay} on:input={(e) => setR({ weightDecay: +e.currentTarget.value })} />
					<strong>{r.weightDecay}</strong></label>
				<label><span class="lbl">{zh ? '把数据过几遍（轮次）' : 'How many passes (epochs)'}</span><span class="hint">{ui.hintEpoch}</span>
					<input type="range" min="1" max="10" step="1" value={r.epochs} on:input={(e) => setR({ epochs: +e.currentTarget.value })} />
					<strong>{r.epochs}</strong></label>
				<label class="ft-batch"><span class="lbl">{zh ? '批次' : 'Batch'}</span><span class="hint">{ui.hintBatch}</span>
					<input type="range" min="1" max="8" step="1" value={r.batchSize} on:input={(e) => setR({ batchSize: +e.currentTarget.value })} />
					<strong>{r.batchSize}</strong></label>
				<label class="ft-batch"><span class="lbl">{zh ? '梯度累积' : 'Grad accum'}</span><span class="hint">{ui.hintAccum}</span>
					<input type="range" min="1" max="16" step="1" value={r.gradAccum} on:input={(e) => setR({ gradAccum: +e.currentTarget.value })} />
					<strong>{r.gradAccum}</strong></label>
				<label class="ft-seq"><span class="lbl">{zh ? '序列长度' : 'Sequence length'}</span><span class="hint">{ui.hintSeq}</span>
					<input type="range" min="128" max="1024" step="128" value={r.seqLen} on:input={(e) => setR({ seqLen: +e.currentTarget.value })} />
					<strong>{r.seqLen}</strong></label>
				<label class="ft-amp"><span class="lbl">{zh ? '混合精度' : 'Precision'}</span><span class="hint">{ui.hintAmp}</span>
					<select class="ctrl" value={r.amp} on:change={(e) => setR({ amp: e.currentTarget.value as Recipe['amp'] })}>
						<option value="fp16">{zh ? '半精度（更省显存）' : 'Half precision (saves memory)'}</option>
						<option value="fp32">{zh ? '全精度' : 'Full precision'}</option>
					</select></label>
				<label class="ft-seed"><span class="lbl">{zh ? '种子' : 'Seed'}</span><span class="hint">{ui.hintSeed}</span>
					<input class="ctrl" type="number" value={r.seed} on:change={(e) => setR({ seed: +e.currentTarget.value })} /></label>
				<label class="ft-early"><span class="lbl">{zh ? '早停耐心（0=关闭）' : 'Early-stop patience (0=off)'}</span><span class="hint">{ui.hintEarly}</span>
					<input type="range" min="0" max="6" step="1" value={r.earlyStop ?? 0} on:input={(e) => setR({ earlyStop: +e.currentTarget.value || null })} />
					<strong>{r.earlyStop ?? 0}</strong></label>
				<label><span class="lbl">{zh ? '梯度裁剪（0=关闭）' : 'Grad clip (0=off)'}</span><span class="hint">{ui.hintClip}</span>
					<input type="range" min="0" max="2" step="0.1" value={r.gradClip ?? 0} on:input={(e) => setR({ gradClip: +e.currentTarget.value || null })} />
					<strong>{r.gradClip ?? 0}</strong></label>
			</div>
			<p class="tiny">{zh ? '一次真正更新，相当于同时看' : 'Each update sees about'} {r.batchSize * r.gradAccum} {zh ? '条。学习率' : 'examples. Learning rate'} {formatLr(r.lr, zh)} · {methodLabel(r.method, zh)} · {r.base === 'gpt2-medium' ? 'GPT-2 medium' : 'GPT-2 small'}</p>
			{/if}
		</section>
	{:else if $finetunePanel === 'train'}
		<section class="card">
			<div class="ft-hero-card">
				<p class="kicker">{zh ? '默认推荐' : 'Default recommendation'}</p>
				<h3>{zh ? '先跑 2 步，确认能通' : 'First run 2 steps to confirm it works'}</h3>
				<p class="tiny">
					{zh
						? '这是默认推荐的入口，用推荐配方先跑两步，确认本机循环能走通。学习率、宽度和轮数先不用看；想改参数，去工作室。完整训练是加深项。下面仍会提醒：这台机器按约 8GB 显存来设计。'
						: 'This is the default recommended entry: a recommended recipe for two steps, to confirm the local loop works. You do not need the learning rate, width, or epoch count on this screen; those live in the workshop if you want to change them. A full run is the deeper option. The 8GB memory reminder stays below.'}
				</p>
				<button type="button" class="primary ft-short ft-short-hero" disabled={busy || running || !connected} on:click={() => doStart({ dry: true, experiment: 'short' })}>
					{startKind === 'short' ? (ui.startingShort || (zh ? '正在开始极短跑…' : 'Starting a short run…')) : (zh ? '先跑 2 步，确认能通' : 'Run 2 steps to confirm it works')}
				</button>
			</div>
			<div class="row">
				<button type="button" class="ghost ft-start" disabled={busy || running || !connected} on:click={() => doStart()}>
					{startKind === 'start' ? (ui.startingTrain || (zh ? '正在开训…' : 'Starting training…')) : (zh ? '开训（完整训练，加深项）' : 'Start a full run (deeper option)')}
				</button>
				<button type="button" class="ghost ft-pause" disabled={!running || !!ctrlKind} on:click={() => doCtrl('pause')}>
					{ctrlKind === 'pause' ? (ui.pausing || (zh ? '正在暂停…' : 'Pausing…')) : (zh ? '暂停' : 'Pause')}
				</button>
				<button
					type="button"
					class="ghost ft-resume"
					disabled={!!ctrlKind || busy || (!paused && $finetuneStatus !== 'done') || (!connected && !paused)}
					on:click={() => (paused ? doCtrl('resume') : doStart({ resume: true }))}
				>
					{startKind === 'resume' || ctrlKind === 'resume'
						? (ui.resuming || (zh ? '正在恢复…' : 'Resuming…'))
						: (zh ? '恢复 / 从检查点继续' : 'Resume / from checkpoint')}
				</button>
				<button type="button" class="ghost ft-stop" disabled={(!running && !paused) || !!ctrlKind} on:click={() => doCtrl('stop')}>
					{ctrlKind === 'stop' ? (ui.stopping || (zh ? '正在停止…' : 'Stopping…')) : (zh ? '停止' : 'Stop')}
				</button>
			</div>
			<p class="tiny ft-why">
				{zh
					? '这是干什么：让模型按配方更新权重。为什么：只改温度不是训练。在哪里：训练监控这些按钮。常见误解：损失越低不一定更好；多训几轮也不一定更好。'
					: 'What this is: update the weights with the recipe. Why: changing temperature is not training. Where: these buttons on the monitor. Common mix-up: a lower loss is not always better, and more passes are not automatically better.'}
			</p>
			{#if !connected}
				<p class="warn ft-offline-can">{ui.offlineTrainHint || (zh ? '训练器未连接，不能真开训。还能读教材、预览约数。请先展开启动说明，把服务开起来。' : 'The trainer is not connected, so training cannot start.')}</p>
			{/if}
			<label class="chk"><input type="checkbox" bind:checked={shortRun} /> {zh ? '普通开训也只跑 2 步（便于检查循环）' : 'Cap a normal start to 2 steps (to check the loop)'}</label>
			<p class="tiny vram-hint">
				{memLine}。{ui.vramHint || (zh ? '这台笔记本显卡大约 8GB 显存。完整训练如果不够用，先把一条文本的长度，或一次看的条数，调小一点；也可以先做极短跑，确认循环能跑通。' : 'This laptop GPU has about 8GB of memory. If a full run needs more, shorten the sequence or look at fewer examples at once, or do a short run first.')}
			</p>
			{#if memTight}
				<p class="warn">{zh ? '显存可能不够用。先把一条文本的长度，或一次看的条数，调小一点。' : 'Memory may not be enough. First shorten the sequence, or look at fewer examples at once.'}</p>
			{/if}
			<p class="tiny ft-vram">
				{zh ? '状态' : 'Status'}：{statusLabel($finetuneStatus)}
				{#if $finetuneRunId}· {ui.runSaved || (zh ? '本次记录已保存' : 'This run has been saved')}{/if}
				{#if lastMetric?.vramMb}· {memLine}{/if}
				{#if lastMetric?.trainLoss != null}· {zh ? '训练损失' : 'train'} {fmt(lastMetric.trainLoss)}{/if}
				{#if lastMetric?.valLoss != null}· {zh ? '验证损失' : 'val'} {fmt(lastMetric.valLoss)}{/if}
			</p>
			{#if statusMsg}<p class="warn">{statusMsg}</p>{/if}
			{#if $finetuneError}<p class="warn">{$finetuneError}</p>{/if}
			<details class="ft-more ft-train-more" class:bare={studioOpen} open={studioOpen}>
				<summary>{ui.trainMore || (zh ? '更多：只改一个旋钮、过拟合演示和检查点' : 'More: one-knob compare, overfit demo, and checkpoints')}</summary>
			<div class="exp-card ft-one-knob">
				<h3>{zh ? '只改一个旋钮对照跑' : 'Change only one knob, then compare'}</h3>
				<p class="tiny">
					{zh
						? '锁定数据、种子、方法和其余参数，只改学习率或旁边一小块的宽度（秩），再跑一次。档案里会并排比较方法、数据、曲线和续写/概率，方便讲出是哪个旋钮起的作用。默认只跑 2 步，避免把约 8GB 显存占很久；加深时可再做完整对照。'
						: 'Lock the data, seed, method, and every other setting; change only the learning rate or the add-on width (rank), then run again. The archive compares method, data, curves, and continuations/probabilities side by side, so you can say which knob did the work. The default is 2 steps, so it will not occupy about 8GB of memory for long; a fuller compare is a deeper option.'}
				</p>
				<div class="row">
					<label class="chk"><input type="radio" bind:group={oneKnob} value={'lr'} /> {zh ? '只改学习率' : 'Change only the learning rate'}（{formatLr(r.lr, zh)} → {formatLr(altLr, zh)}）</label>
					<label class="chk"><input type="radio" bind:group={oneKnob} value={'loraR'} /> {zh ? '只改宽度（秩）' : 'Change only the width (rank)'}（{r.loraR} → {altR}）</label>
				</div>
				<p class="tiny">
					{zh ? '对照基准' : 'Baseline run'}：
					{#if knobBase}{knobBase.id} · {knobBase.recipe && knobBase.recipe.method ? methodLabel(String(knobBase.recipe.method), zh) : '—'}{:else}{zh ? '还没有已完成的跑次，将先记下即将开始的这一次为基准（可先做极短跑）。' : 'No finished run yet. You can do a short run first and use it as the baseline.'}{/if}
				</p>
				<button
					type="button"
					class="ghost"
					disabled={!doneRuns.length}
					on:click={() => {
						knobBaseId = playRunId || doneRuns[0]?.id || null;
					}}
				>
					{zh ? '把当前已完成的这次当作对照基准' : 'Use the current finished run as the baseline'}
				</button>
				<button
					type="button"
					class="primary"
					disabled={busy || running || !connected}
					on:click={() =>
						doStart({
							experiment: 'one-knob',
							maxSteps: ONE_KNOB_STEPS,
							recipePatch: oneKnob === 'loraR' ? { loraR: altR, changedKnob: 'loraR' } : { lr: altLr, changedKnob: 'lr' }
						})}
				>
					{startKind === 'oneknob' ? (zh ? '正在开始对照跑…' : 'Starting the compare run…') : (zh ? '只改这个再跑一次（极短对照，2 步）' : 'Change only this and run again (short compare, 2 steps)')}
				</button>
			</div>
			<div class="exp-card ft-overfit">
				<h3>{zh ? '故意多训几轮（短演示）' : 'Train a little longer on purpose (short demo)'}</h3>
				<p class="tiny">
					{zh
						? '按约 8GB 显存和 GPT-2 可承受来设：默认最多 12 步、关掉早停、每隔 2 步算一次验证。这不是很长的训练。若验证损失抬头，曲线上会标出「验证开始抬头」，并标出验证最好的一步。'
						: 'Sized for about 8GB of memory and GPT-2: at most 12 steps, early stop off, validation every 2 steps. This is not a long run. If validation rises, the chart marks “val starts rising” and the step with the best validation loss.'}
				</p>
				<div class="row">
					<button type="button" class="ghost ft-overfit-demo" on:click={() => (showOverfitDemo = !showOverfitDemo)}>
						{showOverfitDemo ? (zh ? '收起示例曲线' : 'Hide the example curve') : (zh ? '先看示例曲线（不训练，不占显存）' : 'First see an example curve (no training, no extra memory)')}
					</button>
					<button
						type="button"
						class="primary"
						disabled={busy || running || !connected}
						on:click={() => doStart({ experiment: 'overfit', maxSteps: OVERFIT_MAX_STEPS })}
					>
						{startKind === 'overfit' ? (zh ? '正在开始过拟合短演示…' : 'Starting the short overfit demo…') : (zh ? '开始故意多训几轮（最多 12 步）' : 'Start the short overfit demo (12 steps max)')}
					</button>
				</div>
			</div>
			<div class="exp-card ft-ckpt">
				<h3>{zh ? '选验证最好的检查点' : 'Pick the best-validation checkpoint'}</h3>
				<label class="chk">
					<input type="checkbox" bind:checked={useBest} />
					{zh ? '结束后尽量改用验证损失最好的那一次（不只是早停）' : 'When it finishes, prefer the step with the best validation loss (not only early stopping)'}
				</label>
				<p class="tiny">
					{zh
						? (evalSource && evalSource.bestValStep != null
							? `这次验证最好的一步是第 ${evalSource.bestValStep} 步，验证损失 ${Number(evalSource.bestValLoss).toFixed(3)}。${evalSource.usedCheckpoint === 'best' ? '导出和续写已尽量用这一次。' : '若还没用上，下次请勾选上面这项。'}`
							: '训练过程中会记下验证最好的一步。导出的仍是旁边加的一小块（LoRA）；没合并前，基座原文件通常还在。')
						: (evalSource && evalSource.bestValStep != null
							? `Best validation was at step ${evalSource.bestValStep}, val loss ${Number(evalSource.bestValLoss).toFixed(3)}.${evalSource.usedCheckpoint === 'best' ? ' Export and generation prefer this checkpoint.' : ' Turn the option on next time if it was not used.'}`
							: 'The run will record the step with the best validation loss. The export is still the small add-on (LoRA); until you merge, the original base file usually stays.')}
				</p>
			</div>
			</details>
			<div class="ft-curve">
				<FtLossChart metrics={chartMetrics} {zh} />
				<p class="tiny ft-why">{zh ? '常见误解：损失越低不一定越好。验证变差时，再多训几轮往往更糟。' : 'Common mix-up: lower loss is not always better. If validation gets worse, more passes often make it worse.'}</p>
			</div>
			<div class="ft-key-events">
				<p class="kicker">{zh ? '关键事件（人话）' : 'Key events in plain words'}</p>
				{#if keyEvents.length}
					<ul>{#each keyEvents as ev}<li>{ev}</li>{/each}</ul>
				{:else}
					<p class="tiny">{zh ? '开训后，关键事件会用人话写在这里。原始日志默认收起。' : 'When a run starts, key events will appear here in plain words. The raw log is collapsed by default.'}</p>
				{/if}
				<button type="button" class="ghost" on:click={() => (showRawLogs = !showRawLogs)}>
					{showRawLogs ? (zh ? '收起原始日志' : 'Hide the raw log') : (zh ? '展开原始日志' : 'Show the raw log')}
				</button>
				{#if showRawLogs}
					<pre class="ft-log">{($finetuneLogs.slice(-30).join('\n') || (zh ? '还没有日志。' : 'No logs yet.'))}</pre>
				{/if}
			</div>
		</section>
	{:else if $finetunePanel === 'play'}
		<section class="ft-playground card">
			{#if !studioOpen && view === 'baseline'}
				<div class="ft-hero-card" data-te-ft="now">
					<p class="kicker">{ui.nowKicker || (zh ? '现在做这件事' : 'Do this now')}</p>
					<h3>{ui.baselineHeroTitle || (zh ? '存下微调前的续写' : 'Save the before-training continuation')}</h3>
					<p class="tiny">{ui.baselineHeroBody || (zh ? '没有「前」，开训后就没法对照。必须让训练器真正写出句子才算存好。' : 'Without a before, you cannot compare after.')}</p>
					<button type="button" class="primary ft-baseline" data-te-ft="baseline-save" disabled={busy} on:click={() => doGenerate(true)}>
						{genKind === 'baseline' ? (ui.savingBaseline || (zh ? '正在生成微调前的基线续写…' : 'Generating the pre-training baseline…')) : (ui.baselineSave || ui.baselineHeroTitle || (zh ? '存下微调前的续写' : 'Save the before-training continuation'))}
					</button>
					{#if $finetuneBaselineSaved}
						<button type="button" class="primary" data-te-ft="next-train" on:click={() => setSpineView('train')}>{ui.nextTrain || (zh ? '下一步：先跑 2 步，确认能通' : 'Next: run 2 steps to confirm it works')}</button>
					{/if}
				</div>
				<aside
					class="ft-loss-sketch-door"
					data-te-ft="loss-sketch"
					data-te-math="dock"
					data-te-math-default="loss"
					data-te-math-current="loss"
					data-te-math-open={lossSketchOpen ? '1' : '0'}
					data-te-math-phenom="loss"
					data-te-ft-baseline={$finetuneBaselineSaved ? '1' : '0'}
					aria-label={zh ? '看见这一步怎么算' : 'See how this step is calculated'}
				>
					<button
						type="button"
						class="loss-door-head"
						data-te-math="how"
						data-te-ft="open-loss-sketch"
						aria-expanded={lossSketchOpen}
						on:click={() => (lossSketchOpen ? (lossSketchOpen = false) : openLossSketch())}
					>
						<span class="kicker">{zh ? '看见这一步怎么算' : 'See how this step is calculated'}</span>
						<strong>{zh ? '损失是怎么从这张表算出来的' : 'How loss is calculated from this table'}</strong>
						<span class="chev" aria-hidden="true">{lossSketchOpen ? '▾' : '▸'}</span>
					</button>
					{#if lossSketchOpen}
						<div class="loss-door-body" data-te-ft="loss-sketch-body">
							<p class="tiny">{zh ? '这一步可以先走，不必先写下真正的基线续写，也不会开训。下面用示意表上的数把「损失」算一遍。' : 'You can walk this step first, without writing a real baseline continuation, and it does not start training. The sketch table below uses numbers on this screen to compute “loss”.'}</p>
							<FtLossAsTable {zh} showWalk />
						</div>
					{/if}
				</aside>
			{:else if !studioOpen && view === 'compare'}
				<div class="ft-hero-card" data-te-ft="now">
					<p class="kicker">{ui.nowKicker || (zh ? '现在做这件事' : 'Do this now')}</p>
					<h3>{ui.compareHeroTitle || (zh ? '看同一批提示词的前后差别' : 'See how the same prompts changed')}</h3>
					<p class="tiny">{ui.compareHeroBody || (zh ? '损失只说明数字在动。要看续写有没有跟着语料走。' : 'Loss only says the numbers moved.')}</p>
					<button type="button" class="primary ft-compare" disabled={busy} on:click={() => doGenerate(false)}>
						{genKind === 'compare' ? (ui.comparing || (zh ? '正在对照续写…' : 'Comparing continuations…')) : (zh ? '对照续写（基座 vs 微调后）' : 'Compare (base vs fine-tuned)')}
					</button>
					<button type="button" class="primary" data-te-ft="next-loss" on:click={() => { finetuneComparedAfter.set(true); setSpineView('loss'); coachLessonIdx.set(stationIndexById('finetune', 'loss')); coachVisible.set(true); }}>{zh ? '下一步：看看损失是什么' : 'Next: see what loss is'}</button>
				</div>
			{:else}
				<h3>{zh ? '对照游乐场' : 'Comparison playground'}</h3>
				<p class="tiny">{zh ? '同一批提示词，先看下一个词的概率怎么偏，再看抽出来的句子。抽样旋钮不改权重。两段话像不像不是完整评测。' : 'Same prompts: first see how the next-token probabilities shift, then read the sampled sentences. Sampling knobs do not change weights. Two snippets looking alike is not a full evaluation.'}</p>
			{/if}
			{#if !hasCk && (studioOpen || view === 'compare')}
				<div class="empty-tuned">
					<p>{ui.playEmptyTuned || (zh ? '「微调后」这一侧现在是空的，因为还没有训练好的检查点。基座一侧的概率仍可看。请先到训练监控做一次极短跑或开训，再回来对照偏移。' : 'The fine-tuned side is empty until you have a checkpoint. You can still see the base probabilities.')}</p>
					<button type="button" class="ghost" on:click={() => goPanel('train', '.ft-start')}>{ui.playEmptyGo || (zh ? '去训练监控' : 'Go to the monitor')}</button>
				</div>
			{/if}
			{#each $finetuneGenerations as g}
				<div class="ft-prob-block">
					<p class="q">{g.prompt}</p>
					<FtProbBars
						{zh}
						baseProbs={g.baseProbs || []}
						tunedProbs={g.tunedProbs || []}
						hasTuned={!!(g.hasTuned || (g.tunedProbs && g.tunedProbs.length) || hasCk)}
						waiting={probsWaiting}
					/>
				</div>
			{:else}
				<FtProbBars {zh} baseProbs={[]} tunedProbs={[]} hasTuned={hasCk} waiting={probsWaiting} />
			{/each}
			{#if !studioOpen && view === 'baseline'}
			<details class="ft-more ft-sampling-more" data-te-ft="sampling-more">
				<summary>{ui.samplingMore || (zh ? '再看抽样旋钮（温度、Top-k、Top-p）' : 'Then see the sampling knobs (temperature, Top-k, Top-p)')}</summary>
				<div class="row ft-temp ft-sampling">
					<label><span class="lbl">{zh ? '意外程度（温度）' : 'Surprise (temperature)'}</span>
						<select class="ctrl" bind:value={$finetuneGenTemp}><option value={0.2}>0.2</option><option value={0.8}>0.8</option><option value={1.0}>1.0</option></select></label>
					<label><span class="lbl">{zh ? '只从最可能的几个里抽（top-k）' : 'Only from the top few (top-k)'}</span>
						<input class="ctrl" type="number" min="1" max="200" bind:value={$finetuneGenTopK} /></label>
					<label><span class="lbl">{zh ? '概率累计到这么多就停（top-p）' : 'Stop once probability adds up (top-p)'}</span>
						<input class="ctrl" type="number" min="0.1" max="1" step="0.05" bind:value={$finetuneGenTopP} /></label>
					<label><span class="lbl">{zh ? '最大长度' : 'Max length'}</span>
						<input class="ctrl" type="number" min="16" max="200" bind:value={$finetuneGenMaxLen} /></label>
				</div>
				<p class="tiny ft-why ft-temp-note">
					{zh
						? '拧这两个旋钮只改生成时怎么抽词，不是又训练一次。两段话像不像也不是完整评测；会把笔记背出来，并不等于真的懂了那种口吻。'
						: 'Twisting these knobs only changes how we draw a word at generation time — it is not another training run. Two snippets looking alike is not a full evaluation, and repeating a note verbatim is not the same as having learned the voice.'}
				</p>
			</details>
			{:else}
			<div class="row ft-temp ft-sampling">
				<label><span class="lbl">{zh ? '意外程度（温度）' : 'Surprise (temperature)'}</span>
					<select class="ctrl" bind:value={$finetuneGenTemp}><option value={0.2}>0.2</option><option value={0.8}>0.8</option><option value={1.0}>1.0</option></select></label>
				<label><span class="lbl">{zh ? '只从最可能的几个里抽（top-k）' : 'Only from the top few (top-k)'}</span>
					<input class="ctrl" type="number" min="1" max="200" bind:value={$finetuneGenTopK} /></label>
				<label><span class="lbl">{zh ? '概率累计到这么多就停（top-p）' : 'Stop once probability adds up (top-p)'}</span>
					<input class="ctrl" type="number" min="0.1" max="1" step="0.05" bind:value={$finetuneGenTopP} /></label>
				<label><span class="lbl">{zh ? '最大长度' : 'Max length'}</span>
					<input class="ctrl" type="number" min="16" max="200" bind:value={$finetuneGenMaxLen} /></label>
			</div>
			<p class="tiny ft-why ft-temp-note">
				{zh
					? '拧这两个旋钮只改生成时怎么抽词，不是又训练一次。两段话像不像也不是完整评测；会把笔记背出来，并不等于真的懂了那种口吻。'
					: 'Twisting these knobs only changes how we draw a word at generation time — it is not another training run. Two snippets looking alike is not a full evaluation, and repeating a note verbatim is not the same as having learned the voice.'}
			</p>
			{/if}
			{#each $finetunePrompts as p, i}
				<label><span class="lbl">{zh ? '提示词' : 'Prompt'} {i + 1}</span>
					<textarea rows="2" value={p} on:input={(e) => finetunePrompts.update((xs) => xs.map((x, j) => (j === i ? e.currentTarget.value : x)))}></textarea></label>
			{/each}
			<button type="button" class="ghost" on:click={() => finetunePrompts.update((xs) => [...xs, ''])}>{zh ? '添加提示词' : 'Add a prompt'}</button>
			<div class="row">
				<button type="button" class="primary ft-compare" disabled={busy} on:click={() => doGenerate(false)}>
					{genKind === 'compare' ? (ui.comparing || (zh ? '正在对照续写…' : 'Comparing continuations…')) : (zh ? '对照续写（基座 vs 微调后）' : 'Compare (base vs fine-tuned)')}
				</button>
				{#if studioOpen || view !== 'baseline'}
				<button type="button" class="ghost ft-baseline" data-te-ft="baseline-save-more" disabled={busy} on:click={() => doGenerate(true)}>
					{genKind === 'baseline' ? (ui.savingBaseline || (zh ? '正在生成微调前的基线续写…' : 'Generating the pre-training baseline…')) : (ui.baselineSave || ui.baselineHeroTitle || (zh ? '存下微调前的续写' : 'Save the before-training continuation'))}
				</button>
				{/if}
			</div>
			<p class="tiny ft-why">
				{zh
					? '这是干什么：先留下微调前的续写。为什么：没有「前」就没法对照。在哪里：对照游乐场。常见误解：没连上训练器时点一下，并不能算存好了；必须真正写出续写。'
					: 'What this is: keep a continuation from before training. Why: without a before, you cannot compare. Where: the playground. Common mix-up: a click while the trainer is off does not count — a real continuation is required.'}
			</p>
			{#if !connected}
				<p class="warn ft-offline-can">{ui.offlineGenHint || (zh ? '训练器未连接，不能存真实续写或对照。还能读教材、预览约数。请先启动训练器。' : 'The trainer is not connected, so a real continuation cannot be saved.')}</p>
			{/if}
			{#if $finetuneBaselineSaved}
				<p class="ok-line">{ui.baselineSaved || (zh ? '已存下微调前的基线续写。开训后可以用同一批提示词对照。' : 'The pre-training baseline continuation is saved.')}</p>
			{/if}
			{#if sftMode}
				<p class="ok-line ft-sft">
					{zh ? '当前是问答模板：训练时怎么写，推理时就该怎么问。请用「问：…」提问，观察「答：」后面的续写。' : 'You are on the Q/A template: ask at inference in the same format you trained on. Use “Q: …” and watch the continuation after “A:”.'}
				</p>
			{/if}
			{#each $finetuneGenerations as g}
				<div class="cmp">
					<p class="q">{g.prompt}</p>
					<div class="two">
						<div><h4>{zh ? '基座抽出来的句子' : 'Sentence sampled from the base'}</h4><p>{g.base || (zh ? '还没有抽句子。概率排行在上面。' : 'No sentence yet. The ranking is above.')}</p></div>
						<div><h4>{zh ? '微调后抽出来的句子' : 'Sentence sampled after fine-tuning'}</h4><p>{g.tuned || (ui.playEmptyTuned || (zh ? '还没有微调后的续写。请先完成一次训练。概率怎么偏，仍以上面的排行为准。' : 'No fine-tuned continuation yet. Finish a training run first. The ranking above still shows how probabilities shift.'))}</p></div>
					</div>
				</div>
			{/each}
			<details class="ft-more" class:bare={studioOpen} open={studioOpen}>
				<summary>{ui.evalMore || (zh ? '评测卡（需要时再打开）' : 'Eval card (open when you need it)')}</summary>
			<FtEvalCard
				{zh}
				valLoss={evalSource ? (evalSource.bestValLoss ?? lastLoss(evalSource, 'valLoss')) : lastLoss({ metrics: $finetuneMetrics } as any, 'valLoss')}
				testLoss={evalSource?.testLoss ?? null}
				bestValLoss={evalSource?.bestValLoss ?? null}
				bestValStep={evalSource?.bestValStep ?? null}
				leakVal={!!(evalSource?.leakVal || evalSource?.recipe?.leakVal || leakVal)}
				reading={evalReadingText || (evalSource?.evalCard && (zh ? evalSource.evalCard.reading : evalSource.evalCard.readingEn || evalSource.evalCard.reading)) || ''}
				filling={evalFilling}
				items={evalItems.length ? evalItems : evalPromptList.map((p) => ({ id: p.id, kind: p.kind, prompt: p.text }))}
				onFill={fillEvalCard}
			/>
			</details>
		</section>
	{:else}
		<section class="ft-archive card">
			<h3>{zh ? '实验档案' : 'Run archive'}</h3>
			<p class="tiny">{ui.archiveLead || (zh ? '用人话摘要每次跑的方法、数据、曲线和续写/评测要点，可并排对照。不要只看编号。' : 'Each run is summarized in plain words: method, data, curves, and continuation/eval points, and you can compare two side by side. Do not look only at ids.')}</p>
			<button type="button" class="ghost" on:click={() => doRecheck('archive')} disabled={healthChecking}>
				{healthChecking ? (ui.archiveChecking || (zh ? '正在刷新档案…' : 'Refreshing the archive…')) : (zh ? '刷新档案' : 'Refresh')}
			</button>
			{#if !$finetuneRuns.length}<p class="tiny">{zh ? '还没有已保存的跑次。开训成功后会出现在这里。档案里会用人话写下方法（旁边加一小块、只改最后几层或几乎全部改）和学习率，不会只写代号。' : 'No saved runs yet. They appear here after a successful start. Each run is summarized in plain words for the method and the learning rate, not just short codes.'}</p>{/if}
			<ul class="runs">
				{#each $finetuneRuns as run}
					<li class="run-row">
						<label class="chk"><input type="checkbox" checked={$finetuneCompareIds.includes(run.id)} on:change={() => {
							const cur = $finetuneCompareIds;
							if (cur[0] === run.id) finetuneCompareIds.set([null, cur[1]]);
							else if (cur[1] === run.id) finetuneCompareIds.set([cur[0], null]);
							else if (!cur[0]) finetuneCompareIds.set([run.id, cur[1]]);
							else finetuneCompareIds.set([cur[0], run.id]);
						}} /> <span class="sr">{zh ? '对比' : 'Compare'}</span></label>
						<div class="run-sum">
							<p><strong>{statusLabel(run.status)}</strong> · {run.createdAt} · {run.id}</p>
							{#each runPlainSummary(run, zh) as line}
								<p class="tiny">{line}</p>
							{/each}
							<p class="tiny">
								{zh ? '训练损失' : 'train'} {fmt(lastLoss(run, 'trainLoss'))}
								· {zh ? '验证损失' : 'val'} {fmt(lastLoss(run, 'valLoss'))}
								{#if run.bestValStep != null}· {zh ? `验证最好：第 ${run.bestValStep} 步` : `best val: step ${run.bestValStep}`}{/if}
							</p>
							<p class="tiny">{canExport(run) ? (ui.exportYes || (zh ? '可以导出旁边加的那一小块。默认还没有合并回基座原文件。没合并前，基座原文件通常还在。' : 'You can export the small add-on. By default it has not been merged back into the original base file, which usually still stays in place.')) : (ui.exportNo || (zh ? '还不能导出' : 'Nothing to export yet'))}</p>
						</div>
						{#if canExport(run)}
							<button type="button" class="ft-export ghost-link" disabled={exportingId === run.id} on:click={() => doExport(run.id)}>
								{exportingId === run.id ? (ui.exporting || (zh ? '正在准备导出…' : 'Preparing the export…')) : (zh ? '导出旁边那一小块' : 'Export the small add-on')}
			</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if $finetuneCompareIds[0] || $finetuneCompareIds[1]}
				<div class="ft-archive-compare">
					<p class="kicker">{zh ? '并排对照' : 'Side-by-side compare'}</p>
					{#if $finetuneCompareIds[0] && $finetuneCompareIds[1]}
						{@const runA = $finetuneRuns.find((x) => x.id === $finetuneCompareIds[0])}
						{@const runB = $finetuneRuns.find((x) => x.id === $finetuneCompareIds[1])}
						{#if runA && runB}
							<p class="cmp-delta">{knobDelta(runA, runB, zh)}</p>
						{/if}
					{/if}
					<div class="two">
						{#each $finetuneCompareIds as id}
							<div class="cmp-col">
								<h4>{id ? (id + ' · ' + statusLabel(($finetuneRuns.find((x) => x.id === id)?.status) || '')) : (zh ? '未选' : 'none')}</h4>
								{#if id}
									{@const run = $finetuneRuns.find((x) => x.id === id)}
									{#if run}
										{#each runPlainSummary(run, zh) as line}
											<p class="tiny">{line}</p>
										{/each}
										<FtLossChart metrics={run.metrics || []} {zh} compact />
										{#if run.generations && run.generations[0]}
											<p class="tiny"><strong>{zh ? '续写要点' : 'Continuation'}</strong> {run.generations[0].prompt}</p>
											<p class="tiny">{zh ? '前' : 'before'}：{(run.generations[0].base || '').slice(0, 160)}</p>
											<p class="tiny">{zh ? '后' : 'after'}：{(run.generations[0].tuned || '').slice(0, 160)}</p>
										{/if}
										{#if run.evalCard && (run.evalCard.reading || run.evalCard.readingEn)}
											<p class="tiny"><strong>{zh ? '评测要点' : 'Eval point'}</strong> {zh ? (run.evalCard.reading || run.evalCard.readingEn) : (run.evalCard.readingEn || run.evalCard.reading)}</p>
										{/if}
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.ft-studio { height: 100%; width: 100%; padding: 0.6rem 1rem 1.25rem; overflow: auto; box-sizing: border-box; }
	.ft-spine-sticky {
		position: sticky;
		top: 0;
		z-index: 12;
		background: #fafafa;
		margin: 0 -1rem 0.15rem;
		padding: 0.15rem 1rem 0.2rem;
		box-shadow: 0 10px 14px -12px rgba(17, 24, 39, 0.18);
	}
	.ft-spine-sticky .ft-now {
		margin: 0.25rem 0 0.15rem;
		padding: 0.55rem 0.75rem 0.65rem;
	}
	.ft-spine-sticky.walked .ft-now {
		padding: 0.12rem 0.55rem 0.14rem;
	}
	.ft-spine-sticky.walked .ft-now h3 {
		font-size: 0.86rem;
		margin: 0 0 0.04rem;
	}
	.ft-spine-sticky.walked .ft-now .now-why {
		margin: 0;
		font-size: 0.74rem;
		line-height: 1.3;
	}
	.ft-spine-sticky.walked .ft-now .ghost {
		display: none;
	}
	.ft-sampling-more {
		margin: 0.45rem 0 0.35rem;
		background: #fafafa;
		border: 1px dashed #e5e7eb;
		border-radius: 0.45rem;
		padding: 0.2rem 0.55rem 0.35rem;
	}
	.ft-sampling-more > summary {
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 600;
		color: #6b7280;
		padding: 0.25rem 0;
	}
	.ft-explain-dock,
	.ft-step-panel,
	.ft-data,
	.ft-tok-panel,
	.ft-contrast-lead {
		scroll-margin-top: 4.25rem;
	}
	.ft-loss-path,
	.ft-now {
		scroll-margin-top: 4.25rem;
		scroll-margin-bottom: var(--te-guide-h, 8rem);
	}
	.ft-bridge-actions { margin: 0.45rem 0 0.15rem; }
	.ft-bridge-go { color: #5b21b6; border-color: #ddd6fe; }
	.ft-bridge-actions { display: flex; flex-wrap: wrap; gap: 0.45rem 0.7rem; align-items: center; }
	.ft-bridge-lora { color: #6d28d9; border-color: #c4b5fd; background: #f5f3ff; }
	.disclaimer { margin: 0 0 0.35rem; font-size: var(--te-fs-caption, 0.75rem); color: #6b7280; background: transparent; border: none; padding: 0; white-space: pre-wrap; line-height: 1.45; }
	.help { margin: 0.35rem 0 0.5rem; font-size: var(--te-fs-caption, 0.75rem); color: #6b7280; background: #fafafa; border: 1px dashed #e5e7eb; border-radius: 0.4rem; padding: 0.35rem 0.55rem; white-space: pre-wrap; }
	.status { display: flex; gap: 0.6rem; align-items: center; justify-content: space-between; border-radius: 0.4rem; padding: 0.35rem 0.6rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
	.status.ok { background: #ecfdf5; border: 1px solid #a7f3d0; }
	.status { font-size: var(--te-fs-caption, 0.75rem); }
	.status.down { background: #fffaf5; border: 1px solid #fde8d0; color: #7c4a1e; }
	.status.quiet-fact,
	.status.quiet-fact.ok,
	.status.quiet-fact.down {
		background: transparent;
		border: none;
		color: #6b7280;
		padding: 0.05rem 0;
		margin-bottom: 0.3rem;
		font-size: 0.72rem;
		font-weight: 500;
	}
	.status.quiet-fact .ghost {
		background: transparent;
		border-color: transparent;
		color: #6b7280;
		font-weight: 500;
		padding: 0.1rem 0.3rem;
		font-size: 0.72rem;
	}
	.tabs { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.6rem; }
	.tabs button { border: 1px solid #e5e7eb; background: white; border-radius: 999px; padding: 0.25rem 0.7rem; cursor: pointer; font-size: 0.82rem; }
	.tabs button.on { background: #6d28d9; color: white; border-color: #6d28d9; }
	.card { background: white; border: 1px solid #ede9fe; border-radius: 0.6rem; padding: 0.8rem 0.9rem 1rem; }
	.lbl { display: block; font-size: 0.72rem; color: #6b7280; margin-bottom: 0.1rem; }
	.ctrl, textarea, input[type='number'], input[type='file'] { border: 1px solid #e5e7eb; border-radius: 0.35rem; padding: 0.25rem 0.4rem; font-size: 0.82rem; background: white; width: 100%; box-sizing: border-box; }
	.row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.4rem 0; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.55rem 0.8rem; }
	.primary, .ghost { border-radius: 0.4rem; padding: 0.35rem 0.7rem; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
	.primary { background: #7c3aed; color: white; border: none; }
	.ghost { background: white; border: 1px solid #e5e7eb; color: #374151; }
	.primary:disabled, .ghost:disabled { opacity: 0.45; cursor: not-allowed; }
	.tiny { font-size: 0.8rem; color: #6b7280; }
	.ft-why { margin: 0.35rem 0 0.5rem; line-height: 1.5; }
	.ft-split-tag { font-size: 0.7rem; border-radius: 99px; padding: 0.05rem 0.4rem; font-weight: 700; }
	.ft-split-tag.train { background: #ede9fe; color: #5b21b6; }
	.ft-split-tag.val { background: #ffedd5; color: #9a3412; }
	.ft-tok-group { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 0.15rem; border: 1.5px solid #7c3aed; border-radius: 0.35rem; padding: 0.15rem 0.25rem 0.1rem; margin: 0.1rem 0.15rem 0.1rem 0; background: #f5f3ff; vertical-align: middle; }
	.ft-tok-gcap { font-size: 0.65rem; color: #5b21b6; font-style: normal; margin-left: 0.15rem; }
	.ft-tok-chip.incomplete { opacity: 0.7; }
	.ft-tok-drop { margin-top: 0.35rem; background: #fff7ed; border: 1px dashed #f97316; border-radius: 0.4rem; padding: 0.35rem 0.45rem; }
	.ft-tok-drop p { margin: 0 0 0.25rem; font-size: 0.78rem; color: #9a3412; font-weight: 600; }
	.ft-tok-chip.drop { background: #ffedd5; color: #9a3412; text-decoration: line-through; }
	.ft-cjk-one { color: #5b21b6; }
	.ft-toggle-samples { margin: 0.4rem 0; }
	.ft-knob-hint { background: #fffbeb; border: 1px solid #fde68a; border-radius: 0.45rem; padding: 0.45rem 0.6rem; margin: 0 0 0.65rem; }
	.ft-knob-hint .kicker { margin: 0 0 0.2rem; font-size: 0.75rem; color: #92400e; font-weight: 700; }
	.ft-knob-hint p { margin: 0; font-size: 0.8rem; color: #78350f; line-height: 1.5; }
	.hint-viz { margin-top: 0.35rem; display: flex; align-items: center; gap: 0.4rem; }
	.hint-viz .step { width: 2.2rem; height: 0.35rem; background: #7c3aed; border-radius: 99px; position: relative; }
	.hint-viz .step::after { content: ''; position: absolute; right: -0.15rem; top: -0.12rem; border: 0.28rem solid transparent; border-left-color: #7c3aed; }
	.hint-viz .step.big { width: 4rem; }
	.hint-viz .mem { width: 5rem; height: 0.55rem; background: linear-gradient(#c4b5fd, #c4b5fd) 0/70% no-repeat #e5e7eb; border-radius: 2px; border: 1px solid #c4b5fd; }
	.hint-viz .cut { font-size: 0.72rem; color: #9a3412; }
	.hint-viz .base-w { width: 2.4rem; height: 1.1rem; background: #e5e7eb; border-radius: 0.2rem; }
	.hint-viz .add-w { width: calc(0.5rem * var(--r, 1)); height: 1.1rem; background: #7c3aed; border-radius: 0.15rem; }
	.ft-key-events { margin-top: 0.4rem; }
	.ft-key-events .kicker { margin: 0 0 0.3rem; font-size: 0.75rem; color: #6d28d9; font-weight: 700; }
	.ft-key-events ul { margin: 0 0 0.4rem; padding-left: 1.1rem; font-size: 0.82rem; color: #374151; line-height: 1.45; }
	.ft-prob-block { margin: 0.4rem 0 0.2rem; }
	.ft-prob-block .q { font-weight: 600; margin: 0 0 0.3rem; }
	.ft-path { display: flex; flex-wrap: wrap; gap: 0.25rem; list-style: none; padding: 0; margin: 0 0 0.55rem; }
	.ft-path li { font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 999px; background: #f3f4f6; color: #6b7280; }
	.ft-path li.on { background: #ede9fe; color: #5b21b6; font-weight: 700; }
	.ft-path li.done { background: #ecfdf5; color: #047857; }
	.warn { color: #9a3412; }
	.chk { display: flex; gap: 0.3rem; align-items: center; font-size: 0.85rem; }
	.samples, .runs { list-style: none; padding: 0; margin: 0.4rem 0; }
	.samples li, .runs li { display: flex; gap: 0.4rem; align-items: flex-start; margin-bottom: 0.35rem; }
	.idx { font-size: 0.75rem; color: #7c3aed; width: 1.6rem; }
	.ft-log, .mini { background: #111827; color: #e5e7eb; border-radius: 0.4rem; padding: 0.5rem; font-size: 0.75rem; max-height: 220px; overflow: auto; white-space: pre-wrap; }
	.mini { background: #f9fafb; color: #374151; max-height: 260px; }
	.cmp { border-top: 1px solid #f3f4f6; padding-top: 0.5rem; margin-top: 0.5rem; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
	.two h4 { margin: 0 0 0.2rem; font-size: 0.85rem; color: #5b21b6; }
	.q { font-weight: 600; }
	.ghost-link { font-size: 0.82rem; color: #6d28d9; }
	h3 { margin: 0 0 0.4rem; font-size: 1rem; color: #4c1d95; }
	.kicker { font-size: 0.75rem; color: #7c3aed; font-weight: 700; margin: 0 0 0.3rem; }
	.ft-guide { background: #f5f3ff; border-color: #c4b5fd; margin-bottom: 0.65rem; }
	.ft-guide h3 { margin-bottom: 0.25rem; }
	.ft-first-line { margin: 0 0 0.65rem; font-size: 1.05rem; font-weight: 700; color: #4c1d95; line-height: 1.45; }
	.ft-loss-path .now-why, .ft-method-path .now-why { margin: 0 0 0.7rem; font-size: 0.9rem; color: #374151; line-height: 1.55; }
	.ft-loss-sketch-door {
		margin: 0.65rem 0 0.45rem;
		border: 1px solid #ddd6fe;
		border-radius: 0.55rem;
		background: #faf8ff;
		overflow: hidden;
	}
	.ft-loss-sketch-door .loss-door-head {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
		padding: 0.45rem 0.65rem;
		cursor: pointer;
		color: #1f2937;
	}
	.ft-loss-sketch-door .kicker {
		flex: 0 0 auto;
		font-size: 0.7rem;
		font-weight: 700;
		color: #6d28d9;
		letter-spacing: 0.02em;
	}
	.ft-loss-sketch-door .loss-door-head strong {
		flex: 1 1 auto;
		font-size: 0.86rem;
		color: #1f2937;
		font-weight: 700;
		line-height: 1.35;
	}
	.ft-loss-sketch-door .chev { color: #7c3aed; font-size: 0.85rem; }
	.ft-loss-sketch-door .loss-door-body {
		padding: 0 0.7rem 0.65rem;
		border-top: 1px solid #ede9fe;
	}
	.ft-loss-sketch-door .loss-door-body .tiny { margin: 0.45rem 0 0.4rem; color: #374151; }
	.ft-now { background: #f5f3ff; border-color: #c4b5fd; margin-bottom: 0.55rem; }
	.ft-now h3 { margin-bottom: 0.2rem; }
	.ft-now .now-why { margin: 0 0 0.5rem; font-size: 0.88rem; color: #374151; line-height: 1.5; }
	.ft-now .primary + .primary, .ft-now .primary + .ghost { margin-left: 0.4rem; }
	.ft-explain-dock { margin: 0 0 0.65rem; }
	.ft-step-only { margin: 0 0 0.35rem; font-size: 0.78rem; color: #6d28d9; font-weight: 600; }
	.ft-explore-link { margin: 0 0 0.55rem; }
	.ft-next-after-tok { margin: 0.65rem 0 0.2rem; }
	.ft-bridge-hint { margin: 0.45rem 0 0; color: #6b7280; }
	.ft-data-more, .ft-train-more { margin-top: 0.6rem; }
	.ft-more.bare { border: none; padding: 0; background: transparent; }
	.ft-more.bare > summary { display: none; }
	.done-banner, .empty-tuned, .pack-note {
		background: #ecfdf5;
		border: 1px solid #a7f3d0;
		border-radius: 0.45rem;
		padding: 0.55rem 0.7rem;
		margin: 0 0 0.6rem;
		font-size: 0.88rem;
		color: #065f46;
	}
	.done-banner { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
	.done-banner p { margin: 0; flex: 1 1 16rem; }
	.empty-tuned { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
	.pack-note { background: #eef2ff; border-color: #c7d2fe; color: #3730a3; }
	.curve-empty { font-size: 0.88rem; color: #6b7280; margin: 0 0 0.4rem; }
	.vram-hint { color: #9a3412; }
	.recipe-summary ul { margin: 0.3rem 0 0.6rem; padding-left: 1.15rem; }
	.recipe-summary li { margin: 0.25rem 0; font-size: 0.9rem; color: #374151; line-height: 1.5; }
	.hint { display: block; font-size: 0.75rem; color: #6b7280; font-weight: 400; margin: 0.1rem 0 0.2rem; line-height: 1.4; }
	.run-row { align-items: flex-start; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.4rem; }
	.run-sum { flex: 1; }
	.run-sum p { margin: 0.1rem 0; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
	:global(.te-lab-flash) {
		outline: 3px solid #facc15;
		outline-offset: 3px;
		box-shadow: 0 0 0 6px rgba(250, 204, 21, 0.25);
		transition: outline 0.2s ease;
	}

	.ft-tokenize { margin: 0.15rem 0 0.45rem; }
	.ft-tok-panel {
		background: #f5f3ff;
		border: 1px solid #c4b5fd;
		border-radius: 0.5rem;
		padding: 0.65rem 0.75rem 0.75rem;
		margin: 0 0 0.7rem;
		max-height: min(52vh, 32rem);
		overflow: auto;
	}
	.ft-tok-panel.approx { background: #fff7ed; border-color: #fed7aa; }
	.ft-tok-banner { margin: 0 0 0.55rem; font-size: 0.88rem; color: #4c1d95; line-height: 1.5; }
	.ft-tok-panel.approx .ft-tok-banner { color: #9a3412; }
	.ft-tok-row { margin: 0.35rem 0 0.55rem; }
	.ft-tok-meta { display: flex; flex-wrap: wrap; gap: 0.35rem 0.7rem; align-items: baseline; font-size: 0.82rem; color: #374151; margin-bottom: 0.25rem; }
	.ft-tok-meta strong { color: #5b21b6; }
	.ft-tok-cut { color: #9a3412; font-style: normal; font-weight: 600; }
	.ft-tok-chips { display: flex; flex-wrap: wrap; gap: 0.28rem; }
	.ft-tok-chip {
		display: inline-block;
		background: white;
		border: 1px solid #ddd6fe;
		border-radius: 999px;
		padding: 0.12rem 0.45rem;
		font-size: 0.8rem;
		line-height: 1.4;
		color: #1f2937;
		white-space: pre;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.ft-tok-panel.approx .ft-tok-chip { border-color: #fed7aa; }
	.ft-tok-more { color: #6b7280; font-size: 0.85rem; padding: 0.12rem 0.2rem; }
	.ft-tok-teach { margin: 0 0 0.55rem; font-size: 0.86rem; color: #5b21b6; line-height: 1.5; background: #ede9fe; border-radius: 0.4rem; padding: 0.45rem 0.55rem; }
	.ft-tok-empty { margin: 0.4rem 0 0.7rem; }
	.ft-notice {
		position: relative;
		top: auto;
		z-index: auto;
		background: #eef2ff;
		border: 1px solid #c7d2fe;
		border-radius: 0.45rem;
		padding: 0.55rem 0.75rem;
		margin: 0 0 0.7rem;
		font-size: 0.9rem;
		color: #312e81;
		line-height: 1.5;
	}
	.ft-notice.warn { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
	.ft-notice.ok { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }
	.ft-notice.info { background: #eef2ff; border-color: #c7d2fe; color: #312e81; }
	.ft-offline-can { margin: 0.35rem 0 0.4rem; font-size: 0.88rem; color: #9a3412; line-height: 1.45; }
	.ft-help-toggle { margin-bottom: 0.5rem; }
	.ok-line { color: #065f46; font-size: 0.88rem; margin: 0.35rem 0; }
	button.ft-export {
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
	}
	button.ft-export:disabled { opacity: 0.55; cursor: not-allowed; }
	.ft-hero-card {
		background: #f5f3ff;
		border: 2px solid #7c3aed;
		border-radius: 0.7rem;
		padding: 0.85rem 1rem;
		margin: 0 0 0.85rem;
	}
	.ft-hero-card h3 { margin: 0 0 0.35rem; font-size: 1.15rem; }
	.ft-hero-card .kicker { margin: 0 0 0.2rem; font-size: 0.75rem; letter-spacing: 0.04em; color: #6d28d9; font-weight: 700; }
	.ft-short-hero { width: 100%; margin-top: 0.45rem; padding: 0.85rem 1rem; font-size: 1.05rem; font-weight: 700; }
	.exp-card {
		border: 1px solid #e5e7eb;
		border-radius: 0.55rem;
		padding: 0.7rem 0.85rem;
		margin: 0.7rem 0;
		background: #fafafa;
	}
	.exp-card h3 { margin: 0 0 0.3rem; font-size: 1rem; }
	.sft-sample {
		background: #f5f3ff;
		border: 1px dashed #c4b5fd;
		border-radius: 0.4rem;
		padding: 0.5rem 0.65rem;
		font-family: inherit;
		font-size: 0.88rem;
		white-space: pre-wrap;
	}
	.ft-archive-compare { margin-top: 0.8rem; }
	.cmp-delta {
		background: #ecfdf5;
		border: 1px solid #6ee7b7;
		border-radius: 0.45rem;
		padding: 0.5rem 0.7rem;
		font-size: 0.88rem;
		line-height: 1.5;
		color: #065f46;
	}
	.cmp-col { min-width: 0; }

	.ft-see-line { margin: 0 0 0.7rem; }
	.ft-see-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.ft-see-cols article { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.55rem 0.65rem 0.6rem; }
	.ft-see-cols article.here { background: #f5f3ff; border-color: #c4b5fd; }
	.ft-see-cols .tag { margin: 0 0 0.15rem; font-size: 0.7rem; font-weight: 700; color: #6b7280; letter-spacing: 0.02em; }
	.ft-see-cols article.here .tag { color: #6d28d9; }
	.ft-see-cols h4 { margin: 0 0 0.2rem; font-size: 0.92rem; color: #1f2937; }
	.ft-see-cols p { margin: 0; font-size: 0.8rem; color: #4b5563; line-height: 1.45; }
	.ft-see-tokens { background: #f5f3ff; border: 1px solid #c4b5fd; border-radius: 0.5rem; padding: 0.6rem 0.7rem 0.75rem; margin: 0 0 0.55rem; }
	.ft-teaser-src { margin: 0 0 0.4rem; font-size: 0.88rem; color: #4c1d95; font-weight: 600; }
	.ft-tok-chips.teaser { margin: 0 0 0.35rem; }
	.ft-tok-chips.teaser.approx .ft-tok-chip { background: #ffedd5; }
	.ft-see-tokens .ft-guide-go { margin-top: 0.35rem; }
	.ft-step-index { margin: 0 0 0.35rem; }
	.ft-more { margin: 0.45rem 0 0.5rem; }
	.ft-more > summary { cursor: pointer; list-style: revert; font-size: 0.82rem; color: #5b21b6; font-weight: 600; }
	.ft-more > summary h3 { display: inline; font-size: 0.9rem; }
	@media (max-width: 640px) {
		.ft-see-cols { grid-template-columns: 1fr; }
	}

	.ft-tok-source {
		margin: 0.2rem 0 0.45rem;
		padding: 0.45rem 0.65rem;
		background: #f8fafc;
		border-left: 3px solid #7c3aed;
		border-radius: 0 0.4rem 0.4rem 0;
		color: #1f2937;
		font-size: 0.95rem;
		line-height: 1.65;
		white-space: pre-wrap;
	}
	.ft-tok-source .lbl {
		display: inline-block;
		margin-right: 0.4rem;
		color: #6d28d9;
		font-weight: 700;
		font-size: 0.75rem;
	}
</style>
