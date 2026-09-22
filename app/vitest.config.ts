import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 目前只测纯逻辑（lib / data），不引入 jsdom，保持依赖轻量
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
