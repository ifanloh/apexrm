import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@workspace/api-client-react": path.resolve(__dirname, "src/organizer-prototype/api.tsx")
    }
  },
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
