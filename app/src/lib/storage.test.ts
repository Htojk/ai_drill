import { beforeEach, describe, expect, it } from "vitest";
import {
  appendRecord,
  appendReport,
  exportProgress,
  importProgress,
  loadBookmarks,
  loadProfile,
  loadRecords,
  loadReports,
  resetProgress,
  saveProfile,
  toggleBookmark
} from "./storage";
import type { AnswerRecord } from "../types";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

const record = (id: string, isCorrect: boolean): AnswerRecord => ({
  questionId: id,
  chosen: ["A"],
  isCorrect,
  durationMs: 1200,
  mode: "daily",
  answeredAt: 1758500000000
});

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
});

describe("答题记录", () => {
  it("追加后能读回", () => {
    appendRecord(record("q1", true));
    appendRecord(record("q2", false));
    const all = loadRecords();
    expect(all).toHaveLength(2);
    expect(all[1].questionId).toBe("q2");
  });
});

describe("收藏", () => {
  it("切换两次回到原状", () => {
    expect(loadBookmarks()).toEqual([]);
    expect(toggleBookmark("q1")).toEqual(["q1"]);
    expect(toggleBookmark("q2")).toEqual(["q1", "q2"]);
    expect(toggleBookmark("q1")).toEqual(["q2"]);
  });
});

describe("题目反馈", () => {
  it("追加后可读回，且带原因与时间", () => {
    appendReport({ questionId: "q1", reason: "wrong_answer", createdAt: 1758500000000 });
    const all = loadReports();
    expect(all).toHaveLength(1);
    expect(all[0].reason).toBe("wrong_answer");
  });
});

describe("进度导出码", () => {
  it("导出后再导入，记录与画像都能还原", () => {
    appendRecord(record("q1", true));
    saveProfile({ streak: 3, lastActiveDate: "2026-09-22", totalAnswered: 1, totalCorrect: 1, onboarded: true });
    toggleBookmark("q1");
    appendReport({ questionId: "q1", reason: "unclear", createdAt: 1758500000000 });

    const code = exportProgress();
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
    expect(loadRecords()).toHaveLength(0);

    const res = importProgress(code);
    expect(res.ok).toBe(true);
    expect(loadRecords()).toHaveLength(1);
    expect(loadProfile().streak).toBe(3);
    expect(loadBookmarks()).toEqual(["q1"]);
    expect(loadReports()).toHaveLength(1);
  });

  it("版本不匹配时拒绝导入", () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify({ version: 99 }))));
    const res = importProgress(code);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("版本");
  });

  it("乱码输入不抛异常，返回失败", () => {
    const res = importProgress("这不是进度码!!!");
    expect(res.ok).toBe(false);
  });

  it("导入容忍缺失字段（老版本导出码）", () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify({ version: 1 }))));
    const res = importProgress(code);
    expect(res.ok).toBe(true);
    expect(loadReports()).toEqual([]);
  });
});

describe("重置", () => {
  it("清空记录、画像与反馈", () => {
    appendRecord(record("q1", true));
    appendReport({ questionId: "q1", reason: "other", createdAt: 1 });
    resetProgress();
    expect(loadRecords()).toEqual([]);
    expect(loadReports()).toEqual([]);
  });
});
