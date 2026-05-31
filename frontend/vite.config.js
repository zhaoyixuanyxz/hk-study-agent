import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = env.VITE_BASE_PATH || "/";

  return {
    base,
    server: {
      host: "127.0.0.1",
      port: 5180,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:8010",
        "/health": "http://127.0.0.1:8010",
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
