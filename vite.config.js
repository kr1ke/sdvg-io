import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Иконки в public/ генерируются командой `npm run pwa-assets` (см. package.json).
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        id: "/",
        name: "sdvg.io",
        short_name: "sdvg.io",
        description: "Минималистичный трекер задач: эпики, спринты, проекты. Работает офлайн.",
        lang: "ru",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#fbfaf6",
        theme_color: "#141418",
        categories: ["productivity"],
        icons: [
          { src: "pwa-64x64.png",   sizes: "64x64",   type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
});
