import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon-180.png"],
      manifest: {
        name: "AI 知识答题",
        short_name: "AI答题",
        description: "每天 10 题，AI 工程知识巩固",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0b0f19",
        theme_color: "#0b0f19",
        // iOS 不支持 SVG 图标，必须提供 PNG；maskable 供 Android 自适应裁切
        icons: [
          { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "./icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json}"]
      }
    })
  ]
});
