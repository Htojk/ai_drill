/**
 * 用模型把「素材」写成题目草稿。被 gen-questions（人工投喂素材）与
 * pipeline（自动抓取的语料）共用，避免两处各写一份 prompt 与解析逻辑。
 *
 * 只依赖 fetch，不引第三方 SDK；日志通过传入的 logger（可省略）。
 */

/** 出题提示词里的结构说明，与 tools/question-schema.mjs 的字段保持一致。 */
export const DRAFT_SCHEMA_HINT = `只输出 JSON 数组，每个元素形如：
{
  "id": "q_rag_101",
  "type": "single" | "judge" | "scenario",
  "isPractice": false,
  "stem": "题干（中文，来自素材的真实考点，不要编造素材里没有的结论）",
  "options": [
    { "key": "A", "content": "...", "isCorrect": true },
    { "key": "B", "content": "...", "isCorrect": false, "wrongReason": "为什么这个选项错" }
  ],
  "explanation": "正确答案为什么对",
  "extension": "延伸知识点",
  "difficulty": 1,
  "categories": ["RAG"],
  "tags": ["..."],
  "source": { "type": "paper" | "doc" | "spec" | "community", "title": "标题", "url": "https://...", "snippet": "素材原文片段（必须逐字摘录）" }
}`;

const SYSTEM_PROMPT =
  "你是 AI 工程知识题库编辑。根据用户给出的素材出单选题，题干与解析用中文。" +
  "每道题必须有 4 个选项、恰好 1 个正确答案、其余 3 个都要写 wrongReason，" +
  "source.snippet 必须逐字摘录素材原文。不要编造素材里没有的事实。\n" +
  DRAFT_SCHEMA_HINT;

export function buildAuthoringMessages({ material, category, limit = 5, sourceHint }) {
  const lines = [`分类：${category}`, `最多 ${limit} 道题。`];
  if (sourceHint) lines.push(`出处信息（请如实填进 source）：${sourceHint}`);
  lines.push(`素材如下：\n\n${material}`);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") }
  ];
}

/** 模型偶尔会包 ```json 或加解释，这里只截取数组部分。 */
export function extractJsonArray(text) {
  const cleaned = String(text).replace(/^\s*```(?:json)?/m, "").replace(/```\s*$/m, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("模型输出里找不到 JSON 数组");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function resolveModelConfig(env = process.env) {
  return {
    apiKey: env.OPENAI_API_KEY,
    baseUrl: (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: env.OPENAI_MODEL ?? "gpt-4o-mini"
  };
}

/**
 * 调模型出题。失败抛错，由调用方决定是整体中止还是记一条 warn 继续。
 * @returns {Promise<Array<object>>} 题目草稿数组
 */
export async function draftQuestionsWithModel({ material, category, limit = 5, sourceHint, logger, env = process.env, fetchImpl = fetch }) {
  const { apiKey, baseUrl, model } = resolveModelConfig(env);
  if (!apiKey) throw new Error("缺少 OPENAI_API_KEY；如只想跑通链路请用离线模式");

  const startedAt = Date.now();
  logger?.debug("llm.request", { model, baseUrl, category, limit, chars: material.length });
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: buildAuthoringMessages({ material, category, limit, sourceHint })
    })
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    logger?.error("llm.fail", { status: res.status, ms: Date.now() - startedAt });
    throw new Error(`模型接口返回 ${res.status}：${body}`);
  }
  const data = await res.json();
  const questions = extractJsonArray(data.choices?.[0]?.message?.content ?? "");
  logger?.info("llm.ok", {
    model,
    count: questions.length,
    ms: Date.now() - startedAt,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens
  });
  return questions;
}
