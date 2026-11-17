/** Autoregressive image-token toy: fill the canvas patch by patch. */

export type PatchTok = { id: string; labelZh: string; labelEn: string; color: [number, number, number] };

const BASE: Record<string, PatchTok[]> = {
	sailboat: [
		{ id: 'sky', labelZh: '天空', labelEn: 'sky', color: [255, 160, 80] },
		{ id: 'sea', labelZh: '海面', labelEn: 'sea', color: [30, 70, 140] },
		{ id: 'boat', labelZh: '船身', labelEn: 'boat', color: [90, 40, 30] },
		{ id: 'sail', labelZh: '红帆', labelEn: 'sail', color: [200, 36, 36] },
		{ id: 'sun', labelZh: '太阳', labelEn: 'sun', color: [255, 230, 140] }
	],
	house: [
		{ id: 'sky', labelZh: '天空', labelEn: 'sky', color: [170, 215, 255] },
		{ id: 'grass', labelZh: '草地', labelEn: 'grass', color: [70, 140, 60] },
		{ id: 'wall', labelZh: '黄墙', labelEn: 'wall', color: [240, 200, 70] },
		{ id: 'roof', labelZh: '屋顶', labelEn: 'roof', color: [180, 50, 40] },
		{ id: 'tree', labelZh: '树冠', labelEn: 'tree', color: [40, 130, 55] }
	],
	moon: [
		{ id: 'night', labelZh: '夜空', labelEn: 'night', color: [16, 12, 48] },
		{ id: 'mountain', labelZh: '山脊', labelEn: 'mountain', color: [80, 45, 120] },
		{ id: 'moon', labelZh: '月亮', labelEn: 'moon', color: [240, 235, 200] },
		{ id: 'star', labelZh: '星星', labelEn: 'star', color: [220, 220, 255] }
	],
	cat: [
		{ id: 'wall', labelZh: '墙', labelEn: 'wall', color: [230, 180, 130] },
		{ id: 'window', labelZh: '窗光', labelEn: 'window', color: [245, 236, 220] },
		{ id: 'frame', labelZh: '窗框', labelEn: 'frame', color: [90, 55, 35] },
		{ id: 'cat', labelZh: '白猫', labelEn: 'cat', color: [250, 250, 250] }
	],
	teacup: [
		{ id: 'bg', labelZh: '背景', labelEn: 'background', color: [220, 210, 195] },
		{ id: 'table', labelZh: '木桌', labelEn: 'table', color: [130, 80, 40] },
		{ id: 'cup', labelZh: '杯子', labelEn: 'cup', color: [240, 236, 230] },
		{ id: 'tea', labelZh: '茶', labelEn: 'tea', color: [120, 70, 30] },
		{ id: 'steam', labelZh: '热气', labelEn: 'steam', color: [210, 210, 220] }
	]
};

export const AR_GRID = 4;

export function tokensFor(promptId: string): PatchTok[] {
	return BASE[promptId] ?? BASE.sailboat;
}

function mulberry32(seed: number) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

/** Preferred token for a cell, plus a probability table. */
export function nextPatchProbs(promptId: string, index: number, seed: number) {
	const toks = tokensFor(promptId);
	const row = Math.floor(index / AR_GRID);
	const col = index % AR_GRID;
	const rng = mulberry32(seed * 33 + index * 17 + promptId.length);
	const logits = toks.map((tok, i) => {
		let s = 0.4 + rng() * 0.4;
		// crude layout prior
		if (promptId === 'sailboat') {
			if (row < 2 && tok.id === 'sky') s += 2.2;
			if (row >= 2 && tok.id === 'sea') s += 2.0;
			if (row === 1 && col >= 2 && tok.id === 'sun') s += 1.6;
			if (row === 2 && col === 1 && tok.id === 'sail') s += 2.4;
			if (row === 3 && col === 1 && tok.id === 'boat') s += 2.4;
		} else if (promptId === 'house') {
			if (row < 2 && tok.id === 'sky') s += 2;
			if (row >= 3 && tok.id === 'grass') s += 2;
			if (row === 2 && col === 1 && tok.id === 'wall') s += 2.2;
			if (row === 1 && col === 1 && tok.id === 'roof') s += 2.2;
			if (col === 2 && row >= 1 && tok.id === 'tree') s += 1.8;
		} else if (promptId === 'moon') {
			if (row < 2 && tok.id === 'night') s += 2;
			if (row >= 2 && tok.id === 'mountain') s += 2;
			if (row === 0 && col === 2 && tok.id === 'moon') s += 2.5;
			if (row < 2 && tok.id === 'star') s += 0.8;
		} else if (promptId === 'cat') {
			if (col === 0 || col === 3) {
				if (tok.id === 'frame') s += 2;
				else if (tok.id === 'wall') s += 1;
			} else if (tok.id === 'window') s += 1.6;
			if (row >= 2 && col >= 1 && col <= 2 && tok.id === 'cat') s += 2.2;
		} else {
			if (row >= 2 && tok.id === 'table') s += 2;
			if (row < 2 && tok.id === 'bg') s += 1.6;
			if (row === 1 && col === 1 && tok.id === 'cup') s += 2;
			if (row === 1 && col === 2 && tok.id === 'tea') s += 1.8;
			if (row === 0 && col === 1 && tok.id === 'steam') s += 1.6;
		}
		return { tok, logit: s };
	});
	const max = Math.max(...logits.map((d) => d.logit));
	const exps = logits.map((d) => Math.exp(d.logit - max));
	const z = exps.reduce((a, b) => a + b, 0);
	return logits.map((d, i) => ({ ...d, prob: exps[i] / z }));
}

export function pickPatch(probs: ReturnType<typeof nextPatchProbs>, seed: number, index: number) {
	const rng = mulberry32(seed * 9 + index * 101);
	let r = rng();
	for (const p of probs) {
		r -= p.prob;
		if (r <= 0) return p.tok;
	}
	return probs[0].tok;
}

export function drawArCanvas(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	filled: { tok: PatchTok }[],
	hover?: number
) {
	const gw = w / AR_GRID;
	const gh = h / AR_GRID;
	ctx.fillStyle = '#d1d5db';
	ctx.fillRect(0, 0, w, h);
	for (let i = 0; i < AR_GRID * AR_GRID; i++) {
		const r = Math.floor(i / AR_GRID);
		const c = i % AR_GRID;
		const x = c * gw;
		const y = r * gh;
		if (i < filled.length) {
			const [R, G, B] = filled[i].tok.color;
			ctx.fillStyle = `rgb(${R},${G},${B})`;
			ctx.fillRect(x, y, gw, gh);
		} else {
			ctx.fillStyle = i === filled.length ? '#e9d5ff' : '#e5e7eb';
			ctx.fillRect(x + 1, y + 1, gw - 2, gh - 2);
		}
		ctx.strokeStyle = hover === i ? '#6d28d9' : 'rgba(0,0,0,0.12)';
		ctx.lineWidth = hover === i ? 2 : 1;
		ctx.strokeRect(x + 0.5, y + 0.5, gw - 1, gh - 1);
	}
}
