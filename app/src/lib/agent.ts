import type { AgentConfig, Question, ShortAnswerGrade } from "../types";
import { isAgentReady } from "./agent-store";
import { gradeLocally } from "./grading";

export const AGENT_SYSTEM_PROMPT = [
  "你是 AI 工程题库的阅卷人。用户用中文回答一道简答题，你要按给出的「评分要点」批阅。",
  "要求：",
  "1) 只依据评分要点判断，不要因为表述风格扣分；同义表达、举例说明都算命中。",
  "2) 要点以外的新增内容若明显错误，在 comment 里指出，但不要据此给负分。",
  "3) 严格输出 JSON，不要输出任何解释文字或代码块标记。",
  'JSON 结构：{"hitPoints":["命中的要点原文"],"missedPoints":["漏掉的要点原文"],"score":0-100 的整数,"comment":"一到两句中文评语"}'
].join("\n");

export function buildGradeMessages(question: Question, answer: string) {
  const points = question.keyPoints?.length ? question.keyPoints : [question.referenceAnswer ?? ""];
  return [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `题目：${question.stem}`,
        `评分要点（逐条判断是否命中）：\n${points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
        `参考答案：${question.referenceAnswer ?? "（未提供）"}`,
        `用户作答：\n${answer}`
      ].join("\n\n")
    }
  ];
}

/** 模型偶尔会包 ```json 或加前后缀，这里只截取对象部分。 */
export function extractJsonObject(text: string): unknown {
  const cleaned = String(text).replace(/^\s*```(?:json)?/m, "").replace(/```\s*$/m, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型输出里找不到 JSON 对象");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function verdictFor(score: number): ShortAnswerGrade["verdict"] {
  if (score >= 80) return "correct";
  if (score >= 40) return "partial";
  return "wrong";
}

/** 把模型返回的任意 JSON 收敛成合法的批阅结果（不信任模型的字段类型）。 */
export function toGrade(raw: unknown, fallbackMissed: string[]): ShortAnswerGrade {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const asStrings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  const score = Math.max(0, Math.min(100, Math.round(Number(obj.score))));
  if (!Number.isFinite(score)) throw new Error("模型返回的 score 不是数字");
  return {
    verdict: verdictFor(score),
    score,
    hitPoints: asStrings(obj.hitPoints),
    missedPoints: asStrings(obj.missedPoints).length ? asStrings(obj.missedPoints) : fallbackMissed,
    comment: typeof obj.comment === "string" && obj.comment.trim() ? obj.comment.trim() : "模型未给出评语。",
    by: "agent"
  };
}

/**
 * 用模型批阅简答题。失败抛错，由调用方决定降级（见 gradeShortAnswer）。
 */
export async function gradeWithAgent({
  question,
  answer,
  config,
  fetchImpl = fetch,
  timeoutMs = 30000
}: {
  question: Question;
  answer: string;
  config: AgentConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ShortAnswerGrade> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: buildGradeMessages(question, answer)
      }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`模型接口返回 ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return toGrade(extractJsonObject(content), gradeLocally(question, "").missedPoints);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 批阅入口：配好模型就走模型，否则/失败时降级到本地要点评分。
 * 降级会带上 degraded 标记，UI 据此提示「这次是本地评的」。
 */
export async function gradeShortAnswer({
  question,
  answer,
  config,
  fetchImpl = fetch
}: {
  question: Question;
  answer: string;
  config: AgentConfig;
  fetchImpl?: typeof fetch;
}): Promise<ShortAnswerGrade> {
  const local = () => gradeLocally(question, answer);
  if (!answer.trim()) return local();
  if (!isAgentReady(config)) return local();
  try {
    return await gradeWithAgent({ question, answer, config, fetchImpl });
  } catch {
    return { ...local(), degraded: true };
  }
}
