const CACHE_PREFIX = 'onnx-model-cache';
const CACHE_NAME = `${CACHE_PREFIX}-v2`;

/** Known GPT-2 v2 layout: 62 full 10MiB parts + last 6545544 bytes. */
const DEFAULT_PART_BYTES = 10485760;
const DEFAULT_LAST_PART_BYTES = 6545544;

/** Leave HTTP connections free so a course-switch JS chunk can load mid-download. */
const NET_CONCURRENCY = 2;

function expectedSize(index, total) {
	return index === total - 1 ? DEFAULT_LAST_PART_BYTES : DEFAULT_PART_BYTES;
}

function mapPool(items, limit, worker) {
	if (!items.length) return Promise.resolve([]);
	const results = new Array(items.length);
	let cursor = 0;
	const n = Math.min(Math.max(1, limit), items.length);
	const run = async () => {
		while (cursor < items.length) {
			const i = cursor++;
			results[i] = await worker(items[i], i);
		}
	};
	return Promise.all(Array.from({ length: n }, () => run())).then(() => results);
}

async function fetchModelChunks(chunkUrls, onProgress) {
	await clearOldCaches();

	const cache = await caches.open(CACHE_NAME);
	const cachedResponses = await Promise.all(chunkUrls.map((url) => cache.match(url)));
	const hasCache =
		cachedResponses.length === chunkUrls.length && cachedResponses.every((r) => !!r);

	const partsTotal = chunkUrls.length;
	const totalBytes = chunkUrls.reduce((acc, _u, i) => acc + expectedSize(i, partsTotal), 0);
	let partsDone = 0;
	let receivedBytes = 0;

	const report = () => {
		if (typeof onProgress === 'function') {
			onProgress({
				partsDone,
				partsTotal,
				receivedBytes,
				totalBytes,
				percent: totalBytes ? Math.min(100, (receivedBytes / totalBytes) * 100) : 0,
				hasCache
			});
		}
	};

	const buffers = new Array(chunkUrls.length);
	const needFetch = [];

	for (let index = 0; index < chunkUrls.length; index++) {
		if (cachedResponses[index]) {
			needFetch.push({ index, url: chunkUrls[index], cached: cachedResponses[index] });
		} else {
			needFetch.push({ index, url: chunkUrls[index], cached: null });
		}
	}

	// Cache reads can run in parallel; network gets a small pool so Vite course
	// chunks are not blocked by 63 model-v2 part requests on the same origin.
	const cachedItems = needFetch.filter((item) => item.cached);
	const netItems = needFetch.filter((item) => !item.cached);

	const readCached = async (item) => {
		const buf = await item.cached.arrayBuffer();
		partsDone += 1;
		receivedBytes += buf.byteLength;
		report();
		buffers[item.index] = buf;
	};

	const fetchOne = async (item) => {
		const response = await fetch(item.url, { priority: 'low' });
		if (!response.ok) {
			throw new Error(`Failed to fetch ${item.url}`);
		}
		cache.put(item.url, response.clone());
		const buf = await response.arrayBuffer();
		partsDone += 1;
		receivedBytes += buf.byteLength;
		report();
		buffers[item.index] = buf;
	};

	await Promise.all(cachedItems.map(readCached));
	await mapPool(netItems, NET_CONCURRENCY, fetchOne);

	return { hasCache, modelBuffers: buffers };
}

export async function fetchAndMergeChunks(urls, onProgress) {
	const { hasCache, modelBuffers: chunks } = await fetchModelChunks(urls, onProgress);
	const totalSize = chunks.reduce((acc, chunk) => acc + (chunk ? chunk.byteLength : 0), 0);
	if (!chunks.length || totalSize < 1024) {
		throw new Error('model bytes missing');
	}
	const blob = new Blob(chunks, { type: 'application/octet-stream' });
	return { hasCache, blob, totalSize };
}

async function clearOldCaches() {
	const cacheNames = await caches.keys();
	await Promise.all(
		cacheNames.map((name) => {
			if (name !== CACHE_NAME && name.includes(CACHE_PREFIX)) {
				console.log(`Deleting old cache: ${name}`);
				return caches.delete(name);
			}
		})
	);
}
