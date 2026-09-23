import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDER,
  REMINDER_TZ,
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  formatLocal,
  formatUtc,
  icsFileName,
  isReminderReady,
  loadReminderSettings,
  nextOccurrence,
  parseTime,
  saveReminderSettings
} from "./reminder";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
});

const encoder = new TextEncoder();

describe("parseTime / isReminderReady", () => {
  it("接受 HH:mm，也接受 1:05 这种个位数小时", () => {
    expect(parseTime("20:00")).toEqual({ hour: 20, minute: 0 });
    expect(parseTime("7:05")).toEqual({ hour: 7, minute: 5 });
  });

  it("拒绝越界与乱写的值", () => {
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("12:60")).toBeNull();
    expect(parseTime("20:0")).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime(undefined as unknown as string)).toBeNull();
  });

  it("只有开关打开且时间合法才算就绪", () => {
    expect(isReminderReady({ enabled: true, time: "20:00" })).toBe(true);
    expect(isReminderReady({ enabled: false, time: "20:00" })).toBe(false);
    expect(isReminderReady({ enabled: true, time: "25:00" })).toBe(false);
  });
});

describe("nextOccurrence", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 23, h, m, 0, 0);

  it("还没到点就落在今天", () => {
    const next = nextOccurrence("20:00", at(9, 30));
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([23, 20, 0]);
  });

  it("已经过点就顺延到明天", () => {
    const next = nextOccurrence("20:00", at(21, 0));
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([24, 20, 0]);
  });

  it("正好等于当前时刻也算过了，顺延明天", () => {
    const next = nextOccurrence("20:00", at(20, 0));
    expect(next.getDate()).toBe(24);
  });

  it("时间非法时抛错，而不是悄悄生成一份错日历", () => {
    expect(() => nextOccurrence("99:99", at(9, 0))).toThrow();
  });
});

describe("时间与文本格式化", () => {
  it("formatLocal 输出 YYYYMMDDTHHmmSS", () => {
    expect(formatLocal(new Date(2026, 8, 23, 20, 5, 7))).toBe("20260923T200507");
  });

  it("formatUtc 输出带 Z 的 UTC 时间", () => {
    expect(formatUtc(new Date(Date.UTC(2026, 8, 23, 12, 5, 7)))).toBe("20260923T120507Z");
  });

  it("escapeIcsText 转义反斜杠、分号、逗号与换行", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });
});

describe("foldIcsLine", () => {
  it("短行原样返回", () => {
    expect(foldIcsLine("RRULE:FREQ=DAILY")).toBe("RRULE:FREQ=DAILY");
  });

  it("长行折到 75 字节以内，续行以空格开头", () => {
    const folded = foldIcsLine(`SUMMARY:${"题".repeat(60)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) expect(part.startsWith(" ")).toBe(true);
  });

  it("折行后拼回去内容不丢", () => {
    const line = `DESCRIPTION:${"hello 世界 ".repeat(20)}`;
    const restored = foldIcsLine(line)
      .split("\r\n")
      .map((p, i) => (i === 0 ? p : p.slice(1)))
      .join("");
    expect(restored).toBe(line);
  });
});

describe("buildIcs", () => {
  const now = new Date(2026, 8, 23, 9, 30, 0, 0);
  const ics = buildIcs({ enabled: true, time: "20:00", dailySize: 12 }, { now });

  it("是一份完整且换行为 CRLF 的 VCALENDAR", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
    expect(ics.split("\r\n").every((line, i, arr) => (i === arr.length - 1 ? line === "" : true))).toBe(true);
  });

  it("带时区定义、按天重复、且在事件时刻响铃", () => {
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain(`TZID:${REMINDER_TZ}`);
    expect(ics).toContain("TZOFFSETTO:+0800");
    expect(ics).toContain("RRULE:FREQ=DAILY");
    expect(ics).toContain(`DTSTART;TZID=${REMINDER_TZ}:20260923T200000`);
    expect(ics).toContain("TRIGGER:PT0M");
    expect(ics).toContain("ACTION:DISPLAY");
  });

  it("摘要里带上题量，且题量缺失时回落到默认值", () => {
    expect(ics).toContain("SUMMARY:每日刷题 · 12 题");
    const fallback = buildIcs({ enabled: true, time: "07:30" }, { now });
    expect(fallback).toContain(`SUMMARY:每日刷题 · ${DEFAULT_REMINDER.dailySize} 题`);
    expect(fallback).toContain(`DTSTART;TZID=${REMINDER_TZ}:20260924T073000`);
  });

  it("UID 只跟时间有关：同时间重复生成得到同一个 UID，改时间才换", () => {
    const again = buildIcs({ enabled: true, time: "20:00", dailySize: 12 }, { now });
    const uidOf = (text: string) => text.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(uidOf(again)).toBe(uidOf(ics));
    expect(uidOf(buildIcs({ enabled: true, time: "21:00" }, { now }))).not.toBe(uidOf(ics));
  });

  it("DTSTAMP 用 UTC，DTSTART 用本地时间", () => {
    expect(ics).toContain("DTSTAMP:20260923T013000Z");
  });

  it("时间非法时抛错，避免生成导不进去的日历", () => {
    expect(() => buildIcs({ enabled: true, time: "8点" }, { now })).toThrow();
  });
});

describe("icsFileName", () => {
  it("文件名带提醒时刻，方便区分多份日历", () => {
    expect(icsFileName({ enabled: true, time: "20:00" })).toBe("ai-drill-reminder-2000.ics");
    expect(icsFileName({ enabled: true, time: "7:05" })).toBe("ai-drill-reminder-0705.ics");
  });

  it("时间非法时退回一个通用名，不抛错", () => {
    expect(icsFileName({ enabled: true, time: "x" })).toBe("ai-drill-reminder-reminder.ics");
  });
});

describe("本地设置读写", () => {
  it("没存过时返回默认值（关闭）", () => {
    expect(loadReminderSettings()).toEqual(DEFAULT_REMINDER);
  });

  it("存下来能读回，且缺字段时用默认值补齐", () => {
    saveReminderSettings({ enabled: true, time: "07:30" });
    expect(loadReminderSettings()).toEqual({ enabled: true, time: "07:30", dailySize: 10 });
  });

  it("localStorage 不可用时静默降级，不把页面搞崩", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      }
    };
    expect(() => saveReminderSettings({ enabled: true, time: "08:00" })).not.toThrow();
    expect(loadReminderSettings()).toEqual(DEFAULT_REMINDER);
  });
});

