import type { ReviewState } from "../types";
import { dayStart } from "./storage";

/** 间隔重复的复习节点（天） */
export const STAGES_DAYS = [1, 3, 7, 15, 30];
const DAY_MS = 86400000;

/**
 * 根据本次作答结果推进该题的复习状态。
 * 答对：进入下一个间隔；答错：回到第 1 天重新开始。
 */
export function applyAnswer(
  prev: ReviewState | undefined,
  questionId: string,
  isCorrect: boolean,
  now: number = Date.now()
): ReviewState {
  const prevStage = prev?.stage ?? -1;
  const stage = isCorrect ? Math.min(prevStage + 1, STAGES_DAYS.length - 1) : 0;
  return {
    questionId,
    stage,
    nextReviewAt: dayStart(now) + STAGES_DAYS[stage] * DAY_MS,
    wrongCount: (prev?.wrongCount ?? 0) + (isCorrect ? 0 : 1)
  };
}

/** 该题今天是否到期需要复习 */
export function isDue(state: ReviewState, now: number = Date.now()): boolean {
  return state.nextReviewAt <= now;
}
