/** Deterministic toy latent-diffusion renderer. Not a real SD model. */

export type RenderParams = {
	promptId: string;
	seed: number;
	cfg: number;
	step: number;
	totalSteps: number;
	scheduler: 'euler' | 'ddim';
	width?: number;
	height?: number;
};

function mulberry32(seed: number) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

function hashStr(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function clamp(v: number, lo = 0, hi = 255) {
	return v < lo ? lo : v > hi ? hi : v;
}

function ease(t: number, scheduler: 'euler' | 'ddim') {
	const x = Math.min(1, Math.max(0, t));
	if (scheduler === 'ddim') return 1 - Math.pow(1 - x, 1.45);
	return x * x * (3 - 2 * x);
}

function residualAtEnd(totalSteps: number) {
	if (totalSteps <= 4) return 0.38;
	if (totalSteps <= 12) return 0.16;
	if (totalSteps <= 20) return 0.07;
	return 0.03;
}

type RGB = [number, number, number];

function mix(a: RGB, b: RGB, t: number): RGB {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function drawTarget(
	px: Uint8ClampedArray,
	w: number,
	h: number,
	promptId: string,
	seed: number,
	kind: 'cond' | 'uncond'
) {
	const rng = mulberry32(seed ^ hashStr(promptId + kind) ^ (kind === 'cond' ? 99 : 3));
	const jitter = (kind === 'cond' ? (seed % 9) - 4 : (seed % 5) - 2) / w;
	const muted = kind === 'uncond';

	const set = (x: number, y: number, c: RGB, a = 1) => {
		if (x < 0 || y < 0 || x >= w || y >= h) return;
		const i = (y * w + x) * 4;
		px[i] = clamp(lerp(px[i], c[0], a));
		px[i + 1] = clamp(lerp(px[i + 1], c[1], a));
		px[i + 2] = clamp(lerp(px[i + 2], c[2], a));
		px[i + 3] = 255;
	};

	const fillRect = (x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1) => {
		for (let y = Math.floor(y0); y < y1; y++) {
			for (let x = Math.floor(x0); x < x1; x++) set(x, y, c, a);
		}
	};

	const disk = (cx: number, cy: number, r: number, c: RGB, a = 1) => {
		const r2 = r * r;
		for (let y = Math.floor(cy - r); y <= cy + r; y++) {
			for (let x = Math.floor(cx - r); x <= cx + r; x++) {
				const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
				if (d <= r2) set(x, y, c, a * (1 - d / r2) ** 0.35);
			}
		}
	};

	// generic uncond background: dull grey-blue gradient
	if (muted) {
		for (let y = 0; y < h; y++) {
			const t = y / h;
			const c: RGB = [lerp(92, 140, t), lerp(100, 132, t), lerp(118, 148, t)];
			for (let x = 0; x < w; x++) set(x, y, c, 1);
		}
		disk(w * 0.5, h * 0.42, w * 0.18, [160, 158, 150], 0.55);
		fillRect(0, h * 0.68, w, h, [90, 96, 100], 0.7);
		return;
	}

	const ox = jitter * w * 8;

	if (promptId === 'sailboat') {
		for (let y = 0; y < h; y++) {
			const t = y / h;
			const c: RGB =
				t < 0.55
					? mix([255, 140, 70], [255, 210, 140], t / 0.55)
					: mix([40, 90, 160], [20, 50, 100], (t - 0.55) / 0.45);
			for (let x = 0; x < w; x++) {
				let col = c;
				if (t > 0.55) {
					const wave = Math.sin((x + ox) * 0.12 + seed) * 6;
					if (y < h * 0.55 + 10 + wave) col = mix([255, 170, 90], c, 0.3);
				}
				set(x, y, col, 1);
			}
		}
		disk(w * 0.78 + ox, h * 0.18, w * 0.1, [255, 230, 140], 0.95);
		const bx = w * 0.38 + ox;
		const by = h * 0.62;
		// hull
		fillRect(bx - 28, by, bx + 28, by + 14, [80, 40, 30], 1);
		// sail
		for (let y = 0; y < 48; y++) {
			const width = 6 + y * 0.55;
			for (let x = 0; x < width; x++) set(bx + 2 + x, by - 52 + y, [200, 36, 36], 1);
		}
		for (let y = by; y < by + 8; y++) {
			for (let x = 0; x < w; x++) {
				const glint = 0.15 + 0.15 * Math.sin(x * 0.2 + seed);
				set(x, y + 10, [80, 140, 200], glint);
			}
		}
	} else if (promptId === 'house') {
		for (let y = 0; y < h; y++) {
			const t = y / h;
			const c: RGB = t < 0.62 ? mix([160, 210, 255], [230, 245, 255], t) : mix([90, 160, 70], [50, 110, 50], t);
			for (let x = 0; x < w; x++) set(x, y, c, 1);
		}
		const hx = w * 0.42 + ox;
		const hy = h * 0.58;
		fillRect(hx - 26, hy - 10, hx + 26, hy + 28, [240, 200, 70], 1);
		for (let y = 0; y < 28; y++) {
			const half = 36 - y * 1.2;
			for (let x = -half; x <= half; x++) set(hx + x, hy - 10 - 28 + y, [180, 50, 40], 1);
		}
		fillRect(hx - 6, hy + 8, hx + 6, hy + 28, [90, 50, 30], 1);
		disk(hx + 50, hy - 8, 26, [40, 130, 55], 1);
		fillRect(hx + 47, hy + 8, hx + 53, hy + 28, [90, 60, 30], 1);
	} else if (promptId === 'moon') {
		for (let y = 0; y < h; y++) {
			const c: RGB = mix([12, 10, 40], [40, 25, 80], y / h);
			for (let x = 0; x < w; x++) set(x, y, c, 1);
		}
		for (let i = 0; i < 18; i++) {
			set((rng() * w) | 0, (rng() * h * 0.55) | 0, [230, 230, 255], 0.9);
		}
		const mx = w * 0.68 + ox;
		const my = h * 0.22;
		disk(mx, my, 18, [240, 235, 200], 1);
		disk(mx + 8, my - 2, 14, [18, 14, 50], 1);
		for (let k = 0; k < 3; k++) {
			const yy = h * (0.62 + k * 0.12);
			for (let x = 0; x < w; x++) {
				const crest = yy - 16 * Math.sin((x + ox) * 0.04 + k + seed * 0.1);
				for (let y = crest; y < h; y++) {
					const c: RGB = mix([70, 40, 110], [30, 18, 60], k / 3);
					set(x, y, c, 0.9);
				}
			}
		}
	} else if (promptId === 'cat') {
		for (let y = 0; y < h; y++) {
			const t = y / h;
			const c: RGB = mix([255, 214, 170], [210, 150, 110], t);
			for (let x = 0; x < w; x++) set(x, y, c, 1);
		}
		const fx = w * 0.22 + ox;
		fillRect(fx, h * 0.16, w - fx * 0.4, h * 0.84, [245, 236, 220], 1);
		fillRect(fx - 8, h * 0.16, fx, h * 0.84, [90, 55, 35], 1);
		fillRect(w - fx * 0.4, h * 0.16, w - fx * 0.4 + 8, h * 0.84, [90, 55, 35], 1);
		fillRect(fx - 8, h * 0.16, w - fx * 0.4 + 8, h * 0.16 + 8, [90, 55, 35], 1);
		// cat body
		const cx = w * 0.52 + ox * 0.3;
		const cy = h * 0.62;
		disk(cx, cy, 22, [245, 245, 245], 1);
		disk(cx, cy - 22, 14, [250, 250, 250], 1);
		// ears
		for (let y = 0; y < 14; y++) {
			for (let x = -y / 2; x <= 2; x++) set(cx - 10 + x, cy - 36 + y, [250, 250, 250], 1);
			for (let x = -2; x <= y / 2; x++) set(cx + 10 + x, cy - 36 + y, [250, 250, 250], 1);
		}
		set(cx - 5, cy - 24, [40, 40, 40], 1);
		set(cx + 5, cy - 24, [40, 40, 40], 1);
	} else {
		// teacup
		for (let y = 0; y < h; y++) {
			const t = y / h;
			const c: RGB = t < 0.58 ? mix([210, 200, 185], [230, 220, 200], t) : mix([140, 90, 45], [90, 55, 25], t);
			for (let x = 0; x < w; x++) {
				let col = c;
				if (t >= 0.58) {
					const grain = ((x * 13 + y * 7 + seed) % 7) / 28;
					col = [c[0] + grain * 40, c[1] + grain * 20, c[2]];
				}
				set(x, y, col, 1);
			}
		}
		const cx = w * 0.5 + ox * 0.5;
		const cy = h * 0.52;
		fillRect(cx - 22, cy - 8, cx + 22, cy + 22, [240, 236, 230], 1);
		disk(cx, cy - 8, 22, [240, 236, 230], 1);
		fillRect(cx + 20, cy - 2, cx + 34, cy + 14, [230, 226, 220], 1);
		// tea
		fillRect(cx - 16, cy - 6, cx + 16, cy + 10, [120, 70, 30], 0.9);
		for (let i = 0; i < 6; i++) {
			const sx = cx - 8 + i * 4;
			for (let y = 0; y < 18; y++) {
				const wobble = Math.sin(y * 0.6 + i) * 1.4;
				set(sx + wobble, cy - 10 - y, [220, 220, 230], 0.45);
			}
		}
	}
}

function addNoise(px: Uint8ClampedArray, seed: number, amount: number) {
	if (amount <= 0.002) return;
	const rng = mulberry32(seed ^ 0x9e3779b9);
	for (let i = 0; i < px.length; i += 4) {
		const n = (rng() - 0.5) * 2 * 255 * amount;
		px[i] = clamp(px[i] + n);
		px[i + 1] = clamp(px[i + 1] + n * 0.95);
		px[i + 2] = clamp(px[i + 2] + n * 0.9);
		px[i + 3] = 255;
	}
}

function overcook(px: Uint8ClampedArray, strength: number) {
	if (strength <= 0) return;
	for (let i = 0; i < px.length; i += 4) {
		px[i] = clamp((px[i] - 128) * (1 + strength) + 128 + strength * 18);
		px[i + 1] = clamp((px[i + 1] - 128) * (1 + strength * 0.8) + 128);
		px[i + 2] = clamp((px[i + 2] - 128) * (1 + strength * 0.6) + 128 - strength * 8);
	}
}

export function renderFrame(params: RenderParams): ImageData {
	const w = params.width ?? 192;
	const h = params.height ?? 192;
	const cond = new ImageData(w, h);
	const uncond = new ImageData(w, h);
	drawTarget(cond.data, w, h, params.promptId, params.seed, 'cond');
	drawTarget(uncond.data, w, h, params.promptId, params.seed, 'uncond');

	const tRaw = params.totalSteps <= 0 ? 1 : params.step / params.totalSteps;
	const t = ease(tRaw, params.scheduler);
	const endNoise = residualAtEnd(params.totalSteps);
	const noiseAmt = lerp(1, endNoise, t);
	// CFG: out = uncond + cfg * (cond - uncond), then blend with noise over time
	const cfg = Math.max(0.2, params.cfg);
	const guidance = Math.min(1, (cfg - 1) / 8); // 1→0, 7→0.75, 15→1+
	const over = Math.max(0, (cfg - 9) / 8); // 15 is overcooked

	const out = new ImageData(w, h);
	for (let i = 0; i < out.data.length; i += 4) {
		const u: RGB = [uncond.data[i], uncond.data[i + 1], uncond.data[i + 2]];
		const c: RGB = [cond.data[i], cond.data[i + 1], cond.data[i + 2]];
		// cfg mix of cond vs uncond
		const guided: RGB = [
			u[0] + cfg * (c[0] - u[0]) * 0.18 + guidance * (c[0] - u[0]) * 0.55,
			u[1] + cfg * (c[1] - u[1]) * 0.18 + guidance * (c[1] - u[1]) * 0.55,
			u[2] + cfg * (c[2] - u[2]) * 0.18 + guidance * (c[2] - u[2]) * 0.55
		];
		const shown = mix(u, guided, Math.min(1, 0.25 + t * 0.9));
		out.data[i] = clamp(shown[0]);
		out.data[i + 1] = clamp(shown[1]);
		out.data[i + 2] = clamp(shown[2]);
		out.data[i + 3] = 255;
	}
	overcook(out.data, over * t);
	addNoise(out.data, params.seed * 17 + params.step * 13, noiseAmt);
	return out;
}

export function renderNoisePreview(params: RenderParams): ImageData {
	const now = renderFrame(params);
	const later = renderFrame({ ...params, step: Math.min(params.totalSteps, params.step + 1) });
	const w = now.width;
	const h = now.height;
	const pred = new ImageData(w, h);
	for (let i = 0; i < now.data.length; i += 4) {
		pred.data[i] = clamp(128 + (now.data[i] - later.data[i]) * 3);
		pred.data[i + 1] = clamp(128 + (now.data[i + 1] - later.data[i + 1]) * 3);
		pred.data[i + 2] = clamp(128 + (now.data[i + 2] - later.data[i + 2]) * 3);
		pred.data[i + 3] = 255;
	}
	return pred;
}

export function blit(ctx: CanvasRenderingContext2D, data: ImageData) {
	ctx.putImageData(data, 0, 0);
}

export function frameToCanvas(data: ImageData): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = data.width;
	c.height = data.height;
	c.getContext('2d')!.putImageData(data, 0, 0);
	return c;
}

export function describeStepChange(params: RenderParams, locale: 'zh-CN' | 'en'): string {
	const t = params.totalSteps ? params.step / params.totalSteps : 1;
	if (locale === 'en') {
		if (params.step === 0) return 'Step 0: still almost pure noise. The prompt is only a condition, not a finished picture.';
		if (t < 0.25) return `Step ${params.step}: large shapes start to appear; edges are still rough.`;
		if (t < 0.55) return `Step ${params.step}: the main objects are recognizable; remaining noise is shrinking.`;
		if (t < 0.85) return `Step ${params.step}: colors and outlines get cleaner. CFG=${params.cfg} decides how closely it follows the prompt.`;
		return `Step ${params.step}/${params.totalSteps}: almost a finished picture. A little grain may remain, especially with few steps.`;
	}
	if (params.step === 0) return '第 0 步：现在几乎还是噪声。提示词只是条件，不是已经画完的图。';
	if (t < 0.25) return `第 ${params.step} 步：大块形状开始冒出来，边缘还很毛糙。`;
	if (t < 0.55) return `第 ${params.step} 步：主体已经能认出来，残留噪声在变少。`;
	if (t < 0.85) return `第 ${params.step} 步：颜色和轮廓更清楚。CFG=${params.cfg} 决定它有多听话。`;
	return `第 ${params.step}/${params.totalSteps} 步：已经接近成品。步数少时，最后仍可能留一点颗粒。`;
}
