/** 运行配置：全部来自云函数环境变量，缺关键项时宁可启动即失败，也不要静默降级。 */

export function loadConfig(env = process.env) {
  return {
    envId: env.TCB_ENV || env.DRILL_ENV || "",
    tokenSecret: env.DRILL_TOKEN_SECRET || "",
    tokenTtlSeconds: Number(env.DRILL_TOKEN_TTL || 0) || undefined,
    /** 自用站点：默认开放注册，但保留一键关闭的开关（环境变量 DRILL_ALLOW_REGISTER=off） */
    allowRegister: (env.DRILL_ALLOW_REGISTER || "on").toLowerCase() !== "off",
    schema: env.DRILL_DB_SCHEMA || "public"
  };
}

export function assertConfig(config) {
  const missing = [];
  if (!config.tokenSecret) missing.push("DRILL_TOKEN_SECRET");
  if (missing.length > 0) {
    throw new Error(`缺少环境变量：${missing.join(", ")}（用 tcb fn env set 配置）`);
  }
  return config;
}
