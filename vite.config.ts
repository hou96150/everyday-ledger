import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.VITE_BASE_PATH || "/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "日常帳本｜雙店記帳",
        short_name: "日常帳本",
        lang: "zh-TW",
        theme_color: "#76543d",
        background_color: "#f6f3ec",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}favicon.svg`,
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: `${base}index.html`,
        maximumFileSizeToCacheInBytes: 5000000,
      },
    }),
  ],
});
