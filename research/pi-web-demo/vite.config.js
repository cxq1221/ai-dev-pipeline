import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./frontend", import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        workbench: fileURLToPath(
          new URL("./frontend/index.html", import.meta.url),
        ),
        quickstart: fileURLToPath(
          new URL("./frontend/quickstart/index.html", import.meta.url),
        ),
      },
    },
  },
});
