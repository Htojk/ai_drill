import { describe, expect, it, vi } from "vitest";
import {
  buildGradeMessages,
  extractJsonObject,
  gradeShortAnswer,
  gradeWithAgent,
  toGrade
} from "./agent";
import { isAgentReady } from "./agent-store";
import type { AgentConfig, Question } from "../types";

const SHORT: Question = {
  id: "q_short_1",
  type: "short",
  isPractice: false,
  stem: "什么是 RAG 的重排序？",
  options: [],
  keyPoints: ["召回只保语义接近", "重排序用更强模型精排候选"],
  referenceAnswer: "召回保量，重排序用更强的模型对候选精排，把相关的提到前面。",
  explanation: "解析",
  difficulty: 3,
  categories: ["RAG"],
  tags: ["简答"],
  source: { type: "doc", title: "t", url: "https://x.com", snippet: "s" }
};

const CONFIG: AgentConfig = {
  enabled: true,
  baseUrl: "https://api.example.com/v1/",
  apiKey: "sk-test",
  model: "gpt-4o-mini"
};

const reply = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] })
});

describe("isAgentReady", () => {
  it("开关关着或缺 key 都不走模型", () => {
    expect(isAgentReady({ ...CONFIG, enabled: false })).toBe(false);
    expect(isAgentReady({ ...CONFIG, apiKey: "  " })).toBe(false);
    expect(isAgentReady(CONFIG)).toBe(true);
  });
});

describe("buildGradeMessages", () => {
  it("把评分要点逐条编号递交给模型，并要求严格 JSON", () => {
    const msgs = buildGradeMessages(SHORT, "我的作答");
    expect(msgs[0].content).toContain("严格输出 JSON");
    expect(msgs[1].content).toContain("1. 召回只保语义接近");
    expect(msgs[1].content).toContain("2. 重排序用更强模型精排候选");
    expect(msgs[1].content).toContain("我的作答");
  });
});

describe("extractJsonObject", () => {
  it("剥掉 ```json 包裹并能取到对象", () => {
    expect(extractJsonObject('```json\n{"score":80}\n```')).toEqual({ score: 80 });
  });

  it("没有 JSON 时抛错，由上层降级", () => {
    expect(() => extractJsonObject("我觉得答得不错")).toThrow(/找不到 JSON/);
  });
});

describe("toGrade", () => {
  it("按分数映射判词", () => {
    expect(toGrade({ score: 90 }, []).verdict).toBe("correct");
    expect(toGrade({ score: 50 }, []).verdict).toBe("partial");
    expect(toGrade({ score: 10 }, []).verdict).toBe("wrong");
  });

  it("分数越界会被夹到 0–100", () => {
    expect(toGrade({ score: 999 }, []).score).toBe(100);
    expect(toGrade({ score: -5 }, []).score).toBe(0);
  });

  it("不信任模型的字段类型：非数组/非字符串一律丢弃", () => {
    const g = toGrade({ score: 60, hitPoints: "不是数组", missedPoints: [1, 2], comment: 42 }, ["兜底要点"]);
    expect(g.hitPoints).toEqual([]);
    expect(g.missedPoints).toEqual(["兜底要点"]);
    expect(g.comment).toBe("模型未给出评语。");
  });

  it("score 不是数字时抛错", () => {
    expect(() => toGrade({ score: "很高" }, [])).toThrow(/score/);
  });
});

describe("gradeWithAgent", () => {
  it("成功时返回 by=agent 的结果，并带上 Bearer 鉴权", async () => {
    const fetchImpl = vi.fn(async () => reply('{"hitPoints":["召回只保语义接近"],"missedPoints":[],"score":85,"comment":"不错"}'));
    const g = await gradeWithAgent({ question: SHORT, answer: "x", config: CONFIG, fetchImpl: fetchImpl as never });
    expect(g.by).toBe("agent");
    expect(g.score).toBe(85);
    expect(g.comment).toBe("不错");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // baseUrl 结尾的斜杠不应导致双斜杠
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
  });

  it("接口 4xx/5xx 时抛错", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(
      gradeWithAgent({ question: SHORT, answer: "x", config: CONFIG, fetchImpl: fetchImpl as never })
    ).rejects.toThrow(/401/);
  });
});

describe("gradeShortAnswer（含降级）", () => {
  it("没配 key 时直接用本地评分", async () => {
    const fetchImpl = vi.fn();
    const g = await gradeShortAnswer({
      question: SHORT,
      answer: "召回只保语义接近",
      config: { ...CONFIG, enabled: false },
      fetchImpl: fetchImpl as never
    });
    expect(g.by).toBe("local");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("模型失败时降级为本地评分并标记 degraded", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("网络不通");
    });
    const g = await gradeShortAnswer({
      question: SHORT,
      answer: "召回只保语义接近",
      config: CONFIG,
      fetchImpl: fetchImpl as never
    });
    expect(g.by).toBe("local");
    expect(g.degraded).toBe(true);
    expect(g.score).toBeGreaterThan(0);
  });

  it("空作答不浪费一次模型调用", async () => {
    const fetchImpl = vi.fn();
    const g = await gradeShortAnswer({ question: SHORT, answer: "  ", config: CONFIG, fetchImpl: fetchImpl as never });
    expect(g.verdict).toBe("blank");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
