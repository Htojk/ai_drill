import { createDb } from "./core/db.mjs";
import { createLogger } from "./core/log.mjs";
import { createRouter } from "./router.mjs";
import { createAccountRepo } from "./repo/accounts.mjs";
import { createProgressRepo } from "./repo/progress.mjs";
import { authRoutes } from "./routes/auth-routes.mjs";
import { healthRoutes } from "./routes/health-routes.mjs";
import { progressRoutes } from "./routes/progress-routes.mjs";
import { loadConfig } from "./core/config.mjs";

/**
 * 组装依赖：config / logger / 仓储 / 路由表。
 * 测试里可以用注入的假仓储直接建一个 app，不需要连云数据库。
 */
export function createApp({ env = process.env, log = createLogger("api"), db = null, repos = null } = {}) {
  const config = loadConfig(env);
  const database = db || createDb(config, log);

  const ctx = {
    config,
    log,
    db: database,
    accounts: repos?.accounts || createAccountRepo(database),
    progress: repos?.progress || createProgressRepo(database)
  };
  const routes = [...healthRoutes(ctx), ...authRoutes(ctx), ...progressRoutes(ctx)];
  return { ctx, router: createRouter(routes), routes };
}
