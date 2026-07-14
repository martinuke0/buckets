import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Never collect compiled Cloud Functions output as tests: functions/lib holds
    // CJS build artifacts (gitignored) that can't be imported by the ESM vitest.
    exclude: ["**/node_modules/**", "**/dist/**", "functions/lib/**"],
    // ponytail: single fork — jsdom+firebase across parallel workers OOMed the 4GB heap.
    // Revisit (threads/isolate) only if suite runtime becomes a problem.
    pool: "forks",
    // @ts-expect-error — valid at runtime (36/36 pass); this vitest build's exported
    // InlineConfig type omits poolOptions. Correct nesting per Vitest docs.
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
});
