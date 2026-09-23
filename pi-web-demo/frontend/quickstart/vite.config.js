import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// Standalone development: keep browser calls same-origin; forward only /api.
const backend = "http://127.0.0.1:4317";
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: backend,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (request) =>
            request.setHeader("Origin", backend),
          );
        },
      },
    },
  },
});
