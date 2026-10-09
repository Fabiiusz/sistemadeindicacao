import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Testes de banco compartilham um único Postgres local.
    fileParallelism: false,
  },
});
