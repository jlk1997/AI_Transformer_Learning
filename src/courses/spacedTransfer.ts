import type { CourseId } from '~/store/course';

/** Count short paths already walked. Text, image, and music each count once. */
export function completedShortPathCount(
	textDone: boolean,
	imageDone: boolean,
	musicDone: boolean
): number {
	return Number(!!textDone) + Number(!!imageDone) + Number(!!musicDone);
}

/** Optional spaced 金题 after more than one short path, not an LMS schedule. */
export function isSpacedTransferAvailable(
	textDone: boolean,
	imageDone: boolean,
	musicDone: boolean
): boolean {
	return completedShortPathCount(textDone, imageDone, musicDone) >= 2;
}

export type SpacedPointer = { pageId: string; stationId: string };

export type SpacedTransferItem = {
	id: 'step' | 'knobs';
	qKey: 'q1' | 'q2';
	aKey: 'q1a' | 'q2a';
	bKey: 'q1b' | 'q2b';
	whyKey: 'q1why' | 'q2why';
	ok: 0 | 1;
	pointer: SpacedPointer;
};

const POINTERS: Record<CourseId, Record<'step' | 'knobs', SpacedPointer>> = {
	text: {
		step: { pageId: 'temperature', stationId: 'generate' },
		knobs: { pageId: 'temperature', stationId: 'knobs' }
	},
	image: {
		step: { pageId: 'same-step', stationId: 'step' },
		knobs: { pageId: 'cfg', stationId: 'knobs' }
	},
	music: {
		step: { pageId: 'same-step', stationId: 'step' },
		knobs: { pageId: 'sampling-not-weights', stationId: 'knobs' }
	},
	finetune: {
		step: { pageId: 'still-next-token', stationId: 'map' },
		knobs: { pageId: 'temp-after-ft', stationId: 'compare' }
	}
};

export function spacedTransferItems(course: CourseId): SpacedTransferItem[] {
	const p = POINTERS[course] ?? POINTERS.text;
	return [
		{
			id: 'step',
			qKey: 'q1',
			aKey: 'q1a',
			bKey: 'q1b',
			whyKey: 'q1why',
			ok: 1,
			pointer: p.step
		},
		{
			id: 'knobs',
			qKey: 'q2',
			aKey: 'q2a',
			bKey: 'q2b',
			whyKey: 'q2why',
			ok: 1,
			pointer: p.knobs
		}
	];
}
