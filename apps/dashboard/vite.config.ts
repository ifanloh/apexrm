import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("xlsx")) {
              return "vendor-xlsx";
            }
            if (id.includes("leaflet")) {
              return "vendor-leaflet";
            }
          }
        }
      }
    }
  },
  define: {
    __APP_BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString())
  }
});
