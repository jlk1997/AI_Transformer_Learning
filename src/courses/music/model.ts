import { MODE_SETS, MUSIC_EXAMPLES, PITCH_MAX, PITCH_MIN, type MelodyExample, type Note } from './melodies';

export type Sampling = { type: 'top-k' | 'top-p'; value: number };
export type PitchProb = { pitch: number; name: string; prob: number };
export type DurProb = { dur: number; label: string; prob: number };

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function pitchName(p: number) {
	return `${NAMES[((p % 12) + 12) % 12]}${Math.floor(p / 12) - 1}`;
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

export function nextStart(notes: Note[]) {
	if (!notes.length) return 0;
	const last = notes[notes.length - 1];
	return last.start + last.dur;
}

function softmax(logits: number[], temperature: number) {
	const t = Math.max(0.05, temperature);
	const scaled = logits.map((x) => x / t);
	const m = Math.max(...scaled);
	const exps = scaled.map((x) => Math.exp(x - m));
	const z = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / z);
}

function applyTopK(probs: number[], k: number) {
	const idx = probs.map((p, i) => i).sort((a, b) => probs[b] - probs[a]);
	const keep = new Set(idx.slice(0, Math.max(1, k)));
	const out = probs.map((p, i) => (keep.has(i) ? p : 0));
	const z = out.reduce((a, b) => a + b, 0) || 1;
	return out.map((p) => p / z);
}

function applyTopP(probs: number[], p: number) {
	const idx = probs.map((pr, i) => i).sort((a, b) => probs[b] - probs[a]);
	const keep = new Set<number>();
	let acc = 0;
	for (const i of idx) {
		keep.add(i);
		acc += probs[i];
		if (acc >= p) break;
	}
	const out = probs.map((pr, i) => (keep.has(i) ? pr : 0));
	const z = out.reduce((a, b) => a + b, 0) || 1;
	return out.map((pr) => pr / z);
}

export function pitchLogits(ex: MelodyExample, notes: Note[], overrideMode?: MelodyExample['mode']) {
	const mode = overrideMode ?? ex.mode;
	const allowed = new Set(MODE_SETS[mode].map((d) => (ex.tonic + d) % 12));
	const last = notes[notes.length - 1];
	const lastPitch = last?.pitch ?? ex.tonic;
	const motif = notes.slice(0, Math.min(3, notes.length));
	const pitches: number[] = [];
	const logits: number[] = [];
	for (let p = PITCH_MIN; p <= PITCH_MAX; p++) {
		pitches.push(p);
		let s = -1.2;
		if (allowed.has(p % 12)) s += 2.4;
		else s -= 1.8;
		const interval = Math.abs(p - lastPitch);
		s += interval === 0 ? 0.6 : interval <= 2 ? 1.1 : interval <= 5 ? 0.3 : -0.4 * (interval - 5);
		// motif repeat bonus
		if (motif.some((n) => n.pitch === p)) s += 0.7;
		// continue a scale
		if (last && p === lastPitch + 2 && allowed.has(p % 12)) s += 0.5;
		logits.push(s);
	}
	return { pitches, logits };
}

export function durationLogits(notes: Note[]) {
	const durs = [2, 4, 8];
	const last = notes[notes.length - 1]?.dur ?? 4;
	const logits = durs.map((d) => (d === last ? 1.4 : d === 4 ? 0.8 : 0.3));
	return { durs, logits };
}

export function nextDistributions(
	ex: MelodyExample,
	notes: Note[],
	temperature: number,
	sampling: Sampling,
	overrideMode?: MelodyExample['mode']
) {
	const { pitches, logits } = pitchLogits(ex, notes, overrideMode);
	let probs = softmax(logits, temperature);
	if (sampling.type === 'top-k') probs = applyTopK(probs, sampling.value);
	else probs = applyTopP(probs, sampling.value);
	const pitchProbs: PitchProb[] = pitches
		.map((pitch, i) => ({ pitch, name: pitchName(pitch), prob: probs[i] }))
		.sort((a, b) => b.prob - a.prob);
	const d = durationLogits(notes);
	const dProbsRaw = softmax(d.logits, Math.max(0.4, temperature));
	const durProbs: DurProb[] = d.durs.map((dur, i) => ({
		dur,
		label: dur === 2 ? '♪ 8分' : dur === 4 ? '♩ 4分' : '𝅗𝅥 2分',
		prob: dProbsRaw[i]
	}));
	return { pitchProbs, durProbs };
}

export function sampleNext(
	ex: MelodyExample,
	notes: Note[],
	temperature: number,
	sampling: Sampling,
	seed: number,
	overrideMode?: MelodyExample['mode']
): Note {
	const { pitchProbs, durProbs } = nextDistributions(ex, notes, temperature, sampling, overrideMode);
	const rng = mulberry32(seed ^ (notes.length * 7919) ^ Math.round(temperature * 10));
	const pick = (items: { prob: number }[]) => {
		let r = rng();
		for (const it of items) {
			r -= it.prob;
			if (r <= 0) return it;
		}
		return items[0];
	};
	const pitch = (pick(pitchProbs) as PitchProb).pitch;
	const dur = (pick(durProbs) as DurProb).dur;
	return { pitch, dur, start: nextStart(notes) };
}

/** Attention-like weights over previous notes for the current step. */
export function attentionWeights(notes: Note[], nextPitch?: number) {
	if (!notes.length) return [];
	const last = notes[notes.length - 1];
	const motif = notes.slice(0, Math.min(3, notes.length));
	const raw = notes.map((n, i) => {
		let s = 0.15;
		if (n.pitch === last.pitch) s += 0.9;
		if (motif.some((m) => m.pitch === n.pitch && m.start === n.start)) s += 1.1;
		if (nextPitch != null && n.pitch === nextPitch) s += 0.8;
		if (i === notes.length - 1) s += 0.4;
		s += 0.15 * (i / notes.length);
		return s;
	});
	const z = raw.reduce((a, b) => a + b, 0) || 1;
	return raw.map((x) => x / z);
}

export function exampleById(id: string) {
	return MUSIC_EXAMPLES.find((e) => e.id === id) ?? MUSIC_EXAMPLES[0];
}

let audioCtx: AudioContext | null = null;

export function playNotes(notes: Note[], bpm = 96) {
	if (typeof window === 'undefined' || !notes.length) return;
	const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
	if (!audioCtx) audioCtx = new AC();
	const ctx = audioCtx;
	if (ctx.state === 'suspended') ctx.resume();
	const sixteenth = 60 / bpm / 4;
	const t0 = ctx.currentTime + 0.05;
	for (const n of notes) {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.value = 440 * Math.pow(2, (n.pitch - 69) / 12);
		const start = t0 + n.start * sixteenth;
		const dur = Math.max(0.08, n.dur * sixteenth);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(start);
		osc.stop(start + dur + 0.02);
	}
}
