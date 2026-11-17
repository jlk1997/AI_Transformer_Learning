<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { locale, messages } from '~/i18n';
	import { course } from '~/store/course';
	import { openTutorPanel, tutorPanelOpen } from '~/tutor/store';
	import { loadTutorSettings } from '~/tutor/api';

	$: m = ($messages as any).tutor || {};
	$: zh = $locale !== 'en';

	type Spot = { sel: string; labelZh: string; labelEn: string; region: string };
	const SPOTS: Record<string, Spot[]> = {
		text: [
			{ sel: '[data-te-zone="left"]', labelZh: '已经有的词', labelEn: 'the words so far', region: 'left' },
			{ sel: '[data-te-zone="mid"]', labelZh: '正在计算', labelEn: 'the computation in the middle', region: 'mid' },
			{ sel: '[data-te-zone="right"]', labelZh: '右边的下一个词表', labelEn: 'the next-word table on the right', region: 'right' },
			{ sel: '[data-click="generate-btn"]', labelZh: '生成下一个词', labelEn: 'the generate button', region: 'generate' },
			{ sel: '.softmax .content, [data-click="prob-step"]', labelZh: '右边的概率表', labelEn: 'the probability table', region: 'right-table' },
			{ sel: '[data-click="residual-start"], .residual', labelZh: '残差旁路', labelEn: 'the residual bypass', region: 'residual' },
			{ sel: '.column.token-string, .embedding .label', labelZh: '词片', labelEn: 'the token chips', region: 'tokens' }
		],
		finetune: [
			{ sel: '[data-te-ft="loss"], [data-te-math="loss-walk"], .ft-loss-path', labelZh: '损失示意', labelEn: 'the loss schematic', region: 'loss' },
			{ sel: '.ft-first-line, [data-te-ft="first-line"]', labelZh: '微调课的开头说明', labelEn: 'the opening line of the fine-tune course', region: 'map' },
			{ sel: '.ft-tokenize', labelZh: '分词预览', labelEn: 'the token preview', region: 'pack' }
		],
		image: [
			{ sel: '[data-te-image="canvas"], .image-studio canvas', labelZh: '去噪画布', labelEn: 'the denoise canvas', region: 'canvas' },
			{ sel: '[data-te-image="cfg"], .cfg-compare', labelZh: '对照图', labelEn: 'the comparison pictures', region: 'cfg' }
		],
		music: [
			{ sel: '.music-probs, .note-list', labelZh: '下一个音的概率', labelEn: 'the next-note probabilities', region: 'right' }
		]
	};

	type Pin = { top: number; left: number; spot: Spot };
	let pins: Pin[] = [];
	let askThis: { top: number; left: number; text: string; label: string; selector?: string } | null = null;
	let ro: ResizeObserver | null = null;
	let mo: MutationObserver | null = null;
	let timer: number | undefined;
	let hoverKey = '';
	let focusKey = '';
	let hideTimer: number | undefined;
	// After the student uses 「问这个」, keep spots briefly findable.
	let intentMode = false;
	let intentTimer: number | undefined;

	const pinKey = (spot: Spot) => spot.region + '::' + spot.sel;

	const pinsEqual = (a: Pin[], b: Pin[]) => {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i].spot !== b[i].spot) return false;
			if (Math.abs(a[i].top - b[i].top) > 1) return false;
			if (Math.abs(a[i].left - b[i].left) > 1) return false;
		}
		return true;
	};

	const measure = () => {
		if (typeof document === 'undefined') return;
		const list = SPOTS[$course] || [];
		const next: Pin[] = [];
		for (const spot of list) {
			const el = document.querySelector(spot.sel) as HTMLElement | null;
			if (!el) continue;
			const r = el.getBoundingClientRect();
			if (r.width < 8 || r.height < 8) continue;
			if (r.bottom < 40 || r.top > window.innerHeight - 20) continue;
			next.push({
				top: Math.max(8, r.top + 4),
				left: Math.min(window.innerWidth - 36, Math.max(8, r.right - 22)),
				spot
			});
		}
		if (!pinsEqual(pins, next)) pins = next;
	};

	const askSpot = (spot: Spot) => {
		const q = zh ? `这是${spot.labelZh}吗？请指着画面讲。` : `What is ${spot.labelEn}? Please point at the screen.`;
		openTutorPanel({
			ask: q,
			target: { label: zh ? spot.labelZh : spot.labelEn, region: spot.region, selector: spot.sel }
		});
		void loadTutorSettings().then(() => {});
	};

	const onMouseUp = () => {
		if (typeof document === 'undefined') return;
		const sel = document.getSelection();
		const text = sel?.toString()?.trim() || '';
		if (!text || text.length > 80) {
			askThis = null;
			return;
		}
		const node = sel?.anchorNode as Node | null;
		const el = (node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | null;
		if (!el) {
			askThis = null;
			return;
		}
		const list = SPOTS[$course] || [];
		const hit = list.find((s) => el.closest(s.sel));
		if (!hit) {
			askThis = null;
			return;
		}
		const r = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : el.getBoundingClientRect();
		askThis = {
			top: Math.max(8, r.bottom + 6),
			left: Math.min(window.innerWidth - 88, Math.max(8, r.left)),
			text,
			label: zh ? hit.labelZh : hit.labelEn,
			selector: hit.sel
		};
	};

	const sendSelection = () => {
		if (!askThis) return;
		const q = zh ? `我想问这个：「${askThis.text}」。它在${askThis.label}附近。` : `I want to ask about “${askThis.text}”, near ${askThis.label}.`;
		openTutorPanel({
			ask: q,
			target: { label: askThis.label, region: 'selection', selector: askThis.selector, selected: askThis.text }
		});
		askThis = null;
		intentMode = true;
		if (intentTimer) clearTimeout(intentTimer);
		intentTimer = window.setTimeout(() => {
			intentMode = false;
			intentTimer = undefined;
		}, 4000) as unknown as number;
	};

	const keyAtPoint = (x: number, y: number, target: EventTarget | null) => {
		const overSpot = target instanceof Element ? target.closest('[data-te-tutor="ask-spot"]') : null;
		if (overSpot) {
			const region = overSpot.getAttribute('data-te-tutor-region') || '';
			const pin = pins.find((p) => p.spot.region === region);
			if (pin) return pinKey(pin.spot);
		}
		const list = SPOTS[$course] || [];
		for (const spot of list) {
			const el = document.querySelector(spot.sel) as HTMLElement | null;
			if (!el) continue;
			const r = el.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return pinKey(spot);
		}
		return '';
	};

	const onPointerMove = (e: PointerEvent) => {
		const key = keyAtPoint(e.clientX, e.clientY, e.target);
		if (key) {
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = undefined;
			}
			if (hoverKey !== key) hoverKey = key;
			return;
		}
		if (!hoverKey || hideTimer) return;
		hideTimer = window.setTimeout(() => {
			hoverKey = '';
			hideTimer = undefined;
		}, 180) as unknown as number;
	};

	const onFocusIn = (e: FocusEvent) => {
		const t = e.target as Element | null;
		if (!t) return;
		if (t.closest && t.closest('[data-te-tutor="ask-spot"]')) {
			const region = t.getAttribute('data-te-tutor-region') || t.closest('[data-te-tutor="ask-spot"]')?.getAttribute('data-te-tutor-region') || '';
			const pin = pins.find((p) => p.spot.region === region);
			focusKey = pin ? pinKey(pin.spot) : '';
			return;
		}
		const list = SPOTS[$course] || [];
		const hit = list.find((s) => t.closest && t.closest(s.sel));
		focusKey = hit ? pinKey(hit) : '';
	};

	const onFocusOut = () => {
		focusKey = '';
	};

	const cleanup = () => {
		ro?.disconnect();
		mo?.disconnect();
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		window.removeEventListener('resize', measure);
		window.removeEventListener('scroll', measure, true);
		document.removeEventListener('mouseup', onMouseUp);
		document.removeEventListener('pointermove', onPointerMove, true);
		document.removeEventListener('focusin', onFocusIn, true);
		document.removeEventListener('focusout', onFocusOut, true);
		if (hideTimer) clearTimeout(hideTimer);
		if (intentTimer) clearTimeout(intentTimer);
	};

	onMount(() => {
		measure();
		ro = new ResizeObserver(() => {
			clearTimeout(timer);
			timer = window.setTimeout(measure, 120) as unknown as number;
		});
		ro.observe(document.documentElement);
		mo = new MutationObserver((mutations) => {
			const relevant = mutations.some((m) => {
				const node = (m.target instanceof Element ? m.target : m.target.parentElement) as Element | null;
				if (!node) return false;
				if (node.closest && node.closest('[data-te-tutor="ask-layer"], [data-te-tutor="ask-panel"], [data-te-tutor="settings-panel"], [data-te-tutor="map"]')) return false;
				return true;
			});
			if (!relevant) return;
			clearTimeout(timer);
			timer = window.setTimeout(measure, 120) as unknown as number;
		});
		mo.observe(document.body, { childList: true, subtree: true });
		window.addEventListener('resize', measure);
		window.addEventListener('scroll', measure, true);
		document.addEventListener('mouseup', onMouseUp);
		document.addEventListener('pointermove', onPointerMove, true);
		document.addEventListener('focusin', onFocusIn, true);
		document.addEventListener('focusout', onFocusOut, true);
		return cleanup;
	});

	onDestroy(() => {
		cleanup();
	});

	$: if ($course) {
		if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(measure);
	}
