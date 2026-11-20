import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests always use the offline assistant and never call external services.
    env: { CHATBOT_URL: "", NODE_ENV: "test" },
  },
});
