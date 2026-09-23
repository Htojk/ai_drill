import { ok } from "../http/response.mjs";

/** 健康检查：部署后第一件事就是打这个接口，确认路由与环境变量都通了。 */
export function healthRoutes() {
  return [
    {
      method: "GET",
      path: "/health",
      handler: async (req, ctx) =>
        ok({
          ok: true,
          service: "ai-drill-api",
          version: "0.1.0",
          env: ctx.config.envId || "(unknown)",
          schema: ctx.config.schema,
          registerOpen: ctx.config.allowRegister,
          time: new Date().toISOString()
        })
    }
  ];
}
