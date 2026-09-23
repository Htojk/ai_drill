import { useState } from "react";
import * as reminder from "../lib/reminder";
import type { ReminderSettings } from "../types";

/**
 * 每日提醒卡片。
 *
 * 网页没法设置系统闹钟，所以这里把「提醒」做成一份可导入手机日历的 .ics：
 * 事件按天重复，到点由系统日历响铃——效果就是一个真闹钟，还不用后端和推送服务。
 */
export default function ReminderCard() {
  const [settings, setSettings] = useState<ReminderSettings>(() => reminder.loadReminderSettings());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(patch: Partial<ReminderSettings>) {
    setMessage("");
    setError("");
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      reminder.saveReminderSettings(next);
      return next;
    });
  }

  const ready = reminder.isReminderReady(settings);
  const timeValid = reminder.parseTime(settings.time) !== null;

  function exportIcs() {
    setError("");
    setMessage("");
    try {
      const name = reminder.downloadIcs(settings);
      if (!name) {
        setError("当前环境不支持直接下载，请在手机浏览器里打开本页再试。");
        return;
      }
      setMessage(`已下载 ${name}：点开它，选择「添加到日历」即可。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成日历时出错，请检查提醒时间。");
    }
  }

  return (
    <div className="card">
      <p className="card-title">每日定时提醒</p>
      <p className="muted">
        无需后端：导出一份日历文件，由手机自带日历到点响铃（等于闹钟）。导入一次就永久生效，断网也照常响。
      </p>

      <div className="report-opts" style={{ marginTop: 10 }}>
        <button className={settings.enabled ? "chip on" : "chip"} onClick={() => update({ enabled: !settings.enabled })}>
          {settings.enabled ? "提醒已开启" : "开启每日提醒"}
        </button>
      </div>

      {settings.enabled && (
        <div>
          <label className="form-label">提醒时间（本地时间）</label>
          <input
            className="field"
            type="time"
            value={settings.time}
            onChange={(e) => update({ time: e.target.value })}
          />
          {!timeValid && <p className="form-error">时间格式不对，请用 HH:mm（例如 20:00）。</p>}

          <label className="form-label">提醒里提到的题量</label>
          <input
            className="field"
            type="number"
            min={1}
            max={100}
            value={settings.dailySize ?? reminder.DEFAULT_REMINDER.dailySize}
            onChange={(e) => {
              const n = Number(e.target.value);
              update({ dailySize: Number.isFinite(n) && n > 0 ? Math.min(100, Math.round(n)) : undefined });
            }}
          />

          <p className="muted" style={{ marginTop: 10 }}>
            {nextHint(settings)}
          </p>

          <button className="btn small" style={{ marginTop: 10 }} disabled={!ready} onClick={exportIcs}>
            导出日历（.ics）
          </button>
        </div>
      )}

      {message && <p className="form-ok">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      {ready && (
        <p className="muted" style={{ marginTop: 10 }}>
          改完时间要重新导出一份；旧的日程记得在日历里删掉，否则两个提醒会同时响。
        </p>
      )}
    </div>
  );
}

/** 给个「下一次什么时候响」的直觉，省得用户对着时区猜。 */
function nextHint(settings: ReminderSettings): string {
  if (!reminder.isReminderReady(settings)) return "填好时间后这里会显示下一次提醒。";
  const next = reminder.nextOccurrence(settings.time);
  const day = new Date().getDate();
  const when = next.getDate() === day ? "今天" : "明天";
  return `下一次提醒：${when} ${settings.time}`;
}

