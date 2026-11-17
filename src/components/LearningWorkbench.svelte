<script lang="ts">
	import { locale, messages, workbenchOpen, workbenchTab, coachLessonIdx, coachVisible, type WorkbenchTab } from '~/i18n';
	import { textPathDone, imageKnobsUnlocked, musicKnobsUnlocked } from '~/store/beginnerPath';
	import { isTextbookOpen, textbookCurrentPage, textbookCurrentPageId, textHasDrawnWord, tokens } from '~/store';
	import { course, getActivePages } from '~/store/course';
	import { getWorkbench, type QuizItem } from '~/courses/workbenchMeta';
	import { prepareFinetuneFlash, scrollFinetuneIntoView, finetuneSpineView } from '~/courses/finetune/store';
	import { labSeen, hasLabSignal, clearLabSignal, bootLabSignals } from '~/courses/labSignals';
	import {
		isSpacedTransferAvailable,
		spacedTransferItems
	} from '~/courses/spacedTransfer';
	import { openResearchDoor, isResearchUnlocked, bootResearchDoorHooks, researchDoorOpen } from '~/courses/researchDoor';
	import { enterTextPathStep, textPathIdAt } from '~/courses/textPath';
	import { onDestroy, onMount } from 'svelte';
	bootLabSignals();

	$: m = $messages as any;
	$: meta = getWorkbench($course);
	$: wb = (m[meta.messagesKey] ?? m.workbench) as unknown as Record<string, string>;
	$: gloss = (m[meta.glossaryKey] ?? m.glossary) as Record<string, { term: string; def: string; where: string }>;
	$: LAB_SELECTORS = meta.labSelectors;
	$: GLOSS_IDS = meta.glossIds;
	$: GLOSS_SEL = meta.glossSel;
	$: QUIZ = meta.quiz;
	$: QUIZ_GROUPS = meta.quizGroups ?? [];
	$: LAB_VERIFY = meta.labVerify ?? {};

	const FALLBACK_LAB_IDS = ['lab1', 'lab2', 'lab3', 'lab4', 'lab5'];
	$: LAB_IDS = meta.labIds ?? FALLBACK_LAB_IDS;

	let checks: Record<string, boolean> = {};
	let quizChoice: Record<string, number | null> = {};
	let loadedKey = '';

	const loadChecksFor = (key: string) => {
		if (loadedKey === key) return;
		loadedKey = key;
		quizChoice = {};
		if (typeof localStorage === 'undefined') {
			checks = {};
			return;
		}
		try {
			const raw = localStorage.getItem(key);
			checks = raw ? JSON.parse(raw) : {};
		} catch {
			checks = {};
		}
	};

	$: loadChecksFor(meta.storageKey);

	const persistChecks = () => {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(meta.storageKey, JSON.stringify(checks));
	};

	const isLabObserved = (id: string) => {
		const v = LAB_VERIFY[id];
		if (v?.kind === 'signal') return hasLabSignal(v.signal, $labSeen);
		return !!checks[id];
	};
	// Read $labSeen and checks here so the header count stays in sync with card “seen” state.
	$: labDone = LAB_IDS.filter((id) => {
		const v = LAB_VERIFY[id];
		if (v?.kind === 'signal') return hasLabSignal(v.signal, $labSeen);
		return !!checks[id];
	}).length;

	$: spacedAvailable = isSpacedTransferAvailable($textPathDone, $imageKnobsUnlocked, $musicKnobsUnlocked);
	$: spacedItems = spacedTransferItems($course);
	$: st = ((m as any).spacedTransfer ?? {}) as Record<string, string>;
	$: if ($workbenchTab === 'spaced' && !spacedAvailable) workbenchTab.set('path');

	let wbCoachReserve = '8rem';
	let wbRo: ResizeObserver | null = null;
	let launcherEl: HTMLButtonElement | undefined;
	let yieldTokens = false;
	let yieldLeft = '';
	let naturalLaunchW = 0;
	let naturalLaunchH = 0;
	const rectsOverlap = (a: { left: number; right: number; top: number; bottom: number }, b: DOMRect, pad = 8) =>
		a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
	const measureWbBottom = () => {
		if (typeof document === 'undefined' || typeof window === 'undefined') return;
		const bar = document.querySelector(
			'aside.coach-bar, [data-te-coach="full"], [data-te-coach="yield"]'
		) as HTMLElement | null;
		const reopen = document.querySelector('[data-te-coach="reopen"]') as HTMLElement | null;
		const el = bar && bar.getBoundingClientRect().height > 0 ? bar : reopen;
		if (!el) {
			wbCoachReserve = '3.6rem';
			return;
		}
		const fromBottom = Math.max(0, Math.ceil(window.innerHeight - el.getBoundingClientRect().top));
		wbCoachReserve = `${fromBottom + 8}px`;
	};
	const layoutLauncher = () => {
		if (typeof document === 'undefined' || typeof window === 'undefined') return;
		if (!launcherEl || $workbenchOpen) {
			if (!launcherEl) return;
			yieldTokens = false;
			yieldLeft = '';
			return;
		}
		if (!yieldTokens) {
			naturalLaunchW = launcherEl.offsetWidth;
			naturalLaunchH = launcherEl.offsetHeight;
		}
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		const coachVar = parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue('--te-coach-h')
		);
		const bar = document.querySelector(
			'aside.coach-bar, [data-te-coach="full"], [data-te-coach="yield"]'
		) as HTMLElement | null;
		const coachH = Number.isFinite(coachVar) && coachVar > 0
			? coachVar
			: bar
				? Math.max(0, window.innerHeight - bar.getBoundingClientRect().top)
				: 0;
		const bottom = Math.max(rem, coachH + 0.5 * rem);
		const width = naturalLaunchW || launcherEl.offsetWidth || 7.5 * rem;
		const height = naturalLaunchH || launcherEl.offsetHeight || 2.2 * rem;
		const natural = {
			left: 1.5 * rem,
			right: 1.5 * rem + width,
			top: window.innerHeight - bottom - height,
			bottom: window.innerHeight - bottom
		};
		const chipSel =
			'.embedding .token-string .cell, .embedding .tok-group-chip, .embedding .token-string .label, .embedding .piece-idx, .embedding [data-te-tok-group], .embedding [data-te-tok-label]';
		const chips = Array.from(document.querySelectorAll(chipSel)) as HTMLElement[];
		const col = document.querySelector('.embedding .token-string') as HTMLElement | null;
		let hit = false;
		for (const el of chips) {
			const r = el.getBoundingClientRect();
			if (r.width < 2 || r.height < 2) continue;
			if (rectsOverlap(natural, r, 8)) {
				hit = true;
				break;
			}
		}
		if (!hit && col) {
			const cr = col.getBoundingClientRect();
			if (cr.height > 2 && rectsOverlap(natural, cr, 8)) hit = true;
		}
		if (!hit) {
			yieldTokens = false;
			yieldLeft = '';
			return;
		}
		const rights = chips
			.map((el) => el.getBoundingClientRect().right)
			.filter((x) => Number.isFinite(x) && x > 0);
		if (col) rights.push(col.getBoundingClientRect().right);
		const colRight = rights.length ? Math.max(...rights) : natural.right;
		const compactW = Math.max((naturalLaunchW || launcherEl.offsetWidth) * 0.72, 4.6 * rem);
		const maxLeft = Math.max(12, window.innerWidth - compactW - 12);
		let left = Math.min(Math.max(colRight + 20, 12), maxLeft);
		yieldTokens = true;
		yieldLeft = `${Math.round(left)}px`;
		requestAnimationFrame(() => {
			if (!launcherEl || !yieldTokens) return;
			const br = launcherEl.getBoundingClientRect();
			let next = br.left;
			for (const el of chips) {
				const r = el.getBoundingClientRect();
				if (r.width < 2 || r.height < 2) continue;
				if (rectsOverlap({ left: next, right: next + br.width, top: br.top, bottom: br.bottom }, r, 6)) {
					next = Math.max(next, r.right + 16);
				}
			}
			next = Math.min(Math.max(next, 12), maxLeft);
			if (Math.abs(next - br.left) > 1) yieldLeft = `${Math.round(next)}px`;
		});
	};
	onMount(() => {
		bootResearchDoorHooks();
		measureWbBottom();
		layoutLauncher();
		if (typeof ResizeObserver !== 'undefined') {
			wbRo = new ResizeObserver(() => {
				measureWbBottom();
				layoutLauncher();
			});
			const bar = document.querySelector('aside.coach-bar');
			if (bar) wbRo.observe(bar);
			const slot = document.querySelector('[data-te-guide="slot"]');
			if (slot) wbRo.observe(slot);
			const col = document.querySelector('.embedding .token-column, .embedding .token-string');
			if (col) wbRo.observe(col);
			const scroller = document.querySelector('[data-te-diagram="scroll"]');
			if (scroller) wbRo.observe(scroller);
		}
		window.addEventListener('resize', measureWbBottom);
		window.addEventListener('resize', layoutLauncher);
		const scroller = document.querySelector('[data-te-diagram="scroll"]');
		scroller?.addEventListener('scroll', layoutLauncher, { passive: true });
		return () => {
			scroller?.removeEventListener('scroll', layoutLauncher);
		};
	});
	onDestroy(() => {
		wbRo?.disconnect();
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', measureWbBottom);
			window.removeEventListener('resize', layoutLauncher);
		}
	});
	$: if (typeof window !== 'undefined') {
		void $workbenchOpen;
		void $course;
		void $coachVisible;
		void $tokens;
		void $coachLessonIdx;
		requestAnimationFrame(() => {
			measureWbBottom();
			layoutLauncher();
		});
	}

	const toggleLab = (id: string) => {
		checks = { ...checks, [id]: !checks[id] };
		persistChecks();
	};

	const flash = (selector: string | null) => {
		if (!selector || typeof document === 'undefined') return;
		if ($course === 'finetune') prepareFinetuneFlash(selector);
		const run = () => {
			const el = document.querySelector(selector) as HTMLElement | null;
			if (!el) return;
			el.classList.add('te-lab-flash');
			if ($course === 'finetune') scrollFinetuneIntoView(el);
			else el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			setTimeout(() => el.classList.remove('te-lab-flash'), 1800);
		};
		if ($course === 'finetune') setTimeout(run, 60);
		else run();
	};

	const openTab = (tab: WorkbenchTab) => {
		workbenchTab.set(tab);
		workbenchOpen.set(true);
	};
	const openSpaced = () => openTab('spaced');

	const openCoach = () => {
		coachLessonIdx.set(0);
		coachVisible.set(true);
		workbenchOpen.set(false);
	};

	const backToSpine = () => {
		workbenchOpen.set(false);
		if ($course === 'finetune') coachVisible.set(false);
	};

	const enterResearch = () => {
		workbenchOpen.set(false);
		openResearchDoor($course === 'image' || $course === 'music' || $course === 'text' ? $course : undefined);
	};
	const openStation = (stationId?: string) => {
		if (!stationId) return;
		const pages = /* use stations via coach index */ stationId;
		const stageLessons =
			$course === 'image'
				? ((m as any).imageCoach?.lessons ?? [])
				: $course === 'music'
					? ((m as any).musicCoach?.lessons ?? [])
					: $course === 'finetune'
						? ((m as any).finetuneCoach?.lessons ?? [])
						: m.coach.lessons;
		const index = (stageLessons as { id?: string }[]).findIndex((l) => l?.id === stationId);
		if (index >= 0) coachLessonIdx.set(index);
		if ($course === 'text' && index >= 0) enterTextPathStep(index);
		coachVisible.set(true);
		isTextbookOpen.set(false);
		workbenchOpen.set(false);
		void pages;
	};
	const openTextbook = (pageId?: string) => {
		const pages = getActivePages();
		const idx = pageId ? pages.findIndex((p) => p.id === pageId) : 0;
		const i = idx >= 0 ? idx : 0;
		textbookCurrentPage.set(i);
		textbookCurrentPageId.set(pages[i].id);
		isTextbookOpen.set(true);
	};

	const choose = (qKey: string, choice: number) => {
		if (quizChoice[qKey] != null) return;
		quizChoice = { ...quizChoice, [qKey]: choice };
		if (typeof document === 'undefined') return;
		requestAnimationFrame(() => {
			const el =
				document.querySelector(`[data-te-quiz-pointer="${qKey}"]`) ||
				document.querySelector('[data-te-spaced-pointer]') ||
				document.querySelector('[data-te-quiz-station]');
			el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		});
	};

	const resetQuestion = (qKey: string) => {
		const next = { ...quizChoice };
		delete next[qKey];
		quizChoice = next;
	};

	const groupTitle = (g: QuizItem['group'] | { id: string; titleKey: string }) => {
		if (typeof g === 'object') return (wb as any)[g.titleKey] || g.id;
		return (wb as any)[`quizGroup_${g}`] || (g === 'qkv' ? wb.quizGroupQkv : g === 'mask' ? wb.quizGroupMask : g === 'temp' ? wb.quizGroupTemp : wb.quizGroupTransfer || g);
	};
	$: zh = $locale !== 'en';
	// Show the launcher at entry so “左下角学习工作台” is honest.
	// Labs / glossary / quiz stay locked until the short path (or knobs) unlocks.
	// Finetune keeps the full desk from the start.
	$: workbenchUnlocked =
		$course === 'finetune' ||
		($course === 'text' && $textPathDone) ||
		($course === 'image' && $imageKnobsUnlocked) ||
		($course === 'music' && $musicKnobsUnlocked);
	$: showLauncher = true;
	// Keep this door visible but quieter until the invite / research station,
	// so it does not win the first click or fight the current 「现在做这件事」.
	// Fine-tune stays quiet on 存基线 and the earlier / main-line stops;
	// method / explore are the later invitations.
	$: pathCoachPack =
		$course === 'image'
			? (m as any).imageCoach
			: $course === 'music'
				? (m as any).musicCoach
				: $course === 'finetune'
					? (m as any).finetuneCoach
					: m.coach;
	$: pathLessons = pathCoachPack?.lessons ?? (m.coach as any)?.lessons ?? [];
	$: pathLessonId =
		$course === 'text'
			? textPathIdAt($coachLessonIdx)
			: (pathLessons[
					Math.min(Math.max($coachLessonIdx, 0), Math.max(pathLessons.length - 1, 0))
				]?.id ?? '');
	$: invitedDoor = $researchDoorOpen || pathLessonId === 'invite';
	$: quietDoor =
		(($course === 'text' || $course === 'image' || $course === 'music') && !invitedDoor) ||
		($course === 'finetune' && !invitedDoor && $finetuneSpineView !== 'explore' && $finetuneSpineView !== 'method');
