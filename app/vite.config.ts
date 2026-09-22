import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "AI 知识答题",
        short_name: "AI答题",
        description: "每天 10 题，AI 工程知识巩固",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0b0f19",
        theme_color: "#0b0f19",
        icons: [{ src: "./icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,json}"]
      }
    })
  ]
});
