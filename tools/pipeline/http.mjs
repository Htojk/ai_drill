/**
 * 带日志与重试的 HTTP 客户端。只做「取文本/取 JSON」这一件事，
 * 不掺任何题目或业务概念，方便单测与替换。
 */
export class HttpError extends Error {
  constructor(message, { url, status, attempts, cause } = {}) {
    super(message);
    this.name = "HttpError";
    this.url = url;
    this.status = status;
    this.attempts = attempts;
    if (cause) this.cause = cause;
  }
}

export const DEFAULT_HEADERS = {
  // GitHub API/raw 对 UA 有要求，统一带上，顺便表明身份
  "user-agent": "ai-drill-question-pipeline (+https://github.com/Htojk/ai_drill)",
  accept: "text/plain,text/markdown,application/json;q=0.9,*/*;q=0.5"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 取文本，失败按指数退避重试。
 * 4xx（除 429）不重试——那是地址错了，重试没意义。
 */
export async function httpGetText(url, { logger, timeoutMs = 20000, retries = 2, headers, label } = {}) {
  const attempts = retries + 1;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    logger?.debug("http.request", { url, attempt, of: attempts, timeoutMs, label });

    try {
      const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, ...headers }, signal: controller.signal });
      const ms = Date.now() - startedAt;

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const err = new HttpError(`HTTP ${res.status} ${res.statusText}`, { url, status: res.status, attempts: attempt });
        if (!retryable || attempt === attempts) throw err;
        const delay = 2 ** (attempt - 1) * 500;
        logger?.warn("http.retry", { url, status: res.status, attempt, nextDelayMs: delay, ms, label });
        await sleep(delay);
        lastError = err;
        continue;
      }

      const text = await res.text();
      logger?.debug("http.ok", { url, status: res.status, bytes: text.length, ms, attempt, label });
      return text;
    } catch (err) {
      const ms = Date.now() - startedAt;
      const isAbort = err?.name === "AbortError";
      if (err instanceof HttpError && err.attempts === attempt) {
        logger?.error("http.fail", { url, status: err.status, attempt, ms, label });
        throw err;
      }
      lastError = err;
      if (attempt === attempts) {
        logger?.error("http.fail", { url, attempt, ms, label, reason: isAbort ? "timeout" : err.message });
        throw new HttpError(isAbort ? `请求超时（${timeoutMs}ms）` : `请求失败：${err.message}`, {
          url,
          attempts: attempt,
          cause: err
        });
      }
      const delay = 2 ** (attempt - 1) * 500;
      logger?.warn("http.retry", { url, attempt, nextDelayMs: delay, reason: isAbort ? "timeout" : err.message, label });
      await sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new HttpError("请求失败（未知原因）", { url });
}

export async function httpGetJson(url, options) {
  const text = await httpGetText(url, { ...options, headers: { accept: "application/json", ...options?.headers } });
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new HttpError(`响应不是合法 JSON：${err.message}`, { url, cause: err });
  }
}
