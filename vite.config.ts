import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "人體解剖訓練對照",
        short_name: "解剖訓練對照",
        description: "以全身解剖模型對照訓練動作、肌肉參與和關節連動。",
        theme_color: "#0b1020",
        background_color: "#0b1020",
        display: "standalone",
        lang: "zh-Hant",
      },
      workbox: {
        // The full-body model is fetched on demand. Keeping it out of precache
        // prevents a 14.7 MB download from blocking service-worker installation.
        globIgnores: ["**/*.glb"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".glb"),
            handler: "CacheFirst",
            options: {
              cacheName: "anatomy-models",
              expiration: {
                maxEntries: 3,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        fullbody: "fullbody.html",
        tension: "tension.html",
        "dev-prototype-ik": "dev/dev-prototype-ik.html",
        "dev-mvp": "dev/mvp.html",
        "dev-mvp2": "dev/mvp2.html",
        "dev-muscle-map": "dev/muscle_map_demo.html",
        "dev-real-asset": "dev/real_asset_demo.html",
      },
    },
  },
});
