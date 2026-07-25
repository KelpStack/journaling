import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages project site: https://kelpstack.github.io/journaling/
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "DiaryDeck",
        short_name: "DiaryDeck",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#0b1f2a",
        theme_color: "#0b1f2a",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,zip}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
  },
});
