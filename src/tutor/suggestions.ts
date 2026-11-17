import { TEXT_PATH_IDS } from '~/courses/textPath';

export type TutorChip = {
	id: string;
	label: string;
	question: string;
};

export const RESEARCH_PAGE_IDS = new Set(['further-reading']);

export type TutorOverlay = {
	contrast?: boolean;
	workbench?: boolean;
	textbookOpen?: boolean;
	textbookPage?: string | null;
};

export function contrastOverlayVisible(): boolean {
	if (typeof document === 'undefined') return false;
	const el = document.querySelector('[data-te-contrast="overlay"]') as HTMLElement | null;
	if (!el) return false;
	const st = getComputedStyle(el);
	if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
	const r = el.getBoundingClientRect();
	return r.width > 0 && r.height > 0;
}

export function overlayStationId(overlay?: TutorOverlay | null): string | null {
	if (!overlay) return null;
	if (overlay.contrast && contrastOverlayVisible()) return 'contrast';
	if (overlay.textbookOpen && overlay.textbookPage && RESEARCH_PAGE_IDS.has(overlay.textbookPage)) {
		return 'research';
	}
	if (overlay.workbench) return 'workbench';
	return null;
}

const IMAGE_IDS = ['map', 'step', 'again', 'knobs', 'invite'] as const;
const MUSIC_IDS = ['map', 'step', 'listen', 'knobs', 'invite'] as const;

export function currentTutorStationId(
	courseId: string,
	coachIdx: number,
	spine?: string | null,
	overlay?: TutorOverlay | null
): string {
	const over = overlayStationId(overlay);
	if (over) return over;
	const i = Math.max(0, coachIdx || 0);
	if (courseId === 'text') return TEXT_PATH_IDS[Math.min(i, TEXT_PATH_IDS.length - 1)];
	if (courseId === 'image') return IMAGE_IDS[Math.min(i, IMAGE_IDS.length - 1)];
	if (courseId === 'music') return MUSIC_IDS[Math.min(i, MUSIC_IDS.length - 1)];
	if (courseId === 'finetune') {
		const raw = spine || 'see';
		const alias: Record<string, string> = {
			see: 'map',
			preview: 'pack',
			train: 'start',
			watching: 'start'
		};
		return alias[raw] || raw;
	}
	return 'map';
}

export function askPlaceholder(courseId: string, stationId: string, zh: boolean): string {
	if (stationId === 'contrast') {
		if (courseId === 'image') return zh ? '问这一步，例如：这层对照帘是什么？' : 'Ask about this step, e.g. what is this contrast curtain?';
		if (courseId === 'music') return zh ? '问这一步，例如：这层对照帘是什么？' : 'Ask about this step, e.g. what is this contrast curtain?';
		return zh ? '问这一步，例如：这层对照帘是什么？' : 'Ask about this step, e.g. what is this contrast curtain?';
	}
	if (stationId === 'workbench') {
		return zh ? '问这一步，例如：学习工作台是什么？' : 'Ask about this step, e.g. what is the learning workbench?';
	}
	if (stationId === 'research') {
		return zh ? '问这一步，例如：走向研究是在说什么？' : 'Ask about this step, e.g. what is Toward research saying?';
	}
	if (courseId === 'image') {
		if (stationId === 'step' || stationId === 'again') {
			return zh ? '问这一步，例如：再去噪一步会怎样？' : 'Ask about this step, e.g. what happens if I denoise one step?';
		}
		if (stationId === 'invite') {
			return zh ? '问这一步，例如：书库里有什么？' : 'Ask about this step, e.g. what is in the Library?';
		}
		return zh ? '问这一步，例如：中间这张图是什么？' : 'Ask about this step, e.g. what is the picture in the middle?';
	}
	if (courseId === 'music') {
		if (stationId === 'step') {
			return zh ? '问这一步，例如：下一个音是怎么选的？' : 'Ask about this step, e.g. how is the next note chosen?';
		}
		if (stationId === 'listen') {
			return zh ? '问这一步，例如：试听在听什么？' : 'Ask about this step, e.g. what does Listen play?';
		}
		if (stationId === 'invite') {
			return zh ? '问这一步，例如：书库里有什么？' : 'Ask about this step, e.g. what is in the Library?';
		}
		return zh ? '问这一步，例如：虚线那个音是什么？' : 'Ask about this step, e.g. what is the dashed next note?';
	}
	if (courseId === 'finetune') {
		if (stationId === 'pack') {
			return zh ? '问这一步，例如：这些词片是什么？' : 'Ask about this step, e.g. what are these token pieces?';
		}
		if (stationId === 'baseline') {
			return zh ? '问这一步，例如：微调前的续写是什么？' : 'Ask about this step, e.g. what is the before-training continuation?';
		}
		if (stationId === 'loss') {
			return zh ? '问这一步，例如：损失是什么？' : 'Ask about this step, e.g. what is loss?';
		}
		if (stationId === 'explore') {
			return zh ? '问这一步，例如：再深挖里面有什么？' : 'Ask about this step, e.g. what is behind Go deeper?';
		}
		return zh ? '问这一步，例如：现在做这件事是什么？' : 'Ask about this step, e.g. what should I do now?';
	}
	if (stationId === 'tokens') {
		return zh ? '问这一步，例如：左边这些词片是什么？' : 'Ask about this step, e.g. what are the chips on the left?';
	}
	if (stationId === 'attention') {
		return zh ? '问这一步，例如：中间的线是什么？' : 'Ask about this step, e.g. what are the lines in the middle?';
	}
	if (stationId === 'invite') {
		return zh ? '问这一步，例如：书库里有什么？' : 'Ask about this step, e.g. what is in the Library?';
	}
	return zh ? '问这一步，例如：右边表是什么？' : 'Ask about this step, e.g. what is the table on the right?';
}

