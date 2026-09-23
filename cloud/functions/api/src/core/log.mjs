/**
 * 结构化日志：每条一行 JSON，直接进云函数日志（tcb fn log 可读）。
 *
 * 约定：事件名用「域.动作」的点分短语（auth.login.ok / db.insert.fail），
 * 这样在日志里既能按域过滤，也能直接统计成功失败。禁止拼接自由文本当日志，
 * 否则线上排查时没法可靠检索。
 */

function emit(level, tag, event, data) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    tag,
    event,
    ...(data || {})
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(tag, base = {}) {
  const write = (level, event, data) => emit(level, tag, event, { ...base, ...(data || {}) });
  return {
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
    /** 子日志：绑定固定字段（如 route / uid），避免每行重复手写 */
    child: (extra) => createLogger(tag, { ...base, ...extra }),
    /** 计时器：done() 时输出耗时，用于观察冷启动与慢查询 */
    timer: (event) => {
      const started = Date.now();
      return (data) => write("info", event, { ...data, ms: Date.now() - started });
    }
  };
}

export const log = createLogger("api");
