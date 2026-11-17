<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { locale, messages, coachLessonIdx, coachVisible } from '~/i18n';
	import { course, switchCourse } from '~/store/course';
	import { enterTextPathStep } from '~/courses/textPath';
	import { finetuneSpineView, setSpineView, type SpineId } from '~/courses/finetune/store';
	import { LEARNING_STAGES } from '~/tutor/pathMap';
	import { tutorMapOpen, openTutorMap } from '~/tutor/store';
	import { openResearchDoor, researchDoorOpen, isResearchUnlocked, closeResearchDoor } from '~/courses/researchDoor';
	import { textPathDone, imageKnobsUnlocked, musicKnobsUnlocked } from '~/store/beginnerPath';

	$: m = ($messages as any).tutor || {};
	$: zh = $locale !== 'en';
	$: stage = LEARNING_STAGES.find((s) => s.id === $course) ?? LEARNING_STAGES[0];
	const ftSpineToStation: Record<SpineId, string> = {
		see: 'map',
		preview: 'pack',
		baseline: 'baseline',
		train: 'start',
		watching: 'start',
		compare: 'compare',
		loss: 'loss',
		method: 'method',
		explore: 'explore'
	};
	$: stationId = (() => {
		if ($course !== 'finetune' && $researchDoorOpen) return 'explore';
		if ($course === 'finetune') {
			return (
				ftSpineToStation[$finetuneSpineView] ||
				stage.stations[Math.min(Math.max($coachLessonIdx, 0), stage.stations.length - 1)]?.id
			);
		}
		const stations = stage.stations.filter((s) => s.id !== 'explore');
		return stations[Math.min(Math.max($coachLessonIdx, 0), stations.length - 1)]?.id;
	})();
	$: station = stage.stations.find((s) => s.id === stationId) || stage.stations[0];
	const isOptionalStation = (courseId: typeof $course, id: string) =>
		(courseId === 'finetune' && (id === 'method' || id === 'explore')) ||
		(courseId !== 'finetune' && (id === 'explore' || id === 'invite'));

	// Optional research / lab doors stay off the compact “you are here”
	// list so a first step does not already look like many unwalked roads.
	const isDeferredStation = (courseId: typeof $course, id: string) => isOptionalStation(courseId, id);

	let fullMapOpen = false;
	$: if (!$tutorMapOpen) fullMapOpen = false;
	$: visibleStages = fullMapOpen ? LEARNING_STAGES : LEARNING_STAGES.filter((s) => s.id === $course);
	const stationsFor = (s: (typeof LEARNING_STAGES)[number]) =>
		fullMapOpen ? s.stations : s.stations.filter((st) => !isDeferredStation(s.id, st.id));
	$: shortPathDone =
		($course === 'text' && $textPathDone) ||
		($course === 'image' && $imageKnobsUnlocked) ||
		($course === 'music' && $musicKnobsUnlocked) ||
		($course === 'finetune' && ($finetuneSpineView === 'compare' || $finetuneSpineView === 'loss' || $finetuneSpineView === 'method' || $finetuneSpineView === 'explore'));
	$: showQuietResearch =
		!fullMapOpen && shortPathDone && $course !== 'finetune' && isResearchUnlocked($course);

	let rootEl: HTMLElement;

	const goStage = (id: typeof $course) => {
		if (id !== $course) switchCourse(id);
	};

	const goStation = (courseId: typeof $course, id: string, index: number) => {
		if (id === 'explore' && courseId !== 'finetune') {
			if (courseId !== $course) switchCourse(courseId);
			coachVisible.set(true);
			if (isResearchUnlocked(courseId)) openResearchDoor(courseId);
			tutorMapOpen.set(false);
			return;
		}
		if (courseId !== $course) switchCourse(courseId);
		if (courseId !== 'finetune') closeResearchDoor();
		coachLessonIdx.set(index);
		coachVisible.set(true);
		if (courseId === 'text') enterTextPathStep(index);
		if (courseId === 'finetune') {
			const map: Record<string, 'see' | 'preview' | 'baseline' | 'train' | 'compare' | 'loss' | 'method' | 'explore'> = {
				map: 'see',
				pack: 'preview',
				baseline: 'baseline',
				start: 'train',
				compare: 'compare',
				loss: 'loss',
				method: 'method',
				explore: 'explore'
			};
			if (map[id]) setSpineView(map[id]);
		}
		tutorMapOpen.set(false);
	};

	const closeMap = () => tutorMapOpen.set(false);

	const rectsOverlap = (a: DOMRect, b: DOMRect) =>
		a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

	const placeMapPanel = async () => {
		if (!$tutorMapOpen) return;
		await tick();
		const panel = document.querySelector('[data-te-tutor="map-panel"]') as HTMLElement | null;
		if (!panel) return;
		const header = document.querySelector('#landing header') as HTMLElement | null;
		const headerBottom = header ? header.getBoundingClientRect().bottom : 80;
		const top = Math.round(headerBottom + 6);
		const maxH = Math.max(
			120,
			Math.floor(
				window.innerHeight -
					top -
					(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--te-guide-h')) || 0) -
					12
			)
		);
		panel.style.position = 'fixed';
		panel.style.top = `${top}px`;
		panel.style.maxHeight = `${maxH}px`;
		panel.style.zIndex = '10040';
		// Prefer the right side so the panel stays away from left-stage tokens.
		panel.style.left = 'auto';
		panel.style.right = '1rem';
		panel.dataset.teMapSide = 'right';
		const pr = panel.getBoundingClientRect();
		const tokens = Array.from(
			document.querySelectorAll('[data-te-tok-label], .embedding .column')
		) as HTMLElement[];
		const hitsLeft = tokens.some((el) => {
			const r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && rectsOverlap(pr, r);
		});
		if (hitsLeft) {
			// Already right-aligned; if it still collides, nudge further right / shrink width.
			panel.style.width = `${Math.min(pr.width, Math.max(220, window.innerWidth * 0.32))}px`;
			panel.style.right = '0.5rem';
			panel.dataset.teMapSide = 'right-flip';
		}
	};

	$: if ($tutorMapOpen) void placeMapPanel();

	onMount(() => {
		const onDoc = (e: MouseEvent) => {
			if (!$tutorMapOpen) return;
			const t = e.target as Node | null;
			if (rootEl && t && rootEl.contains(t)) return;
			tutorMapOpen.set(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && $tutorMapOpen) tutorMapOpen.set(false);
		};
		document.addEventListener('mousedown', onDoc);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="wrap" class:open={$tutorMapOpen} bind:this={rootEl}>
	<button type="button" class="launcher" data-te-tutor="map" aria-expanded={$tutorMapOpen} on:click={openTutorMap}>
		<span class="kicker">{m.youAreHere || (zh ? '你在哪' : 'You are here')}</span>
		<span class="now">{zh ? stage.titleZh : stage.titleEn} · {zh ? station.titleZh : station.titleEn}</span>
	</button>
	{#if $tutorMapOpen}
		<nav class="map" data-te-tutor="map-panel" data-te-map-mode={fullMapOpen ? 'full' : 'here'} transition:fade={{ duration: 180 }} aria-label={m.mapLabel || (zh ? '零基础学习地图' : 'Beginner learning map')}>
			<div class="map-head">
				<p class="lead">{fullMapOpen ? (m.mapLead || (zh ? '四段主路，点一下就能回到当前该看的地方。不会自动替你点「推进一步」。' : 'Four stages on the main path. Click to return to the station you should be looking at. This never auto-clicks 推进一步.')) : (m.mapLeadShort || (zh ? '你现在就在本课这一站。完整地图要看的时候再展开，研究门口是选做。' : 'You are at this station in this course. Open the full map only when you want it. The research door is optional.'))}</p>
				<button type="button" class="map-close" data-te-tutor="map-close" on:click={closeMap}>{zh ? '关闭' : 'Close'}</button>
			</div>
			{#each visibleStages as s}
				<section class="stage" class:current={s.id === $course} data-te-tutor-stage={s.id}>
					<button type="button" class="stage-btn" on:click={() => goStage(s.id)}>
						<strong>{zh ? s.titleZh : s.titleEn}</strong>
						<span>{zh ? s.blurbZh : s.blurbEn}</span>
					</button>
					<ul>
						{#each stationsFor(s) as st}
							{@const i = s.stations.findIndex((x) => x.id === st.id)}
							<li>
								<button
									type="button"
									class:here={s.id === $course && st.id === stationId}
									class:optional={isOptionalStation(s.id, st.id)}
									data-te-tutor-station={st.id}
									on:click={() => goStation(s.id, st.id, i)}
									>{zh ? st.titleZh : st.titleEn}{#if isOptionalStation(s.id, st.id)}<span class="opt">{zh ? '选做' : 'Optional'}</span>{/if}</button
								>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
			{#if showQuietResearch}
				<div class="quiet-research" data-te-map="research-door">
					<p>{m.mapOptionalResearch || (zh ? '走向研究是选做门口，不是你现在的站点。' : 'Toward research is an optional door, not your current station.')}</p>
					<button type="button" class="quiet-door" data-te-path="map-research" on:click={() => { if (isResearchUnlocked($course)) { openResearchDoor($course === 'finetune' ? undefined : $course); tutorMapOpen.set(false); } }}>{zh ? '走进研究门口（选做）' : 'Enter the research door (optional)'}</button>
				</div>
			{/if}
			<button type="button" class="map-toggle" data-te-map="toggle-full" on:click={() => (fullMapOpen = !fullMapOpen)}>
				{fullMapOpen
					? m.hideFullMap || (zh ? '只看当前这一课' : 'Show only this course')
					: m.showFullMap || (zh ? '看完整地图' : 'Show the full map')}
			</button>
		</nav>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		left: auto;
		top: auto;
		z-index: 20;
		width: auto;
		max-width: 100%;
		pointer-events: none;
	}
	.wrap > :global(*) {
		pointer-events: auto;
	}
	.launcher {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		background: rgba(255, 255, 255, 0.95);
		border: 1px solid #ddd6fe;
		border-radius: 999px;
		padding: 0.25rem 0.7rem;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(76, 29, 149, 0.1);
		text-align: left;
		max-width: 100%;
	}
	.kicker {
		font-size: 0.7rem;
		font-weight: 800;
		color: #6d28d9;
		letter-spacing: 0.04em;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.now {
		font-size: 0.75rem;
		color: #1f2937;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: min(28rem, calc(100vw - 10rem));
	}
	.map {
		position: fixed;
		left: auto;
		right: 1rem;
		top: calc(var(--te-topbar-h, 6.2rem) + 0.35rem);
		margin-top: 0;
		background: rgba(255, 255, 255, 0.98);
		border: 1px solid #ddd6fe;
		border-radius: 0.7rem;
		padding: 0.55rem 0.6rem 0.65rem;
		box-shadow: 0 10px 28px rgba(76, 29, 149, 0.16);
		max-height: min(60vh, calc(100vh - var(--te-topbar-h, 6.2rem) - var(--te-guide-h, 0px) - 1rem));
		overflow: auto;
		width: min(20rem, calc(100vw - 2rem));
		z-index: 10040;
	}
	.map-head {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
	}
	.map-close {
		flex-shrink: 0;
		background: transparent;
		border: none;
		color: #6b7280;
		font-size: 0.75rem;
		cursor: pointer;
		padding: 0.1rem 0.25rem;
	}
	.map-close:hover {
		color: #4c1d95;
	}
	.lead {
		margin: 0 0 0.45rem;
		font-size: 0.76rem;
		color: #4b5563;
		line-height: 1.4;
		flex: 1 1 auto;
	}
	.stage {
		margin: 0.35rem 0;
		padding: 0.3rem 0.3rem 0.15rem;
		border-radius: 0.45rem;
	}
	.stage.current {
		background: #f5f3ff;
	}
	.stage-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.05rem;
		width: 100%;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		padding: 0.15rem 0.2rem;
	}
	.stage-btn strong {
		font-size: 0.84rem;
		color: #4c1d95;
	}
	.stage-btn span {
		font-size: 0.72rem;
		color: #6b7280;
	}
	ul {
		list-style: none;
		margin: 0.2rem 0 0.15rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	button.here {
		background: #7c3aed;
		color: #fff;
		border-color: #7c3aed;
	}
	ul button {
		border: 1px solid #e5e7eb;
		background: #fff;
		color: #374151;
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
		font-size: 0.72rem;
		cursor: pointer;
	}
	ul button.optional {
		border-style: dashed;
	}
	ul button .opt {
		margin-left: 0.25rem;
		font-size: 0.64rem;
		font-weight: 700;
		color: #7c3aed;
	}
	ul button.here .opt {
		color: #ede9fe;
	}
	.map-toggle {
		display: block;
		width: 100%;
		margin-top: 0.35rem;
		background: transparent;
		border: 1px dashed #ddd6fe;
		color: #6d28d9;
		border-radius: 0.45rem;
		padding: 0.28rem 0.4rem;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}
	.map-toggle:hover {
		background: #f5f3ff;
	}
	.quiet-research {
		margin: 0.35rem 0 0.15rem;
		padding: 0.4rem 0.35rem 0.45rem;
		border: 1px dashed #ddd6fe;
		border-radius: 0.45rem;
		background: #faf8ff;
	}
	.quiet-research p {
		margin: 0 0 0.3rem;
		font-size: 0.72rem;
		color: #6b7280;
		line-height: 1.4;
	}
	.quiet-door {
		border: 1px dashed #c4b5fd;
		background: #fff;
		color: #5b21b6;
		border-radius: 999px;
		padding: 0.12rem 0.5rem;
		font-size: 0.72rem;
		cursor: pointer;
	}
</style>
