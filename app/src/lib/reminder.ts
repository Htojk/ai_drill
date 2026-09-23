import type { ReminderSettings } from "../types";

/**
 * 每日定时提醒。
 *
 * 网页无法设置系统闹钟，Web Push 在 iOS 上也不可靠，所以这里走「日历订阅」：
 * 生成一份 .ics（RRULE:FREQ=DAILY），用户导入手机自带日历后由系统日历响铃——
 * 那本身就是真闹钟，且零后端、零推送服务、断网也照样响。
 *
 * 本文件是纯函数层：只把设置翻译成 ICS 文本，不碰 React、不依赖题库。
 * 设置只存本机（和 aq.agent.v1 一样），刻意不进同步整包——见 storage.ts 的 ProgressPayload。
 */
const KEY = "aq.reminder.v1";

/** 固定东八区：自用场景写死时区，避免各地日历把触发时刻解析歪。 */
export const REMINDER_TZ = "Asia/Shanghai";

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, time: "20:00", dailySize: 10 };

function read(): ReminderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULT_REMINDER, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_REMINDER };
  }
}

export function loadReminderSettings(): ReminderSettings {
  return read();
}

export function saveReminderSettings(settings: ReminderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式/存储满：静默降级，界面上的开关会自己回弹 */
  }
}

/* ------------------------------ 纯函数 ------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 解析 HH:mm；不合法返回 null（供 UI 校验与测试使用）。 */
export function parseTime(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? "").trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** 开关打开且时间合法，才算「提醒已就绪」。 */
export function isReminderReady(settings: ReminderSettings): boolean {
  return settings.enabled && parseTime(settings.time) !== null;
}

/**
 * 下一次触发时刻（本地时间）：今天该点还没到就是今天，已经过了就顺延到明天。
 * 日历里的 RRULE:FREQ=DAILY 会自己往后推，这里只负责给个合理的 DTSTART。
 */
export function nextOccurrence(time: string, from: Date = new Date()): Date {
  const parsed = parseTime(time);
  if (!parsed) throw new Error(`非法的提醒时间：${time}`);
  const next = new Date(from.getTime());
  next.setHours(parsed.hour, parsed.minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

/** 本地时间 → YYYYMMDDTHHmmSS（ICS 的 floating/TZID 形态）。 */
export function formatLocal(date: Date): string {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

/** UTC 时间 → YYYYMMDDTHHmmSSZ（DTSTAMP 必须是 UTC）。 */
export function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

/** ICS 文本转义：反斜杠、分号、逗号要转义，换行变 \n。 */
export function escapeIcsText(text: string): string {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * ICS 折行：单行最多 75 个八位组，超出部分换行并以一个空格续行（RFC 5545 §3.1）。
 * 按字节而不是按字符算，否则中文摘要会撑爆某些日历客户端。
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let budget = 75;
  for (const ch of line) {
    if (encoder.encode(current + ch).length > budget) {
      parts.push(current);
      current = "";
      budget = 74; // 续行开头的空格也占一个字节
    }
    current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/**
 * 生成整份 .ics。
 * 只产出一个 VEVENT + RRULE:FREQ=DAILY，所以导入一次就永久生效，不需要再订阅。
 */
export function buildIcs(settings: ReminderSettings, options: { now?: Date } = {}): string {
  const parsed = parseTime(settings.time);
  if (!parsed) throw new Error(`非法的提醒时间：${settings.time}`);

  const now = options.now ?? new Date();
  const start = nextOccurrence(settings.time, now);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const size = typeof settings.dailySize === "number" ? settings.dailySize : DEFAULT_REMINDER.dailySize;
  const summary = `每日刷题 · ${size} 题`;
  const description = `打开 AI 知识答题，完成今天的 ${size} 道题。`;
  const uid = `drill-daily-${pad2(parsed.hour)}${pad2(parsed.minute)}@ai-drill`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ai_drill//daily reminder//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:每日刷题提醒",
    `X-WR-TIMEZONE:${REMINDER_TZ}`,
    "BEGIN:VTIMEZONE",
    `TZID:${REMINDER_TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART;TZID=${REMINDER_TZ}:${formatLocal(start)}`,
    `DTEND;TZID=${REMINDER_TZ}:${formatLocal(end)}`,
    "RRULE:FREQ=DAILY",
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function icsFileName(settings: ReminderSettings): string {
  const parsed = parseTime(settings.time);
  const suffix = parsed ? `${pad2(parsed.hour)}${pad2(parsed.minute)}` : "reminder";
  return `ai-drill-reminder-${suffix}.ics`;
}

/**
 * 触发浏览器下载。返回文件名，方便 UI 提示。
 * 非浏览器环境（测试、SSR）直接返回 null，不抛。
 */
export function downloadIcs(settings: ReminderSettings): string | null {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const name = icsFileName(settings);
  const blob = new Blob([buildIcs(settings)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
