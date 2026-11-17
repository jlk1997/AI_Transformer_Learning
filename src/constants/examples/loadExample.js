import { ex0 } from './ex0';

const cache = { 0: ex0 };

const loaders = {
	1: () => import('./ex1').then((m) => m.ex1),
	2: () => import('./ex2').then((m) => m.ex2),
	3: () => import('./ex3').then((m) => m.ex3),
	4: () => import('./ex4').then((m) => m.ex4)
};

/** Currently selected first-screen example (index 0) is already loaded. */
export function getCachedExample(idx) {
	return cache[idx];
}

export async function loadExample(idx) {
	if (idx === 0) return cache[0];
	if (cache[idx]) return cache[idx];
	const loader = loaders[idx];
	if (!loader) return undefined;
	const data = await loader();
	cache[idx] = data;
	return data;
}
