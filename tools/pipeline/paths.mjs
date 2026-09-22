/**
 * 流水线产物的路径约定，集中在这里定义，避免各 stage 各自拼路径。
 *
 * 设计原则（与业务解耦）：流水线只读写 content/ 下的目录，
 * 唯一的业务写入口是 tools/gen-questions.mjs --merge。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CONTENT = path.join(ROOT, "content");

/** 人工维护的出题素材（入库）。 */
export const SOURCES_DIR = path.join(CONTENT, "sources");
/** stage 1 产物：抓回来的原始素材（可重建，不入库）。 */
export const RAW_DIR = path.join(CONTENT, "raw");
/** stage 2 产物：规范化语料 CorpusDoc（可重建，不入库）。 */
export const CORPUS_DIR = path.join(CONTENT, "corpus");
/** stage 3 产物：切分后的出题素材块（可重建，不入库）。 */
export const CHUNKS_DIR = path.join(CONTENT, "chunks");
/** stage 4 产物：出题草稿，交给 gen-questions --merge（不入库）。 */
export const DRAFTS_DIR = path.join(CONTENT, "drafts");
/** 结构化日志，每跑一次一个 JSONL 文件（不入库）。 */
export const LOGS_DIR = path.join(CONTENT, "logs");
/** 运行报告与 manifest（不入库）。 */
export const REPORTS_DIR = path.join(CONTENT, "reports");

export const PIPELINE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 仓库内统一用相对路径打日志，便于阅读与跨机器对比。 */
export function rel(target) {
  return path.relative(ROOT, target).split(path.sep).join("/");
}
