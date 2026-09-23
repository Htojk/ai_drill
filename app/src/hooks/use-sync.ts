import { useEffect } from "react";
import * as sync from "../lib/sync";

/**
 * 把后台同步接到界面状态上。
 *
 * 同步是后台动作，界面不该为它重写一遍数据加载逻辑：远端合并进本地后
 * 同步层发一个 applied 事件，这里统一让调用方重读本地数据。
 */
export function useSyncBridge(reload: () => void): void {
  useEffect(
    () =>
      sync.subscribe((event) => {
        if (event.type === "applied") reload();
      }),
    [reload]
  );

  useEffect(() => {
    void sync.bootstrap();
  }, []);
}
