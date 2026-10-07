import cors from "cors";
import express from "express";
import { authenticate } from "./auth.ts";
import { chatRouter } from "./chat/route.ts";
import { config } from "./config.ts";
import type { Database } from "./db.ts";
import { errorHandler } from "./http.ts";
import { authRouter } from "./routes/auth.ts";
import { ledgerRouter } from "./routes/ledger.ts";
import { peopleRouter } from "./routes/people.ts";
import { recordsRouter } from "./routes/records.ts";

export function createApp(db: Database) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ["X-Chat-Mode"] }));
  app.use(express.json({ limit: "200kb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, chat: config.anthropicApiKey ? "claude" : "offline", anchoring: Boolean(config.ledgerServiceUrl) });
  });

  const auth = authenticate(db);
  app.use("/api/auth", authRouter(db));
  app.use("/api/records", auth, recordsRouter(db));
  app.use("/api/ledger", auth, ledgerRouter(db));
  app.use("/api/chat", auth, chatRouter(db));
  app.use("/api", auth, peopleRouter(db));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });
  app.use(errorHandler);
  return app;
}
