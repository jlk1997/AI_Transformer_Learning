/** Set or clear a teaching hash without wiping SvelteKit history state. */
export function replaceTeachingHash(hash: string) {
	if (typeof location === 'undefined' || typeof history === 'undefined') return;
	const url = new URL(location.href);
	const next = !hash ? '' : hash.startsWith('#') ? hash : `#${hash}`;
	if ((url.hash || '') === next) return;
	url.hash = next;
	try {
		history.replaceState(history.state ?? {}, '', url.href);
	} catch {
		try {
			location.hash = next;
		} catch {
			/* ignore */
		}
	}
}

export const FT_LATER_HASHES = ['#ft-depth', '#explore', '#ft-eval', '#ft-dpo', '#ft-qlora', '#ft-map'] as const;

export type FtLaterHash = (typeof FT_LATER_HASHES)[number];

export function isFtLaterHash(hash?: string | null): hash is FtLaterHash {
	return !!hash && (FT_LATER_HASHES as readonly string[]).includes(hash);
}

export const RESEARCH_HASH = {
	text: '#text-explore',
	image: '#image-explore',
	music: '#music-explore'
} as const;

export type ResearchHash = (typeof RESEARCH_HASH)[keyof typeof RESEARCH_HASH];

export function isResearchHash(hash?: string | null): hash is ResearchHash {
	return !!hash && (Object.values(RESEARCH_HASH) as string[]).includes(hash);
}

export function courseFromResearchHash(
	hash?: string | null
): 'text' | 'image' | 'music' | null {
	if (hash === RESEARCH_HASH.text) return 'text';
	if (hash === RESEARCH_HASH.image) return 'image';
	if (hash === RESEARCH_HASH.music) return 'music';
	return null;
}
