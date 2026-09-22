import type { Question, ShortAnswerGrade } from "../types";

// 命中一个评分要点所需的覆盖率。
//
// 这个值必须按「真实题库」标定，不能按测试夹具标定：早期取 0.5 时，
// 拿题库里 180 道简答题的**参考答案原文**去自评，只有 21% 能到 partial 线、
// 4% 能到 correct 线 —— 连标准答案自己都判不及格，说明门槛脱离了实际措辞。
//
// 实测标定（180 道简答题，见 grading.test.ts 的同名用例）：
//   阈值  参考答案≥80  参考答案≥40  跑题答案均分
//   0.50      4%         21%         0
//   0.30     35%         81%         0
//   0.25     57%         94%         1
//   0.20     74%         97%         3
// 取 0.2：标准答案几乎都能过线，同时跑题答案仍然拿不到分（区分度没丢）。
const HIT_COVERAGE = 0.2;
// 判定为「答对」与「部分答对」的分数线
const PASS_SCORE = 80;
const PARTIAL_SCORE = 40;

const CJK = /[\u4e00-\u9fff]/;

/** 去掉标点与空白，只留下有意义的字符。 */
function normalize(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[，。、；：？！,.;:?!"'“”‘’（）()\[\]【】{}<>《》—\-_/\\|~`@#$%^&*+=]/g, "");
}

/**
 * 把一段文字切成可比对的 token。
 * 中文没有词边界，用「相邻二字」做模糊匹配；纯英文按单词切。
 * 这样不需要任何词典或依赖，也能容忍语序与措辞差异。
 */
export function tokens(text: string): Set<string> {
  const lowered = String(text).toLowerCase();
  // 先判语种再归一化：英文靠空格分词，不能先把空格删掉再切。
  if (!CJK.test(lowered)) {
    return new Set(lowered.split(/[^a-z0-9]+/).filter(Boolean));
  }
  const s = normalize(lowered);
  if (!s) return new Set();
  {
    const out = new Set<string>();
    for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
    if (s.length === 1) out.add(s);
    return out;
  }
}

/** 要点被答案覆盖的比例（0–1）。 */
export function coverage(point: string, answer: string): number {
  const need = tokens(point);
  if (need.size === 0) return 0;
  const got = tokens(answer);
  let hit = 0;
  for (const t of need) if (got.has(t)) hit++;
  return hit / need.size;
}

/**
 * 本地批阅简答题：按评分要点覆盖率打分。
 *
 * 这是「没有配置模型 key」时的兜底，也是模型批阅失败时的降级路径 ——
 * 两条路产出同一个 ShortAnswerGrade，所以 UI 与存储不需要分支。
 */
export function gradeLocally(question: Question, answer: string): ShortAnswerGrade {
  const text = String(answer ?? "").trim();
  if (!text) {
    return {
      verdict: "blank",
      score: 0,
      hitPoints: [],
      missedPoints: [...(question.keyPoints ?? [])],
      comment: "没有作答。可以先写你能想到的任何一点，再对照参考答案。",
      by: "local"
    };
  }

  const points = question.keyPoints?.length ? question.keyPoints : [question.referenceAnswer ?? ""];
  const hitPoints: string[] = [];
  const missedPoints: string[] = [];
  for (const p of points) {
    if (coverage(p, text) >= HIT_COVERAGE) hitPoints.push(p);
    else missedPoints.push(p);
  }

  const score = points.length ? Math.round((hitPoints.length / points.length) * 100) : 0;
  const verdict = score >= PASS_SCORE ? "correct" : score >= PARTIAL_SCORE ? "partial" : "wrong";
  return {
    verdict,
    score,
    hitPoints,
    missedPoints,
    comment: buildComment(verdict, hitPoints, missedPoints),
    by: "local"
  };
}

function buildComment(
  verdict: ShortAnswerGrade["verdict"],
  hitPoints: string[],
  missedPoints: string[]
): string {
  if (verdict === "correct") return `要点基本齐全（命中 ${hitPoints.length} 条）。`;
  const missing = missedPoints.length ? `漏掉了：${missedPoints.join("；")}。` : "";
  if (verdict === "partial") return `答对了一部分（命中 ${hitPoints.length} 条）。${missing}`;
  return `与参考答案的要点重合较少。${missing}`;
}

export { HIT_COVERAGE, PASS_SCORE, PARTIAL_SCORE };
