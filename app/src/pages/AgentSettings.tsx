import { useState } from "react";
import * as agentStore from "../lib/agent-store";
import type { AgentConfig } from "../types";

/**
 * AI 批阅设置。
 *
 * 纯静态站点没有后端能代持密钥，所以这里让用户自带 key，只存在本机 localStorage、
 * 只用于直接调用用户指定的模型接口；不填就自动走本地要点评分。
 */
export default function AgentSettings() {
  const [config, setConfig] = useState<AgentConfig>(() => agentStore.loadAgentConfig());
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  function update(patch: Partial<AgentConfig>) {
    setSaved(false);
    setConfig((prev) => ({ ...prev, ...patch }));
  }

  function save() {
    agentStore.saveAgentConfig(config);
    setSaved(true);
  }

  const ready = agentStore.isAgentReady(config);

  return (
    <div className="card">
      <p className="card-title">AI 批阅（简答题）</p>
      <p className="muted">
        {ready
          ? "已启用：简答题由你配置的模型批阅。调用失败会自动降级为本地要点评分。"
          : "未启用：简答题用本地要点覆盖率评分（免费、离线、不上传作答）。"}
      </p>

      <div className="report-opts" style={{ marginTop: 10 }}>
        <button className={config.enabled ? "chip on" : "chip"} onClick={() => update({ enabled: !config.enabled })}>
          {config.enabled ? "已开启模型批阅" : "开启模型批阅"}
        </button>
      </div>

      {config.enabled && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 4 }}>接口地址（OpenAI 兼容 /chat/completions）</div>
          <input
            className="pass-input"
            value={config.baseUrl}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => update({ baseUrl: e.target.value })}
          />

          <div className="muted" style={{ margin: "10px 0 4px" }}>模型名</div>
          <input
            className="pass-input"
            value={config.model}
            placeholder="gpt-4o-mini"
            onChange={(e) => update({ model: e.target.value })}
          />

          <div className="muted" style={{ margin: "10px 0 4px" }}>API Key（只存在本机，不会导出到进度码）</div>
          <input
            className="pass-input"
            type={showKey ? "text" : "password"}
            value={config.apiKey}
            placeholder="sk-..."
            onChange={(e) => update({ apiKey: e.target.value })}
          />
          <button className="link-btn" style={{ marginTop: 6 }} onClick={() => setShowKey((v) => !v)}>
            {showKey ? "隐藏" : "显示"}
          </button>
        </div>
      )}

      <button className="btn small" style={{ marginTop: 12 }} onClick={save}>
        {saved ? "已保存 ✓" : "保存设置"}
      </button>
    </div>
  );
}
