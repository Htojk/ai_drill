import { ApiError, progressApi } from "./api";
import { isSamePayload, mergePayload } from "./merge";
import * as session from "./session";
import * as store from "./storage";
import type { ProgressPayload } from "../types";

/**
 * 本地优先同步。
 *
 * 三条不变式，改动这里时必须守住：
 * 1. **本地永远是可用的**：没登录、离线、后端挂了，答题流程照常走，只是不上传。
 * 2. **云端只做合并，不做覆盖**：冲突时先把服务端合并进本地再重投（见 push）。
 * 3. **revision 是唯一的并发凭据**：本地记着上次看到的服务端版本，对不上就是 409，
 *    由我们合并后重试，绝不盲写。
 */

const REVISION_KEY = "aq.sync.v1";
const UPLOAD_DEBOUNCE_MS = 4000;

export type SyncEventType = "applied" | "uploaded" | "offline";
export interface SyncEvent {
  type: SyncEventType;
  revision?: number;
}

const listeners = new Set<(event: SyncEvent) => void>();

export function subscribe(listener: (event: SyncEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(event: SyncEvent): void {
  for (const listener of listeners) listener(event);
}

function emptyPayload(): ProgressPayload {
  return {
    records: [],
    reviews: {},
    profile: { streak: 0, lastActiveDate: "", totalAnswered: 0, totalCorrect: 0, onboarded: false },
    bookmarks: [],
    reports: [],
    mastery: {},
    tasks: {}
  };
}

export function loadRevision(): number {
  try {
    const raw = localStorage.getItem(REVISION_KEY);
    const value = raw ? Number((JSON.parse(raw) as { revision?: number }).revision) : 0;
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveRevision(revision: number): void {
  try {
    localStorage.setItem(REVISION_KEY, JSON.stringify({ revision }));
  } catch {
    /* 存不进去就退化成「每次都当作新设备」，不会丢本地数据 */
  }
}

export function clearSyncState(): void {
  try {
    localStorage.removeItem(REVISION_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 拉服务端进度并合并进本地；本地确实变了才发 applied 事件。 */
export async function pull(): Promise<void> {
  const token = session.currentToken();
  if (!token) return;
  const remote = await progressApi.get(token);
  saveRevision(remote.revision);
  if (!remote.payload) return;
  const local = store.readAll();
  const merged = mergePayload(local, remote.payload);
  if (isSamePayload(merged, local)) return;
  store.writeAll(merged);
  notify({ type: "applied", revision: remote.revision });
}

/** 把本地整包推上去；遇到 409 就合并服务端最新值再重投一次。 */
export async function push(): Promise<void> {
  const token = session.currentToken();
  if (!token) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = store.readAll();
    try {
      const res = await progressApi.put(token, payload, loadRevision());
      saveRevision(res.revision);
      notify({ type: "uploaded", revision: res.revision });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT" && err.server) {
        store.writeAll(mergePayload(payload, err.server.payload ?? emptyPayload()));
        saveRevision(err.server.revision);
        notify({ type: "applied", revision: err.server.revision });
        continue;
      }
      throw err;
    }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** 答题过程中频繁调用：防抖合并成一次上传。未登录时直接不动网络。 */
export function scheduleUpload(delayMs = UPLOAD_DEBOUNCE_MS): void {
  if (!session.currentToken()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void push().catch((err) => notify({ type: err instanceof ApiError && err.offline ? "offline" : "applied" }));
  }, delayMs);
}

export function cancelScheduledUpload(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** 进应用时跑一次：先拉后推。任何失败都只通知，不打扰用户。 */
export async function bootstrap(): Promise<void> {
  if (!session.currentToken()) return;
  try {
    await pull();
    await push();
  } catch {
    notify({ type: "offline" });
  }
}
