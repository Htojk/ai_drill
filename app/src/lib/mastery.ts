import type { GradeVerdict, MasteryLevel, MasteryState } from "../types";

// 熟练度三档。顺序即 UI 展示顺序（由轻到重）。
export const MASTERY_LEVELS: MasteryLevel[] = ["unknown", "fuzzy", "mastered"];

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  unknown: "未掌握",
  fuzzy: "模糊",
  mastered: "已掌握"
};

// 熟练度对复习间隔的倍率：越熟练，间隔拉得越长，复习次数越少。
// 这是「艾宾浩斯曲线 + 自评校准」的结合点。
export const MASTERY_FACTOR: Record<MasteryLevel, number> = {
  mastered: 2,
  fuzzy: 1,
  unknown: 0.5
};

// 由一次作答结果推断熟练度（自动写入，explicit = false）。
// 查看答案一律视为未掌握 —— 产品硬规则：看了答案就算不上掌握，
// 哪怕随后选对了也不改写它（显式自评/更晚的记录优先，见 resolveMastery）。
export function inferMastery(outcome: {
  isCorrect: boolean;
  viewedAnswer?: boolean;
  verdict?: GradeVerdict;
}): MasteryLevel {
  if (outcome.viewedAnswer) return "unknown";
  if (outcome.verdict) {
    if (outcome.verdict === "correct") return "mastered";
    if (outcome.verdict === "partial") return "fuzzy";
    return "unknown";
  }
  return outcome.isCorrect ? "mastered" : "unknown";
}

// 合并新旧熟练度记录。
// 规则：用户的显式选择最优先；同为自动推断时取更晚的一次。
// 这样「先选了已掌握 → 之后答错」不会粗暴覆盖用户的自评。
export function resolveMastery(
  prev: MasteryState | undefined,
  questionId: string,
  incoming: { level: MasteryLevel; explicit: boolean; updatedAt: number }
): MasteryState {
  const next: MasteryState = { questionId, ...incoming };
  if (!prev) return next;
  if (prev.explicit && !incoming.explicit) return prev;
  if (!prev.explicit && incoming.explicit) return next;
  return incoming.updatedAt >= prev.updatedAt ? next : prev;
}

// 取某题的熟练度，缺省视为「未掌握」（没练过 = 不会）。
export function levelOf(states: Record<string, MasteryState>, questionId: string): MasteryLevel {
  return states[questionId]?.level ?? "unknown";
}
