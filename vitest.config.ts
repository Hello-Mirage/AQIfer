import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/app/api/**/*.ts",
        "src/components/**/*.tsx",
        "src/app/page.tsx",
        "src/app/layout.tsx",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
      thresholds: {
        lines: 95,
        statements: 94,
        functions: 95,
        branches: 85,
      },
    },
  },
});
