import { randomToken } from "./crypto.ts";

const env = process.env;
const isProduction = env.NODE_ENV === "production";

if (isProduction && !env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production.");
}

export const config = {
  isProduction,
  port: Number(env.PORT ?? 8787),
  databasePath: env.DATABASE_PATH ?? "./data/pcos.db",
  /** Comma-separated list of allowed browser origins. */
  corsOrigins: (env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim()),
  jwtSecret: env.JWT_SECRET ?? randomToken(32),
  jwtTtl: env.JWT_TTL ?? "8h",
  /** Seed demo accounts and records into an empty database. */
  seedDemo: (env.SEED_DEMO ?? (isProduction ? "false" : "true")) === "true",

  /**
   * Base URL of the PCOS chatbot service (InnovHer-Competition/chat-bot),
   * e.g. http://localhost:8000. Without it the built-in offline assistant answers.
   */
  chatbotUrl: env.CHATBOT_URL?.trim().replace(/\/$/, "") || undefined,
  chatbotToken: env.CHATBOT_TOKEN,
  /** The chatbot runs a local LLM, so allow generous time for a reply. */
  chatbotTimeoutMs: Number(env.CHATBOT_TIMEOUT_MS ?? 120_000),
};
