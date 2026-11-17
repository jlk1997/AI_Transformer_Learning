import type { CourseId } from '~/store/course';
import { TEXT_PATH_IDS, type TextPathId } from '~/courses/textPath';

export type PathStation = {
	id: string;
	titleZh: string;
	titleEn: string;
};

export type PathStage = {
	id: CourseId;
	titleZh: string;
	titleEn: string;
	blurbZh: string;
	blurbEn: string;
	stations: PathStation[];
};

export const LEARNING_STAGES: PathStage[] = [
	{
		id: 'text',
		titleZh: '文字：猜下一个词',
		titleEn: 'Text: guess the next word',
		blurbZh: '先看见它抽出一个词，再看词片、亮线和残差。',
		blurbEn: 'First watch it draw a word, then see pieces, lit lines, and the residual.',
		stations: [
			{ id: 'generate', titleZh: '猜出一个词', titleEn: 'See a word guessed' },
			{ id: 'tokens', titleZh: '看见词片', titleEn: 'See token pieces' },
			{ id: 'attention', titleZh: '看见亮线', titleEn: 'See lit lines' },
			{ id: 'layers', titleZh: '换层和头', titleEn: 'Change layer and head' },
			{ id: 'residual', titleZh: '对上残差', titleEn: 'Match the residual' },
			{ id: 'knobs', titleZh: '再拧抽词旋钮', titleEn: 'Then turn the knobs' },
			{ id: 'invite', titleZh: '走向研究', titleEn: 'Toward research' },
			{ id: 'explore', titleZh: '本课实验室', titleEn: 'Labs in this course' }
		]
	},
	{
		id: 'finetune',
		titleZh: '微调：让它跟你的文字走',
		titleEn: 'Fine-tune: make it follow your text',
		blurbZh: '改的是权重，不是温度。主线走到对照后，再看「损失是什么」。',
		blurbEn: 'This changes weights, not temperature. After the comparison, see what loss is.',
		stations: [
			{ id: 'map', titleZh: '分清抽样和训练', titleEn: 'Sampling vs training' },
			{ id: 'pack', titleZh: '看见分词', titleEn: 'See tokenization' },
			{ id: 'baseline', titleZh: '存下基线', titleEn: 'Save a baseline' },
			{ id: 'start', titleZh: '做一次极短跑', titleEn: 'Do a short run' },
			{ id: 'compare', titleZh: '看前后对照', titleEn: 'Compare before and after' },
			{ id: 'loss', titleZh: '损失是什么', titleEn: 'What loss is' },
			{ id: 'method', titleZh: '看改的是哪一块', titleEn: 'See which piece we change' },
			{ id: 'explore', titleZh: '再深挖', titleEn: 'Go deeper' }
		]
	},
	{
		id: 'image',
		titleZh: '图片：再去噪一步',
		titleEn: 'Image: denoise one step',
		blurbZh: '先看画布，再点「再去噪一步」。这和文字课一次猜一个词，是同一件事的另一种看见。',
		blurbEn: 'Look at the canvas, then denoise one step. It is another way of seeing the same idea as guessing the next word.',
		stations: [
			{ id: 'map', titleZh: '看清画布', titleEn: 'Map the canvas' },
			{ id: 'step', titleZh: '再去噪一步', titleEn: 'Denoise one step' },
			{ id: 'again', titleZh: '再走几步', titleEn: 'Take a few more steps' },
			{ id: 'knobs', titleZh: '再拧引导', titleEn: 'Then try guidance' },
			{ id: 'invite', titleZh: '教材在书库', titleEn: 'Textbook is in the Library' },
			{ id: 'explore', titleZh: '走向研究', titleEn: 'Toward research' }
		]
	},
	{
		id: 'music',
		titleZh: '音乐：猜下一个音',
		titleEn: 'Music: guess the next note',
		blurbZh: '和文字课是同一件事：一次只猜下一个音。',
		blurbEn: 'The same idea as the text course: guess only the next note.',
		stations: [
			{ id: 'map', titleZh: '看清三块', titleEn: 'Map the three parts' },
			{ id: 'step', titleZh: '写出下一个音', titleEn: 'Write the next note' },
			{ id: 'listen', titleZh: '听一听', titleEn: 'Listen' },
			{ id: 'knobs', titleZh: '再拧旋钮', titleEn: 'Then try the knobs' },
			{ id: 'invite', titleZh: '教材在书库', titleEn: 'Textbook is in the Library' },
			{ id: 'explore', titleZh: '走向研究', titleEn: 'Toward research' }
		]
	}
];

export const TEXT_STATION_IDS = TEXT_PATH_IDS as readonly TextPathId[];

export function stageByCourse(course: CourseId): PathStage {
	return LEARNING_STAGES.find((s) => s.id === course) ?? LEARNING_STAGES[0];
}

export function stationIndexById(courseId: CourseId, id: string): number {
	const i = stageByCourse(courseId).stations.findIndex((s) => s.id === id);
	return i < 0 ? 0 : i;
}
