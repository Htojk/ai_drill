import type { AgentConfig } from "../types";

// 模型批阅配置存在本机 localStorage。
// 纯静态站点没有后端可以代持密钥，所以 key 由用户自带、只留在自己的浏览器里，
// 也刻意不参与「进度码」导出（见 storage.ts 的 exportProgress）。
const KEY = "aq.agent.v1";

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini"
};

export function loadAgentConfig(): AgentConfig {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULT_AGENT_CONFIG, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_AGENT_CONFIG };
  }
}

export function saveAgentConfig(config: AgentConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* 存储不可用时静默降级为「不启用模型批阅」 */
  }
}

/** 配置完整（开了开关且填了 key）才走模型批阅，否则用本地评分。 */
export function isAgentReady(config: AgentConfig): boolean {
  return config.enabled && config.apiKey.trim().length > 0 && config.baseUrl.trim().length > 0;
}
