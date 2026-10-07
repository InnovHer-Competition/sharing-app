import { randomToken } from "./crypto.ts";

const env = process.env;
const isProduction = env.NODE_ENV === "production";

if (isProduction && !env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production.");
}

export const config = {
  isProduction,
  port: Number(env.PORT ?? 8787),
  databasePath: env.DATABASE_PATH ?? "./data/pcos-ledger.db",
  /** Comma-separated list of allowed browser origins. */
  corsOrigins: (env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((o) => o.trim()),
  jwtSecret: env.JWT_SECRET ?? randomToken(32),
  jwtTtl: env.JWT_TTL ?? "8h",
  /** Seed demo accounts and records into an empty database. */
  seedDemo: (env.SEED_DEMO ?? (isProduction ? "false" : "true")) === "true",

  anthropicApiKey: env.ANTHROPIC_API_KEY,
  chatModel: env.CHAT_MODEL ?? "claude-opus-5-5",
  chatEffort: (env.CHAT_EFFORT ?? "low") as "low" | "medium" | "high" | "xhigh" | "max",

  /** Optional: the blockchain / ZKP service that anchors ledger blocks. */
  ledgerServiceUrl: env.LEDGER_SERVICE_URL,
  ledgerServiceToken: env.LEDGER_SERVICE_TOKEN,
};