function contextChip(courseId: string, stationId: string, zh: boolean): TutorChip {
	if (stationId === 'contrast') {
		return {
			id: 'q-here',
			label: zh ? '这层对照帘是什么' : 'What this contrast curtain is',
			question: zh ? '这层对照帘是什么？' : 'What is this contrast curtain?'
		};
	}
	if (stationId === 'workbench') {
		return {
			id: 'q-here',
			label: zh ? '学习工作台是什么' : 'What the workbench is',
			question: zh ? '学习工作台是什么？' : 'What is the learning workbench?'
		};
	}
	if (stationId === 'research') {
		return {
			id: 'q-here',
			label: zh ? '走向研究是在说什么' : 'What Toward research is saying',
			question: zh ? '走向研究是在说什么？' : 'What is Toward research saying?'
		};
	}
	if (courseId === 'image') {
		if (stationId === 'step' || stationId === 'again') {
			return {
				id: 'q-here',
				label: zh ? '再去噪一步会怎样' : 'What denoise-one-step does',
				question: zh ? '再去噪一步会怎样？' : 'What happens if I denoise one step?'
			};
		}
		if (stationId === 'knobs') {
			return {
				id: 'q-here',
				label: zh ? '这些旋钮现在能干什么' : 'What these knobs do now',
				question: zh ? '这些旋钮现在能干什么？' : 'What can these knobs do now?'
			};
		}
		if (stationId === 'invite') {
			return {
				id: 'q-here',
				label: zh ? '书库里有什么' : 'What is in the Library',
				question: zh ? '书库里有什么？' : 'What is in the Library?'
			};
		}
		return {
			id: 'q-here',
			label: zh ? '中间这张图是什么' : 'The picture in the middle',
			question: zh ? '中间这张图是什么？' : 'What is the picture in the middle?'
		};
	}
	if (courseId === 'music') {
		if (stationId === 'step') {
			return {
				id: 'q-here',
				label: zh ? '下一个音是怎么选的' : 'How the next note is chosen',
				question: zh ? '下一个音是怎么选的？' : 'How is the next note chosen?'
			};
		}
		if (stationId === 'listen') {
			return {
				id: 'q-here',
				label: zh ? '试听在听什么' : 'What Listen plays',
				question: zh ? '试听在听什么？' : 'What does Listen play?'
			};
		}
		if (stationId === 'knobs') {
			return {
				id: 'q-here',
				label: zh ? '这些旋钮现在能干什么' : 'What these knobs do now',
				question: zh ? '这些旋钮现在能干什么？' : 'What can these knobs do now?'
			};
		}
		if (stationId === 'invite') {
			return {
				id: 'q-here',
				label: zh ? '书库里有什么' : 'What is in the Library',
				question: zh ? '书库里有什么？' : 'What is in the Library?'
			};
		}
		return {
			id: 'q-here',
			label: zh ? '虚线那个音是什么' : 'The dashed next note',
			question: zh ? '虚线那个音是什么？' : 'What is the dashed next note?'
		};
	}
	if (courseId === 'finetune') {
		if (stationId === 'pack') {
			return {
				id: 'q-here',
				label: zh ? '这些词片是什么' : 'What these token pieces are',
				question: zh ? '这些词片是什么？' : 'What are these token pieces?'
			};
		}
		if (stationId === 'baseline') {
			return {
				id: 'q-here',
				label: zh ? '微调前的续写是什么' : 'The before-training continuation',
				question: zh ? '微调前的续写是什么？' : 'What is the before-training continuation?'
			};
		}
		if (stationId === 'start') {
			return {
				id: 'q-here',
				label: zh ? '极短跑是什么' : 'What a short run is',
				question: zh ? '极短跑是什么？' : 'What is a short run?'
			};
		}
		if (stationId === 'compare') {
			return {
				id: 'q-here',
				label: zh ? '对照是在看什么' : 'What the comparison is showing',
				question: zh ? '对照是在看什么？' : 'What is the comparison showing?'
			};
		}
		if (stationId === 'loss') {
			return {
				id: 'q-here',
				label: zh ? '损失是什么' : 'What loss is',
				question: zh ? '损失是什么？' : 'What is loss?'
			};
		}
		if (stationId === 'method') {
			return {
				id: 'q-here',
				label: zh ? '改的是哪一块' : 'Which piece we change',
				question: zh ? '改的是哪一块？' : 'Which piece are we changing?'
			};
		}
		if (stationId === 'explore') {
			return {
				id: 'q-here',
				label: zh ? '再深挖里面有什么' : 'What is behind Go deeper',
				question: zh ? '再深挖里面有什么？' : 'What is behind Go deeper?'
			};
		}
		return {
			id: 'q-here',
			label: zh ? '现在做这件事是什么' : 'What I should do now',
			question: zh ? '现在做这件事是什么？' : 'What should I do now?'
		};
	}
	if (stationId === 'tokens') {
		return {
			id: 'q-here',
			label: zh ? '左边这些词片是什么' : 'The chips on the left',
			question: zh ? '左边这些词片是什么？' : 'What are the chips on the left?'
		};
	}
	if (stationId === 'attention') {
		return {
			id: 'q-here',
			label: zh ? '中间的线是什么' : 'The lines in the middle',
			question: zh ? '中间的线是什么？' : 'What are the lines in the middle?'
		};
	}
	if (stationId === 'layers') {
		return {
			id: 'q-here',
			label: zh ? '层和头是什么' : 'What layer and head are',
			question: zh ? '层和头是什么？' : 'What are layer and head?'
		};
	}
	if (stationId === 'residual') {
		return {
			id: 'q-here',
			label: zh ? '残差是什么' : 'What the residual is',
			question: zh ? '残差是什么？' : 'What is the residual?'
		};
	}
	if (stationId === 'knobs') {
		return {
			id: 'q-here',
			label: zh ? '这些旋钮现在能干什么' : 'What these knobs do now',
			question: zh ? '这些旋钮现在能干什么？' : 'What can these knobs do now?'
		};
	}
	if (stationId === 'invite') {
		return {
			id: 'q-here',
			label: zh ? '书库里有什么' : 'What is in the Library',
			question: zh ? '书库里有什么？' : 'What is in the Library?'
		};
	}
	return {
		id: 'q-here',
		label: zh ? '右边表是什么' : 'The right-hand table',
		question: zh ? '右边表是什么？' : 'What is the table on the right?'
	};
}

export function suggestedAsks(courseId: string, stationId: string, zh: boolean): TutorChip[] {
	const screen: TutorChip = {
		id: 'q-screen',
		label: zh ? '这个画面现在是在干什么' : 'What is this screen doing',
		question: zh ? '我刚进来，这个画面现在是在干什么？' : 'I just arrived. What is this screen doing right now?'
	};
	return [screen, contextChip(courseId, stationId, zh)];
}
