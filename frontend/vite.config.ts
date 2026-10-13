import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/frete/',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
