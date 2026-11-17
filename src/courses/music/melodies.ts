export type Note = { pitch: number; dur: number; start: number };

export type MelodyExample = {
	id: string;
	labelZh: string;
	labelEn: string;
	conditionZh: string;
	conditionEn: string;
	mode: 'major' | 'minor' | 'pentatonic';
	tonic: number;
	notes: Note[];
	hintZh: string;
	hintEn: string;
};

/** Durations are in sixteenth-notes. Pitch is MIDI. */
export const MUSIC_EXAMPLES: MelodyExample[] = [
	{
		id: 'star',
		labelZh: '小星星开头（大调）',
		labelEn: 'Twinkle opening (major)',
		conditionZh: '大调 · 简单童谣',
		conditionEn: 'Major · nursery tune',
		mode: 'major',
		tonic: 60,
		notes: [
			{ pitch: 60, dur: 4, start: 0 },
			{ pitch: 60, dur: 4, start: 4 },
			{ pitch: 67, dur: 4, start: 8 },
			{ pitch: 67, dur: 4, start: 12 },
			{ pitch: 69, dur: 4, start: 16 },
			{ pitch: 69, dur: 4, start: 20 },
			{ pitch: 67, dur: 8, start: 24 }
		],
		hintZh: '注意 C-C-G-G-A-A-G 的重复音型，后面生成时注意力常会回看这些音。',
		hintEn: 'Watch the C-C-G-G-A-A-G motif; later attention often looks back here.'
	},
	{
		id: 'scale',
		labelZh: '上行大调音阶',
		labelEn: 'Rising major scale',
		conditionZh: '大调 · 音阶练习',
		conditionEn: 'Major · scale',
		mode: 'major',
		tonic: 60,
		notes: [
			{ pitch: 60, dur: 2, start: 0 },
			{ pitch: 62, dur: 2, start: 2 },
			{ pitch: 64, dur: 2, start: 4 },
			{ pitch: 65, dur: 2, start: 6 },
			{ pitch: 67, dur: 2, start: 8 },
			{ pitch: 69, dur: 2, start: 10 }
		],
		hintZh: '这是一级一级往上走。温度低时，模型更愿意继续走音阶。',
		hintEn: 'It climbs step by step. At low temperature the model tends to continue the scale.'
	},
	{
		id: 'minor',
		labelZh: '小调短动机',
		labelEn: 'Short minor motif',
		conditionZh: '小调 · 略忧郁',
		conditionEn: 'Minor · a little somber',
		mode: 'minor',
		tonic: 57,
		notes: [
			{ pitch: 57, dur: 4, start: 0 },
			{ pitch: 60, dur: 2, start: 4 },
			{ pitch: 62, dur: 2, start: 6 },
			{ pitch: 64, dur: 8, start: 8 },
			{ pitch: 62, dur: 4, start: 16 }
		],
		hintZh: '把条件改成大调再生成，走向往往会往更亮的音靠。',
		hintEn: 'Switch the condition to major and later notes often turn brighter.'
	},
	{
		id: 'penta',
		labelZh: '五声音阶短句',
		labelEn: 'Pentatonic phrase',
		conditionZh: '五声 · 空旷',
		conditionEn: 'Pentatonic · open',
		mode: 'pentatonic',
		tonic: 62,
		notes: [
			{ pitch: 62, dur: 4, start: 0 },
			{ pitch: 64, dur: 4, start: 4 },
			{ pitch: 67, dur: 4, start: 8 },
			{ pitch: 69, dur: 4, start: 12 },
			{ pitch: 67, dur: 8, start: 16 }
		],
		hintZh: '候选音会更集中在五声里，少出现偏音。',
		hintEn: 'Candidates stay in the pentatonic set; “outside” notes are rarer.'
	},
	{
		id: 'motif',
		labelZh: '带重复主题的短句',
		labelEn: 'Phrase with a repeated motif',
		conditionZh: '大调 · 主题再现',
		conditionEn: 'Major · motif return',
		mode: 'major',
		tonic: 60,
		notes: [
			{ pitch: 64, dur: 2, start: 0 },
			{ pitch: 67, dur: 2, start: 2 },
			{ pitch: 64, dur: 4, start: 4 },
			{ pitch: 60, dur: 4, start: 8 },
			{ pitch: 64, dur: 2, start: 12 },
			{ pitch: 67, dur: 2, start: 14 }
		],
		hintZh: '前三个音是一个小主题。后面再出现时，注意力往往会亮在开头那几个音上。',
		hintEn: 'The first three notes are a motif; later attention often lights those earlier notes.'
	}
];

export const MUSIC_TEMPS = [0.2, 0.8, 1.4];
export const PITCH_MIN = 55;
export const PITCH_MAX = 79;

export const MODE_SETS: Record<MelodyExample['mode'], number[]> = {
	major: [0, 2, 4, 5, 7, 9, 11],
	minor: [0, 2, 3, 5, 7, 8, 10],
	pentatonic: [0, 2, 4, 7, 9]
};
