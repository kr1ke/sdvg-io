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
        // Long-press app-icon shortcuts. URL params обрабатываются в App.jsx
        // (setInitialAction → openTask / archiveOpen) + history.replaceState
        // чтобы не засорять адресную строку после запуска.
        shortcuts: [
          {
            name: "Новая задача",
            short_name: "+ задача",
            description: "Быстро добавить новую задачу",
            url: "/?shortcut=new-task",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Открыть архив",
            short_name: "Архив",
            description: "Показать архивные задачи и спринты",
            url: "/?shortcut=archive",
            icons: [{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
        // launch_handler: при запуске из dock/home-screen реиспользовать окно
        // вместо открытия нового таба. Chrome 102+, Safari тихо игнорит.
        launch_handler: { client_mode: "navigate-existing" },
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
