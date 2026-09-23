import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrap, cancelScheduledUpload, clearSyncState, loadRevision, pull, push, saveRevision, scheduleUpload, subscribe } from "./sync";
import { saveSession, clearSession } from "./session";
import { appendRecord, loadRecords, saveProfile } from "./storage";
import type { ProgressPayload } from "../types";

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

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function payload(patch: Partial<ProgressPayload> = {}): ProgressPayload {
  return {
    records: [],
    reviews: {},
    profile: { streak: 0, lastActiveDate: "", totalAnswered: 0, totalCorrect: 0, onboarded: false },
    bookmarks: [],
    reports: [],
    mastery: {},
    tasks: {},
    ...patch
  };
}

const calls: { method: string; url: string; body: unknown }[] = [];
let unsubscribe: (() => void) | null = null;
let events: string[] = [];

function stubFetch(handler: (method: string, url: string) => unknown) {
  (globalThis as { fetch?: unknown }).fetch = (url: string, init: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(handler(method, url));
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  calls.length = 0;
  events = [];
  unsubscribe = subscribe((event) => events.push(event.type));
});

afterEach(() => {
  cancelScheduledUpload();
  unsubscribe?.();
  unsubscribe = null;
  delete (globalThis as { fetch?: unknown }).fetch;
  vi.useRealTimers();
});

describe("pull", () => {
  it("未登录时不碰网络", async () => {
    stubFetch(() => respond(200, {}));
    await pull();
    expect(calls).toHaveLength(0);
  });

  it("把远端进度并进本地，并广播 applied", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    stubFetch(() =>
      respond(200, {
        revision: 7,
        updatedAt: "now",
        payload: payload({ bookmarks: ["q-remote"], profile: { streak: 4, lastActiveDate: "2026-09-23", totalAnswered: 9, totalCorrect: 8, onboarded: true } })
      })
    );
    await pull();
    expect(loadRevision()).toBe(7);
    expect(events).toEqual(["applied"]);
  });

  it("远端没有包时只记 revision，不发事件", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    stubFetch(() => respond(200, { revision: 3, payload: null, updatedAt: null }));
    await pull();
    expect(loadRevision()).toBe(3);
    expect(events).toEqual([]);
  });

  it("远端与本地等价时不写库也不发事件（避免每次开应用都白写一遍）", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    appendRecord({ questionId: "q1", chosen: ["A"], isCorrect: true, durationMs: 1, mode: "daily", answeredAt: 100 });
    stubFetch(() => respond(200, { revision: 1, updatedAt: "now", payload: payload({ records: [{ questionId: "q1", chosen: ["A"], isCorrect: true, durationMs: 1, mode: "daily", answeredAt: 100 }] }) }));
    await pull();
    expect(events).toEqual([]);
  });
});

describe("push", () => {
  it("带上本地 revision，成功后保存服务端新版本并广播 uploaded", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    saveProfile({ streak: 1, lastActiveDate: "2026-09-23", totalAnswered: 1, totalCorrect: 1, onboarded: true });
    saveRevision(5);
    stubFetch(() => respond(200, { revision: 6, payload: null, updatedAt: "now" }));
    await push();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect((calls[0].body as { baseRevision: number }).baseRevision).toBe(5);
    expect(loadRevision()).toBe(6);
    expect(events).toEqual(["uploaded"]);
  });

  it("409 冲突时先合并服务端最新值，再用新版本重投一次", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    const remotePayload = payload({ bookmarks: ["q-from-other-device"] });
    let round = 0;
    stubFetch(() => {
      round += 1;
      if (round === 1) {
        return respond(409, { error: "CONFLICT", message: "冲突", field: "baseRevision", server: { revision: 9, payload: remotePayload, updatedAt: "now" } });
      }
      return respond(200, { revision: 10, payload: remotePayload, updatedAt: "now" });
    });
    await push();
    expect(calls).toHaveLength(2);
    expect((calls[0].body as { baseRevision: number }).baseRevision).toBe(0);
    expect((calls[1].body as { baseRevision: number }).baseRevision).toBe(9);
    // 服务端的收藏已经合并进本地，没有被覆盖掉
    expect((calls[1].body as { payload: ProgressPayload }).payload.bookmarks).toContain("q-from-other-device");
    expect(loadRevision()).toBe(10);
    expect(events).toEqual(["applied", "uploaded"]);
  });

  it("其它错误直接抛给调用方（离线不该被当成成功）", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    stubFetch(() => respond(500, { error: "INTERNAL", message: "服务暂时不可用" }));
    await expect(push()).rejects.toMatchObject({ status: 500 });
  });
});

describe("scheduleUpload", () => {
  it("未登录时是空操作", async () => {
    stubFetch(() => respond(200, {}));
    scheduleUpload(10);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toHaveLength(0);
  });

  it("登录后把连续多次调用防抖成一次上传", async () => {
    vi.useFakeTimers();
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    stubFetch(() => respond(200, { revision: 1, payload: null, updatedAt: "now" }));
    scheduleUpload(100);
    scheduleUpload(100);
    scheduleUpload(100);
    await vi.advanceTimersByTimeAsync(150);
    expect(calls).toHaveLength(1);
  });

  it("上传失败（离线）只广播 offline，不抛出去打断答题", async () => {
    vi.useFakeTimers();
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    stubFetch(() => {
      throw new TypeError("failed to fetch");
    });
    scheduleUpload(10);
    await vi.advanceTimersByTimeAsync(30);
    expect(events).toEqual(["offline"]);
  });
});

describe("bootstrap 与同步游标", () => {
  it("未登录什么都不做", async () => {
    await bootstrap();
    expect(calls).toHaveLength(0);
  });

  it("拉取失败（离线）只广播 offline，不抛异常", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    stubFetch(() => {
      throw new TypeError("failed to fetch");
    });
    await expect(bootstrap()).resolves.toBeUndefined();
    expect(events).toEqual(["offline"]);
  });

  it("同步游标存得住、读得回、退出登录会清掉", () => {
    expect(loadRevision()).toBe(0);
    saveRevision(12);
    expect(loadRevision()).toBe(12);
    clearSyncState();
    expect(loadRevision()).toBe(0);
  });

  it("游标被写坏时退化为 0（当作新设备重来，不丢本地数据）", () => {
    localStorage.setItem("aq.sync.v1", "这不是 JSON");
    expect(loadRevision()).toBe(0);
  });

  it("退出登录不影响本地答题记录", async () => {
    saveSession("tok-1", { uid: "u-1", username: "sam" });
    appendRecord({ questionId: "q1", chosen: ["A"], isCorrect: false, durationMs: 1, mode: "daily", answeredAt: 100 });
    clearSession();
    expect(loadRecords()).toHaveLength(1);
  });
});
