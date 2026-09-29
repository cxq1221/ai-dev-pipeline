import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  root: new URL("./frontend", import.meta.url).pathname,
  plugins: [vue()],
  build: { outDir: "../dist", emptyOutDir: true },
});
