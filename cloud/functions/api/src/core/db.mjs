/**
 * 云函数侧访问 CloudBase PostgreSQL 的唯一入口。
 *
 * 两点刻意的设计：
 * 1. SDK 用「惰性动态 import」——只有真正跑在云函数里才需要它，
 *    本地跑单测不装 @cloudbase/node-sdk 也能全绿。
 * 2. 函数内以环境管理员身份（service_role）读写数据，所以按账号隔离这一层
 *    必须在云函数里做：客户端拿不到任何数据库凭据。
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

async function getApp(config) {
  if (!cachedApp) {
    const cloudbase = await loadCloudbase();
    cachedApp = cloudbase.init({ env: config.envId || cloudbase.SYMBOL_CURRENT_ENV });
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
