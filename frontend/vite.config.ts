import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Dungeons & Kings Charles",
        short_name: "D&KC",
        lang: "es",
        theme_color: "#1b2622",
        background_color: "#f6f2e9",
        display: "standalone",
        icons: [192, 512].map((size) => ({
          src: "/icon-" + size + ".png",
          sizes: size + "x" + size,
          type: "image/png",
        })),
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
