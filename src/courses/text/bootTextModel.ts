import { get } from 'svelte/store';
import { base } from '$app/paths';
import {
	inputText,
	inputTextExample,
	isFetchingModel,
	isMobile,
	modelData,
	modelFetchProgress,
	modelSession,
	sampling,
	selectedExampleIdx,
	temperature,
	userId
} from '~/store';
import { getCachedExample, loadExample } from '~/constants/examples/loadExample';
import {
	isLoraContrastActive,
	loraContrast,
	refreshLoraContrast,
	shouldHoldOnnx,
	textTokenizer
} from '~/courses/loraContrast';

let bootPromise: Promise<void> | null = null;
let subscribed = false;
let appStartTime = 0;

export function bootTextModel() {
	if (!bootPromise) {
		appStartTime = Date.now();
		bootPromise = bootInner().catch((err) => {
			console.warn('text model boot failed', err);
			isFetchingModel.set(false);
			bootPromise = null;
		});
	}
	return bootPromise;
}

async function bootInner() {
	const ort = (await import('onnxruntime-web')).default ?? (await import('onnxruntime-web'));
	// Prefer the namespace object that has env + InferenceSession.
	const runtime: any = (ort as any).env ? ort : (ort as any);
	const env = runtime.env ?? (runtime as any).default?.env;
	const InferenceSession = runtime.InferenceSession ?? (runtime as any).default?.InferenceSession;
	if (env?.wasm) {
		env.wasm.wasmPaths = `${base || ''}/ort-wasm/`;
		env.logLevel = 'error';
		try {
			env.wasm.proxy = true;
		} catch {
			/* older runtimes may not support proxy */
		}
	}

	const { AutoTokenizer, env: xenovaEnv } = await import('@xenova/transformers');
	xenovaEnv.allowLocalModels = true;
	xenovaEnv.useBrowserCache = false;
	xenovaEnv.localModelPath = '/models/';

	let gpt2Tokenizer = get(textTokenizer);
	if (!gpt2Tokenizer) {
		gpt2Tokenizer = await AutoTokenizer.from_pretrained('Xenova/gpt2');
		textTokenizer.set(gpt2Tokenizer);
	}

	if (!subscribed) {
		subscribeInputs(gpt2Tokenizer, runtime);
		subscribed = true;
	}

	if (isLoraContrastActive() && !get(loraContrast).base && !get(loraContrast).loading) {
		void refreshLoraContrast(get(inputText) || get(loraContrast).text, get(loraContrast).runId, {
			keepSide: true
		});
	}

	if (!get(isMobile) && !get(modelSession)) {
		void fetchModel(runtime, InferenceSession);
	}
}

function reportProgress(p: {
	partsDone: number;
	partsTotal: number;
	receivedBytes: number;
	totalBytes: number;
	percent: number;
}) {
	modelFetchProgress.set({
		active: true,
		partsDone: p.partsDone,
		partsTotal: p.partsTotal,
		receivedBytes: p.receivedBytes,
		totalBytes: p.totalBytes,
		percent: p.percent
	});
}

async function fetchModel(runtime: any, InferenceSession: any) {
	if (get(modelSession)) {
		isFetchingModel.set(false);
		return;
	}
	isFetchingModel.set(true);
	modelFetchProgress.update((s) => ({ ...s, active: true, percent: 0, partsDone: 0 }));
	try {
		const { fetchAndMergeChunks } = await import('~/utils/fetchChunks');
		const chunkNum = 63;
		const chunkUrls = Array(chunkNum)
			.fill(0)
			.map((_d, i) => `${base}/model-v2/gpt2.onnx.part${i}`);

		const { hasCache, blob } = await fetchAndMergeChunks(chunkUrls, reportProgress);
		if (!blob || blob.size < 1024) {
			throw new Error('model bytes missing');
		}

		await new Promise((resolve) => setTimeout(resolve, 0));

		const url = URL.createObjectURL(blob);
		const Session = InferenceSession ?? runtime.InferenceSession;
		const session = await Session.create(url, {});
		modelSession.set(session);
		isFetchingModel.set(false);
		modelFetchProgress.update((s) => ({ ...s, active: false, percent: 100, partsDone: 63 }));

		window.dataLayer?.push({
			event: `model-loaded`,
			use_cache: hasCache,
			load_time_ms: Date.now() - appStartTime,
			user_id: get(userId)
		});
	} catch (err) {
		console.warn('model load failed, continuing with cached examples', err);
		isFetchingModel.set(false);
		modelFetchProgress.update((s) => ({ ...s, active: false }));
	}
}

