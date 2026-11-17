export type ImagePrompt = {
	id: string;
	labelZh: string;
	labelEn: string;
	prompt: string;
	hintZh: string;
	hintEn: string;
};

export const IMAGE_PROMPTS: ImagePrompt[] = [
	{
		id: 'sailboat',
		labelZh: '日落海边的红帆船',
		labelEn: 'Red sailboat at sunset',
		prompt: 'a red sailboat on a calm blue sea at sunset',
		hintZh: '看橙红天空、海面和红色三角帆是否一起出现。',
		hintEn: 'Look for the orange sky, the sea, and a red triangular sail.'
	},
	{
		id: 'house',
		labelZh: '绿树下的小黄房子',
		labelEn: 'Yellow house under a tree',
		prompt: 'a small yellow house under a green tree',
		hintZh: '看黄墙、红屋顶和旁边的绿树冠。',
		hintEn: 'Look for a yellow wall, a red roof, and a green crown.'
	},
	{
		id: 'moon',
		labelZh: '紫山之上的弯月',
		labelEn: 'Crescent moon over mountains',
		prompt: 'a crescent moon over purple mountains',
		hintZh: '看深色夜空、紫色山脊和一弯亮月。',
		hintEn: 'Look for a night sky, purple ridges, and a bright crescent.'
	},
	{
		id: 'cat',
		labelZh: '窗边晒太阳的白猫',
		labelEn: 'White cat in a window',
		prompt: 'a white cat sitting in a sunlit window',
		hintZh: '看窗框、暖光和一团白色的猫。',
		hintEn: 'Look for the window frame, warm light, and a white cat shape.'
	},
	{
		id: 'teacup',
		labelZh: '木桌上的热茶杯',
		labelEn: 'Steaming tea cup',
		prompt: 'a steaming tea cup on a wooden table',
		hintZh: '看木桌纹理、杯子和上升的热气。',
		hintEn: 'Look for the wooden table, the cup, and rising steam.'
	}
];

export const IMAGE_SEEDS = [1, 7, 13, 21, 42];
export const IMAGE_CFG_PRESETS = [1, 7, 15];
export const IMAGE_STEP_PRESETS = [4, 20, 50];
export type ImageScheduler = 'euler' | 'ddim';
