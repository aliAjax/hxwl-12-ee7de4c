import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: [
        "src/utils/**/*.ts",
        "src/auth/**/*.ts",
      ],
      exclude: [
        "src/auth/index.ts",
      ],
    },
  },
});
