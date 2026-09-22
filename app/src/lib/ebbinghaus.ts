import type { MasteryLevel, ReviewState } from "../types";
import { MASTERY_FACTOR } from "./mastery";
import { dayStart } from "./storage";

// 艾宾浩斯遗忘曲线的复习节点（天）。这是「无自评校准」时的基准节奏：
// 5 分钟 / 30 分钟这种日内节点对「每天 10 题」的日频产品没有意义，
// 所以取日粒度的经典序列 1 → 2 → 4 → 7 → 15 → 30 → 60。
export const BASE_INTERVALS = [1, 2, 4, 7, 15, 30, 60];
const DAY_MS = 86400000;
// 低于这个保持率就算「该复习了」。R = e^(-Δt / S)，S 取上次排定的间隔。
export const DUE_RETENTION = 0.7;

export function intervalsFor(mastery: MasteryLevel = "fuzzy"): number[] {
  const factor = MASTERY_FACTOR[mastery];
  return BASE_INTERVALS.map((d) => Math.max(1, Math.round(d * factor)));
}

/**
 * 记忆保持率估算（0–1）：R = e^(-Δt / S)。
 * S（稳定度）取上次排定的间隔天数；没排过就按 1 天算。
 * 纯函数，UI 与推荐都用它排序。
 */
export function retention(state: ReviewState | undefined, now: number = Date.now()): number {
  if (!state) return 0;
  const sinceDays = Math.max(0, (now - (state.lastReviewedAt ?? state.nextReviewAt)) / DAY_MS);
  const stability = Math.max(1, state.intervalDays ?? 1);
  return Math.exp(-sinceDays / stability);
}

/** 遗忘最狠的排最前（保持率越低越该先复习）。 */
export function byMostForgotten(now: number = Date.now()) {
  return (a: ReviewState, b: ReviewState) => retention(a, now) - retention(b, now);
}

/**
 * 一次作答后推进复习状态。
 *
 * - 答对：档位前进一档，间隔 = 该档间隔 × 熟练度倍率。
 * - 答错 / 简答判为未掌握：回到第 0 档（次日照面），并累计错误次数。
 * - mastery 传入用户当前的熟练度自评（见 lib/mastery.ts）。
 */
export function applyAnswer(
  prev: ReviewState | undefined,
  questionId: string,
  isCorrect: boolean,
  now: number = Date.now(),
  mastery: MasteryLevel = "fuzzy"
): ReviewState {
  const prevStage = prev?.stage ?? -1;
  const streakCorrect = isCorrect ? (prev?.streakCorrect ?? 0) + 1 : 0;
  const stage = isCorrect ? Math.min(prevStage + 1, BASE_INTERVALS.length - 1) : 0;
  const intervalDays = intervalsFor(mastery)[stage];
  return {
    questionId,
    stage,
    nextReviewAt: dayStart(now) + intervalDays * DAY_MS,
    wrongCount: (prev?.wrongCount ?? 0) + (isCorrect ? 0 : 1),
    lastReviewedAt: now,
    intervalDays,
    streakCorrect
  };
}

/** 该题现在是否该复习：过了排定时间，或保持率已跌破阈值。 */
export function isDue(state: ReviewState, now: number = Date.now()): boolean {
  return state.nextReviewAt <= now || retention(state, now) < DUE_RETENTION;
}

/** 距离下次到期的天数（负数=已过期），用于 UI 文案。 */
export function daysUntilDue(state: ReviewState, now: number = Date.now()): number {
  return Math.ceil((state.nextReviewAt - now) / DAY_MS);
}
