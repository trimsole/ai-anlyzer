import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // Относительные пути для работы в любом окружении
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
  },
});
