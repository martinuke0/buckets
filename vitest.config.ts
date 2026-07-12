import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // ponytail: single fork — jsdom+firebase across parallel workers OOMed the 4GB heap.
    // Revisit (threads/isolate) only if suite runtime becomes a problem.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
