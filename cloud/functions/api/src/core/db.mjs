/**
 * 云函数侧访问 CloudBase PostgreSQL 的唯一入口。
 *
 * 两点刻意的设计：
 * 1. SDK 用「惰性动态 import」——只有真正跑在云函数里才需要它，
 *    本地跑单测不装 @cloudbase/node-sdk 也能全绿。
 * 2. 函数内以环境管理员身份（service_role）读写数据，所以按账号隔离这一层
 *    必须在云函数里做：客户端拿不到任何数据库凭据。
 * 3. service_role 不是白来的：**必须**在 init 时带上 API Key（DRILL_API_KEY），
 *    否则网关按 anon 角色处理，被 revoke 的表一律 permission denied。
 *
 * 所有查询都过 run()，失败统一记日志，不静默吞错。
 */

let cloudbasePromise = null;
let cachedApp = null;

async function loadCloudbase() {
  if (!cloudbasePromise) {
    cloudbasePromise = import("@cloudbase/node-sdk").then((mod) => mod.default ?? mod);
  }
  return cloudbasePromise;
}

/**
 * 初始化参数。单独抽出来是为了能在单测里断言，不必真的连云数据库。
 * 不带 accessKey 时网关按 anon 处理——那是「能起服务但读不了库」的隐性故障，
 * 所以这里不提供「没有 key 也能跑」的降级路径。
 */
export function appOptions(config, currentEnvSymbol) {
  return {
    env: config.envId || currentEnvSymbol,
    ...(config.apiKey ? { accessKey: config.apiKey } : {})
  };
}

async function getApp(config) {
  if (!cachedApp) {
    const cloudbase = await loadCloudbase();
    cachedApp = cloudbase.init(appOptions(config, cloudbase.SYMBOL_CURRENT_ENV));
  }
  return cachedApp;
}

export function createDb(config, log) {
  async function run(event, build) {
    const started = Date.now();
    let result;
    try {
      const app = await getApp(config);
      result = await build(app.rdb({ database: config.schema }));
    } catch (err) {
      log.error("db.crash", { event, ms: Date.now() - started, message: err?.message });
      throw dbError(event);
    }
    const { data, error } = result || {};
    const ms = Date.now() - started;
    if (error) {
      log.error("db.fail", { event, ms, code: error.code, message: error.message });
      throw dbError(event);
    }
    log.info("db.ok", { event, ms, rows: Array.isArray(data) ? data.length : data ? 1 : 0 });
    return data;
  }

  return { run };
}

function dbError(event) {
  const err = new Error(`数据库操作失败（${event}）`);
  err.statusCode = 500;
  err.code = "DB_ERROR";
  return err;
}
