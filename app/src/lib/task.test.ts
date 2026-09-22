import { describe, expect, it } from "vitest";
import type { DailyTask } from "../types";
import { firstPendingIndex, markCompleted, pendingCount } from "./task";

function task(questionIds: string[], completed: string[]): DailyTask {
  return { date: "2026-09-22", questionIds, completed };
}

describe("firstPendingIndex", () => {
  it("没做过时从头开始", () => {
    expect(firstPendingIndex(task(["a", "b", "c"], []))).toBe(0);
  });

  it("回到中断的那一题", () => {
    expect(firstPendingIndex(task(["a", "b", "c", "d"], ["a", "b"]))).toBe(2);
  });

  it("跳着答过时，指向第一道没做的题", () => {
    expect(firstPendingIndex(task(["a", "b", "c"], ["b"]))).toBe(0);
  });

  it("全部做完时从头再来", () => {
    expect(firstPendingIndex(task(["a", "b"], ["a", "b"]))).toBe(0);
  });

  it("空任务返回 0", () => {
    expect(firstPendingIndex(task([], []))).toBe(0);
  });
});

describe("pendingCount", () => {
  it("统计未完成的题数", () => {
    expect(pendingCount(task(["a", "b", "c"], ["b"]))).toBe(2);
  });

  it("completed 里有任务外的 id 时不影响计数", () => {
    expect(pendingCount(task(["a", "b"], ["a", "zzz"]))).toBe(1);
  });
});

describe("markCompleted", () => {
  it("标记后不再出现在未完成里", () => {
    const next = markCompleted(task(["a", "b"], []), "a");
    expect(next.completed).toEqual(["a"]);
    expect(pendingCount(next)).toBe(1);
  });

  it("重复标记是幂等的", () => {
    const once = markCompleted(task(["a"], []), "a");
    expect(markCompleted(once, "a")).toBe(once);
  });

  it("任务外的 id 直接忽略（不改动对象）", () => {
    const original = task(["a"], []);
    expect(markCompleted(original, "zzz")).toBe(original);
  });
});