</script>

{#if showLauncher && !$workbenchOpen}
<button
	type="button"
	class="wb-launcher"
	class:open={$workbenchOpen}
	class:quiet-door={quietDoor}
	class:yield-tokens={yieldTokens}
	data-te-wb="open"
	data-te-wb-door={quietDoor ? 'quiet' : 'ready'}
	data-te-wb-yield={yieldTokens ? 'tokens' : 'none'}
	bind:this={launcherEl}
	style={yieldTokens && yieldLeft ? `left: ${yieldLeft}` : undefined}
	on:click={() => workbenchOpen.update((v) => !v)}
>
	{wb.open}
</button>
{/if}

{#if $workbenchOpen}
	<div
		class="wb-panel"
		role="dialog"
		aria-label={wb.title}
		data-te-wb="panel"
		data-te-wb-course={$course}
		data-te-wb-lab-done={labDone}
		data-te-spaced-available={spacedAvailable ? '1' : '0'}
		style={`--wb-coach-reserve: ${wbCoachReserve}`}
	>
		<header class="wb-head" data-te-wb="head">
			<h2 data-te-wb="title">{wb.title}</h2>
			<button type="button" class="icon-btn" data-te-wb="close" on:click={() => workbenchOpen.set(false)}>{wb.close}</button>
		</header>
		{#if !workbenchUnlocked}
			<div class="wb-body" data-te-wb="body">
				<p class="lead" data-te-wb="locked" data-te-wb-lead="1">
					{wb.lockedLead ||
						(zh
							? '先走完底部教练这条短路，再在这里做必做实验、查术语和自测。现在先锁着，避免跳过眼前这一步。'
							: 'Finish the short coach path first. Labs, glossary, and the quiz stay locked so you do not skip the step in front of you.')}
				</p>
			</div>
		{:else}
		<nav class="wb-tabs" data-te-wb="tabs">
			<button type="button" class:on={$workbenchTab === 'path'} data-te-wb="tab-path" on:click={() => openTab('path')}>{wb.tabPath}</button>
			<button type="button" class:on={$workbenchTab === 'labs'} data-te-wb="tab-labs" on:click={() => openTab('labs')}>{wb.tabLabs}</button>
			<button type="button" class:on={$workbenchTab === 'glossary'} data-te-wb="tab-glossary" on:click={() => openTab('glossary')}
				>{wb.tabGlossary}</button
			>
			<button type="button" class:on={$workbenchTab === 'quiz'} data-te-wb="tab-quiz" on:click={() => openTab('quiz')}>{wb.tabQuiz}</button>
			{#if spacedAvailable}
				<button
					type="button"
					class:on={$workbenchTab === 'spaced'}
					data-te-wb="tab-spaced"
					data-te-spaced="tab"
					on:click={() => openTab('spaced')}>{st.tab}</button
				>
			{/if}
		</nav>

		<div class="wb-body" data-te-wb="body">
			{#if $workbenchTab === 'path'}
				<p class="lead" data-te-wb="lead">{wb.pathLead}</p>
				<p class="path-narrator" data-te-wb="path-narrator">{wb.pathNarrator || (zh ? '底部教练还是你的主进度。下面这些是可选门口，不是另一张总图。' : 'The coach bar is still your main progress. The doors below are optional, not a second master map.')}</p>
				<div class="path-tools" data-te-wb="path-tools">
					<button type="button" class="ghost" data-te-wb="path-coach" on:click={$course === 'finetune' ? backToSpine : openCoach}>{wb.path1Btn}</button>
					<button type="button" class="ghost" data-te-wb="path-book" on:click={() => openTextbook()}>{wb.path2Btn}</button>
					<button type="button" class="ghost" data-te-wb="path-labs" on:click={() => openTab('labs')}>{wb.path3Btn}</button>
				</div>
				{#if isResearchUnlocked($course) && $course !== 'finetune'}
					<div class="optional-research" data-te-wb="path-research">
						<h3>{wb.path4Title || (zh ? '走向研究' : 'Toward research')}<span class="opt">{zh ? '选做' : 'Optional'}</span></h3>
						<p>{wb.path4Body || (zh ? '短路走完后，这里有本课已有的实验室清单。点一项就能走进去，不是另开的工业平台，也不会自动打开书库。' : 'After the short path, a list of labs already in this course is waiting. Open one to walk in. This is not a separate industrial platform, and it does not auto-open the Library.')}</p>
						<button type="button" class="ghost" data-te-wb="research-door" on:click={enterResearch}>{wb.path4Btn || (zh ? '走进研究门口' : 'Enter the research door')}</button>
					</div>
				{/if}
				{#if spacedAvailable}
					<div class="spaced-door" data-te-wb="path-spaced" data-te-spaced="door">
						<h3>{st.pathTitle}</h3>
						<p>{st.pathBody}</p>
						<button type="button" class="primary" data-te-spaced="open" on:click={openSpaced}>{st.pathBtn}</button>
					</div>
				{/if}
			{:else if $workbenchTab === 'labs'}
				<div class="labs-head" data-te-wb="labs-head">
					<p class="progress" data-te-wb="labs-progress">{wb.labsProgress.replace('{done}', String(labDone)).replace('{total}', String(LAB_IDS.length))}</p>
					{#each LAB_IDS.filter((id) => isLabObserved(id)).slice(0, 2) as id}
						{@const verify = LAB_VERIFY[id]}
						{#if verify?.kind === 'signal'}
							<p class="seen" data-te-lab-seen={id} data-te-wb="labs-seen-now">{zh ? verify.seenZh : verify.seenEn}</p>
						{:else if verify?.kind === 'manual'}
							<p class="seen" data-te-lab-seen={id} data-te-wb="labs-seen-now">{zh ? '已经自己标明这一项。' : 'You marked this one yourself.'}</p>
						{/if}
					{/each}
					<p class="lead" data-te-wb="lead">{wb.labsLead}</p>
				</div>
				<ul class="labs">
					{#each LAB_IDS as id}
						{@const verify = LAB_VERIFY[id]}
						{@const observed = isLabObserved(id)}
						<li class:done={observed} data-te-wb-lab={id} data-te-lab-state={observed ? 'seen' : verify?.kind === 'manual' ? 'manual' : 'wait'}>
							<h3>{wb[`${id}Title`]}</h3>
							{#if verify?.kind === 'signal' && observed}
								<p class="seen" data-te-lab-seen={id}>{zh ? verify.seenZh : verify.seenEn}</p>
							{:else if verify?.kind === 'signal'}
								<p class="pending" data-te-lab-wait={id}>{wb.labPending || (zh ? '请先真正做出这个现象。我不会替你点「推进一步」，也不会自动开训。做完后这里会自己亮起来。' : 'First produce the phenomenon yourself. This will not click 推进一步 or start a run. When it happens, this item lights up.')}</p>
							{:else}
								<p class="manual" data-te-lab-manual={id}>{zh ? verify?.reasonZh : verify?.reasonEn}</p>
							{/if}
							<p>{wb[`${id}How`]}</p>
							<p>{wb[`${id}See`]}</p>
							<div class="row">
								{#if LAB_SELECTORS[id]}
									<button type="button" class="primary" data-te-lab-look={id} on:click={() => flash(LAB_SELECTORS[id])}>{wb.labLook}</button>
								{/if}
								{#if verify?.kind === 'manual'}
									<button type="button" class="ghost" data-te-lab-self={id} on:click={() => toggleLab(id)}
										>{checks[id] ? (wb.labSelfUndo || wb.labUndo) : (wb.labSelfTalk || (zh ? '我自己看过了 / 讲过了' : 'I looked or said it myself'))}</button
									>
								{:else if observed}
									<button type="button" class="ghost" data-te-lab-clear={id} on:click={() => verify?.kind === 'signal' && clearLabSignal(verify.signal)}>{wb.labClearSeen || (zh ? '清除这一次看见' : 'Clear this sighting')}</button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else if $workbenchTab === 'glossary'}
				<p class="lead" data-te-wb="lead">{wb.glossaryLead}</p>
				<p class="role" data-te-wb="glossary-role">
					{wb.glossaryRole ||
						(zh
							? '术语表只说明这个词在界面上在哪里，不是第二本教材。完整课文在顶栏「书库」。'
							: 'This glossary is a short “where is this word on the screen” lookup, not a second textbook. The full chapters live in Library in the top bar.')}
				</p>
				<dl class="glossary">
					{#each GLOSS_IDS as id}
						<div class="term">
							<dt>{gloss[id].term}</dt>
							<dd>
								<p>{gloss[id].def}</p>
								<p class="where"><strong>{wb.glossaryWhere}：</strong>{gloss[id].where}</p>
								<button type="button" class="ghost" on:click={() => flash(GLOSS_SEL[id])}>{wb.glossaryWhere}</button>
							</dd>
						</div>
					{/each}
				</dl>
			{:else if $workbenchTab === 'quiz'}
				<p class="lead" data-te-wb="lead">{wb.quizLead}</p>
				{#each QUIZ_GROUPS as group}
					<section class="quiz-group" class:transfer={group.id === 'transfer'} data-te-wb-quiz-group={group.id}>
						<h3>{groupTitle(group)}</h3>
						{#each QUIZ.filter((q) => q.group === group.id) as item}
							<div class="q">
								<p class="qtext">{wb[item.q]}</p>
								<button
									type="button"
									class="choice"
									class:picked={quizChoice[item.q] === 0}
									class:right={quizChoice[item.q] != null && item.ok === 0}
									class:wrong={quizChoice[item.q] === 0 && item.ok !== 0}
									disabled={quizChoice[item.q] != null}
									on:click={() => choose(item.q, 0)}>{wb[item.a]}</button
								>
								<button
									type="button"
									class="choice"
									class:picked={quizChoice[item.q] === 1}
									class:right={quizChoice[item.q] != null && item.ok === 1}
									class:wrong={quizChoice[item.q] === 1 && item.ok !== 1}
									disabled={quizChoice[item.q] != null}
									on:click={() => choose(item.q, 1)}>{wb[item.b]}</button
								>
								{#if quizChoice[item.q] != null}
									<p class="why">
										<strong>{quizChoice[item.q] === item.ok ? wb.quizCorrect : wb.quizWrong}</strong>
										{wb[item.why]}
									</p>
									<div class="row">
										<button type="button" class="ghost" data-te-quiz-again={item.q} on:click={() => resetQuestion(item.q)}>{wb.quizAgain}</button>
										<button type="button" class="ghost" data-te-quiz-page={item.pageId} on:click={() => openTextbook(item.pageId)}
											>{wb.quizOpenPage}</button
										>
										{#if item.stationId}
											<button type="button" class="ghost" data-te-quiz-station={item.stationId} on:click={() => openStation(item.stationId)}
												>{wb.quizOpenStation || (zh ? '回到短路这一站' : 'Return to this short-path station')}</button
											>
										{/if}
									</div>
									{#if quizChoice[item.q] !== item.ok}
										<p class="hint" data-te-quiz-pointer={item.q}>{wb.quizAfterWrong || (zh ? '没有分数。可以先打开教材这一页或回到那一站，看完再做一遍。' : 'There is no score. Open the textbook page or return to the station, then try again.')}</p>
									{/if}
								{/if}
							</div>
						{/each}
					</section>
				{/each}
			{:else if $workbenchTab === 'spaced' && spacedAvailable}
				<p class="lead" data-te-wb="lead" data-te-spaced="lead">{st.lead}</p>
				<section class="quiz-group transfer" data-te-wb-quiz-group="spaced" data-te-spaced="panel">
					<h3>{st.pathTitle}</h3>
					{#each spacedItems as item}
						{@const qKey = `spaced:${item.id}`}
						<div class="q" data-te-spaced-q={item.id}>
							<p class="qtext">{st[item.qKey]}</p>
							<button
								type="button"
								class="choice"
								class:picked={quizChoice[qKey] === 0}
								class:right={quizChoice[qKey] != null && item.ok === 0}
								class:wrong={quizChoice[qKey] === 0 && item.ok !== 0}
								disabled={quizChoice[qKey] != null}
								data-te-spaced-choice="0"
								on:click={() => choose(qKey, 0)}>{st[item.aKey]}</button
							>
							<button
								type="button"
								class="choice"
								class:picked={quizChoice[qKey] === 1}
								class:right={quizChoice[qKey] != null && item.ok === 1}
								class:wrong={quizChoice[qKey] === 1 && item.ok !== 1}
								disabled={quizChoice[qKey] != null}
								data-te-spaced-choice="1"
								on:click={() => choose(qKey, 1)}>{st[item.bKey]}</button
							>
							{#if quizChoice[qKey] != null}
								<p class="why">
									<strong>{quizChoice[qKey] === item.ok ? (st.correct || wb.quizCorrect) : (st.wrong || wb.quizWrong)}</strong>
									{st[item.whyKey]}
								</p>
								<div class="row">
									<button type="button" class="ghost" data-te-quiz-again={qKey} on:click={() => resetQuestion(qKey)}
										>{st.again || wb.quizAgain}</button
									>
									<button
										type="button"
										class="ghost"
										data-te-quiz-page={item.pointer.pageId}
										on:click={() => openTextbook(item.pointer.pageId)}>{st.openPage || wb.quizOpenPage}</button
									>
									{#if item.pointer.stationId}
										<button
											type="button"
											class="ghost"
											data-te-quiz-station={item.pointer.stationId}
											on:click={() => openStation(item.pointer.stationId)}
											>{st.openStation || wb.quizOpenStation || (zh ? '回到短路这一站' : 'Return to this short-path station')}</button
										>
									{/if}
								</div>
								{#if quizChoice[qKey] !== item.ok}
									<p class="hint" data-te-quiz-pointer={qKey} data-te-spaced-pointer={item.id}
										>{st.afterWrong || wb.quizAfterWrong || (zh ? '没有分数。可以先打开教材这一页或回到那一站，看完再做一遍。' : 'There is no score. Open the textbook page or return to the station, then try again.')}</p
									>
								{/if}
							{/if}
						</div>
					{/each}
				</section>
			{/if}
		</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	.wb-launcher {
		position: fixed;
		left: 1.5rem;
		bottom: max(1rem, calc(var(--te-coach-h, 0px) + 0.5rem));
		z-index: 10003;
		background: #6d28d9;
		color: white;
		border: none;
		border-radius: 999px;
		padding: 0.55rem 0.95rem;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.9rem;
		box-shadow: 0 8px 20px rgba(109, 40, 217, 0.35);
	}
	.wb-launcher.open {
		background: #4c1d95;
	}
	.wb-launcher.quiet-door {
		background: #fff;
		color: #5b21b6;
		border: 1px solid #ddd6fe;
		box-shadow: 0 4px 12px rgba(76, 29, 149, 0.1);
		font-weight: 600;
	}
	/* When the token column is tall, shrink this quiet entrance and slide
	   it to the right of the chips so 残 / 差 / 连 / 换 stay readable.
	   Stay a quiet chip — do not become a second solid door. */
	.wb-launcher.yield-tokens {
		padding: 0.28rem 0.58rem;
		font-size: 0.75rem;
		box-shadow: 0 2px 8px rgba(76, 29, 149, 0.08);
	}
	.wb-launcher.quiet-door.yield-tokens {
		background: #fff;
		color: #5b21b6;
		border: 1px solid #ddd6fe;
		font-weight: 600;
	}
	.wb-panel {
		/* Reserve only the coach bar (not the whole guide slot / math dock)
		   so progress and one seen card can share the panel on 1280x720. */
		--wb-bottom: max(3.6rem, var(--wb-coach-reserve, calc(var(--te-coach-h, 0px) + 0.5rem)));
		/* Overlay may cover the main stage / a tall header (LoRA bar, knobs).
		   Reserve the slim nav plus an honest gap so the panel is not flush
		   against the chrome. Do not subtract the full --te-topbar-h, which
		   can eat the whole viewport. */
		--wb-top-gap: calc(var(--te-topbar-chrome-h, 3.5rem) + 0.5rem);
		position: fixed;
		left: 1.5rem;
		bottom: var(--wb-bottom);
		z-index: 10003;
		width: min(400px, calc(100vw - 3.5rem));
		height: calc(100vh - var(--wb-bottom) - var(--wb-top-gap));
		max-height: calc(100vh - var(--wb-bottom) - var(--wb-top-gap));
		display: flex;
		flex-direction: column;
		background: rgba(255, 255, 255, 0.98);
		border: 1px solid #ddd6fe;
		border-radius: 0.85rem;
		box-shadow: 0 16px 40px rgba(76, 29, 149, 0.2);
		overflow: hidden;
	}
	.wb-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.7rem 0.9rem;
		background: linear-gradient(90deg, #6d28d9, #7c3aed);
		color: white;
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 2;
	}
	.wb-head h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}
	.icon-btn {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.55);
		color: white;
		border-radius: 0.4rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.wb-tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid #ede9fe;
		background: #f5f3ff;
		flex-shrink: 0;
	}
	.wb-tabs button {
		flex: 1;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.45rem 0.2rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: #6b7280;
	}
	.wb-tabs button.on {
		color: #5b21b6;
		font-weight: 700;
		border-bottom-color: #7c3aed;
		background: white;
	}
	.wb-body {
		padding: 0.85rem 0.95rem 1rem;
		overflow-y: auto;
		font-size: 0.9rem;
		line-height: 1.55;
		color: #374151;
		flex: 1 1 auto;
		min-height: 0;
	}
	.role {
		margin: 0 0 0.7rem;
		font-size: 0.8rem;
		line-height: 1.45;
		color: #6b7280;
	}
	.lead {
		margin: 0 0 0.75rem;
		color: #4b5563;
	}
	.progress {
		margin: 0 0 0.6rem;
		color: #6d28d9;
		font-weight: 600;
	}
	.labs-head {
		position: sticky;
		top: -0.85rem;
		z-index: 1;
		background: rgba(255, 255, 255, 0.98);
		padding: 0.1rem 0 0.45rem;
		margin: 0 0 0.35rem;
	}
	.labs-head .progress {
		margin: 0 0 0.3rem;
	}
	.labs-head .lead {
		margin: 0.3rem 0 0;
		font-size: 0.82rem;
		line-height: 1.45;
	}
	.labs-head .seen {
		margin: 0.25rem 0 0;
	}
	.spaced-door {
		margin: 0.2rem 0 0.4rem;
		padding: 0.65rem 0.6rem 0.75rem;
		border: 1px dashed #ddd6fe;
		border-radius: 0.55rem;
		background: #faf8ff;
	}
	.spaced-door h3 {
		margin: 0 0 0.3rem;
		color: #5b21b6;
	}
	.spaced-door p {
		margin: 0 0 0.5rem;
	}
	.path-narrator {
		margin: 0 0 0.65rem;
		font-size: 0.84rem;
		color: #4b5563;
		line-height: 1.45;
	}
	.path-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0 0 0.75rem;
	}
	.optional-research {
		margin: 0.15rem 0 0.5rem;
		padding: 0.55rem 0.55rem 0.65rem;
		border: 1px dashed #ddd6fe;
		border-radius: 0.55rem;
		background: #faf8ff;
	}
	.optional-research h3 {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0 0 0.3rem;
		color: #5b21b6;
		font-size: 0.88rem;
	}
	.optional-research .opt {
		font-size: 0.68rem;
		font-weight: 700;
		color: #7c3aed;
		border: 1px dashed #c4b5fd;
		border-radius: 999px;
		padding: 0.02rem 0.35rem;
	}
	.optional-research p {
		margin: 0 0 0.45rem;
		font-size: 0.82rem;
		color: #4b5563;
	}
	.path,
	.labs,
	.glossary {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.path {
		list-style: decimal;
		padding-left: 1.2rem;
	}
	.path li,
	.labs li,
	.term,
	.q {
		margin-bottom: 0.85rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #f3f4f6;
	}
	h3 {
		margin: 0 0 0.3rem;
		font-size: 0.95rem;
		color: #1f2937;
	}
	p {
		margin: 0.25rem 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.45rem;
	}
	.primary,
	.ghost,
	.choice {
		border-radius: 0.4rem;
		padding: 0.3rem 0.65rem;
		cursor: pointer;
		font-size: 0.82rem;
	}
	.primary {
		background: #7c3aed;
		color: white;
		border: none;
		font-weight: 600;
	}
	.ghost {
		background: white;
		border: 1px solid #e5e7eb;
		color: #4b5563;
	}
	.labs li.done {
		background: #f5f3ff;
		border-radius: 0.5rem;
		padding: 0.6rem 0.55rem 0.75rem;
		border-bottom: none;
	}
	.term dt {
		font-weight: 700;
		color: #5b21b6;
		margin-bottom: 0.2rem;
	}
	.term dd {
		margin: 0;
	}
	.where {
		color: #6b7280;
		font-size: 0.85rem;
	}
	.quiz-group {
		margin-bottom: 0.6rem;
	}
	.qtext {
		font-weight: 600;
		color: #1f2937;
	}
	.choice {
		display: block;
		width: 100%;
		text-align: left;
		margin: 0.3rem 0;
		background: #fafafa;
		border: 1px solid #e5e7eb;
		color: #111827;
	}
	.choice:disabled {
		cursor: default;
	}
	.choice.right {
		border-color: #059669;
		background: #ecfdf5;
	}
	.choice.wrong {
		border-color: #dc2626;
		background: #fef2f2;
	}
	.why {
		margin-top: 0.4rem;
		background: #f5f3ff;
		border-radius: 0.4rem;
		padding: 0.45rem 0.55rem;
	}
	.seen,
	.pending,
	.manual,
	.hint {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		line-height: 1.45;
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
	}
	.seen {
		background: #ecfdf5;
		color: #065f46;
	}
	.pending,
	.hint {
		background: #fff7ed;
		color: #9a3412;
	}
	.manual {
		background: #f3f4f6;
		color: #4b5563;
	}
	.quiz-group.transfer h3 {
		color: #5b21b6;
	}
	:global(.te-lab-flash) {
		outline: 3px solid #7c3aed !important;
		outline-offset: 3px;
		box-shadow: 0 0 0 6px rgba(124, 58, 237, 0.25) !important;
		transition: outline 0.2s ease, box-shadow 0.2s ease;
	}
</style>