</script>

<div class="layer" class:open-panel={$tutorPanelOpen} data-te-tutor="ask-layer" aria-hidden="false">
	{#each pins as pin (pin.spot.region + pin.spot.sel)}
		<button
			type="button"
			class="spot"
			class:revealed={intentMode || hoverKey === pinKey(pin.spot) || focusKey === pinKey(pin.spot)}
			style="top:{pin.top}px;left:{pin.left}px"
			data-te-tutor="ask-spot"
			data-te-tutor-region={pin.spot.region}
			tabindex="-1"
			title={m.askThisRegion || (zh ? `问：${pin.spot.labelZh}` : `Ask about ${pin.spot.labelEn}`)}
			on:click={() => askSpot(pin.spot)}
		>?</button>
	{/each}
	{#if askThis}
		<button
			type="button"
			class="ask-this"
			style="top:{askThis.top}px;left:{askThis.left}px"
			data-te-tutor="ask-this"
			on:click={sendSelection}>{m.askThis || (zh ? '问这个' : 'Ask about this')}</button
		>
	{/if}
</div>

<style>
	.layer {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 10040;
	}
	.spot,
	.ask-this {
		pointer-events: auto;
		position: fixed;
		z-index: 10041;
		cursor: pointer;
	}
	.spot {
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 999px;
		border: 1px solid #ddd6fe;
		background: rgba(255, 255, 255, 0.92);
		color: #6d28d9;
		font-weight: 800;
		font-size: 0.75rem;
		line-height: 1;
		padding: 0;
		box-shadow: 0 2px 6px rgba(76, 29, 149, 0.15);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.12s ease;
	}
	.spot.revealed,
	.spot:focus-visible {
		opacity: 1;
		pointer-events: auto;
	}
	.ask-this {
		border: 1px solid #7c3aed;
		background: #7c3aed;
		color: #fff;
		border-radius: 999px;
		padding: 0.15rem 0.55rem;
		font-size: 0.75rem;
		font-weight: 700;
		box-shadow: 0 6px 16px rgba(124, 58, 237, 0.25);
	}
</style>