function subscribeInputs(tokenizer: any, _runtime: any) {
	const runModelOrCache = async (text?: string, reason: 'user' | 'autoload' = 'user') => {
		const { adjustTemperature, runModel, fakeRunWithCachedData, clearTextVisualization } = await import('~/utils/data');
		const input = (text ?? get(inputText)).trim();
		if (!input) {
			clearTextVisualization();
			return;
		}
		if (isLoraContrastActive() && shouldHoldOnnx(input)) {
			const contrast = get(loraContrast);
			if (contrast.loading) return;
			if (contrast.base && contrast.text.trim() === input) return;
			void refreshLoraContrast(input, contrast.runId, { keepSide: true });
			return;
		}
		if (get(isFetchingModel) || !get(modelSession)) {
			const idx = get(selectedExampleIdx);
			const expected = String((inputTextExample && inputTextExample[idx]) || '').trim();
			// Cached example rankings must not be shown as if they belonged to a custom sentence.
			if (expected && input.trim() !== expected) return;
			let cachedData = getCachedExample(idx);
			if (!cachedData && idx >= 1 && idx <= 4) {
				cachedData = await loadExample(idx);
			}
			if (!cachedData) return;
			fakeRunWithCachedData({
				cachedData,
				tokenizer,
				temperature: get(temperature),
				sampling: get(sampling),
				reason,
				input
			});
			return;
		}
		runModel({
			tokenizer,
			input,
			temperature: get(temperature),
			sampling: get(sampling),
			reason
		});
	};

	// Do not auto-run on subscribe (that silently replaced the ex0 example
	// ranking and parked a preview word in the input before the first click).
	let initialInputText = true;
	inputText.subscribe((value) => {
		if (initialInputText) {
			initialInputText = false;
			return;
		}
		void runModelOrCache(value, 'user');
	});

	const runWhenModelReady = (reason: 'user' | 'autoload') => {
		if (get(isFetchingModel) || !get(modelSession)) return;
		const text = (get(inputText) || '').trim();
		const idx = get(selectedExampleIdx);
		const expected = String((inputTextExample && inputTextExample[idx]) || '').trim();
		// A custom sentence typed while the ONNX file was still loading must be
		// scored as soon as the session is ready. Cached examples stay as they are.
		if (text && text !== expected) {
			void runModelOrCache(text, 'user');
			return;
		}
		if (reason === 'autoload' && !getCachedExample(idx)) {
			void runModelOrCache(undefined, 'autoload');
		}
	};

	let initialFetchFlag = get(isFetchingModel);
	isFetchingModel.subscribe((fetching) => {
		if (initialFetchFlag && !fetching) {
			runWhenModelReady('autoload');
		}
		initialFetchFlag = fetching;
	});

	let hadSession = !!get(modelSession);
	modelSession.subscribe((session) => {
		if (!hadSession && session) {
			runWhenModelReady('user');
		}
		hadSession = !!session;
	});

	let initialTemperature = true;
	temperature.subscribe((value) => {
		if (initialTemperature) {
			initialTemperature = false;
			return;
		}
		void import('~/utils/data').then(({ adjustTemperature }) => {
			adjustTemperature({
				tokenizer,
				logits: get(modelData).logits,
				temperature: value,
				sampling: get(sampling)
			});
		});
	});

	let initialSampling = true;
	sampling.subscribe((value) => {
		if (initialSampling) {
			initialSampling = false;
			return;
		}
		void import('~/utils/data').then(({ adjustTemperature }) => {
			adjustTemperature({
				tokenizer,
				logits: get(modelData).logits,
				temperature: get(temperature),
				sampling: value
			});
		});
	});

	selectedExampleIdx.subscribe((idx) => {
		if (idx >= 1 && idx <= 4 && !getCachedExample(idx)) {
			void loadExample(idx);
		}
	});
}
