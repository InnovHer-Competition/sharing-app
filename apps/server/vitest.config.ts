import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests always use the offline assistant and never call external services.
    env: { ANTHROPIC_API_KEY: "", LEDGER_SERVICE_URL: "", NODE_ENV: "test" },
  },
});
