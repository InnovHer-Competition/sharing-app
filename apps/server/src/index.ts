import { startAnchoring } from "./anchor.ts";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { Database } from "./db.ts";
import { seedDemoData } from "./seed.ts";

const db = new Database(config.databasePath);
if (config.seedDemo) await seedDemoData(db);
startAnchoring(db);

const server = createApp(db).listen(config.port, () => {
  console.log(`PCOS Health Ledger API listening on http://localhost:${config.port}`);
  console.log(`Chatbot: ${config.anthropicApiKey ? `Claude (${config.chatModel})` : "offline assistant (set ANTHROPIC_API_KEY to use Claude)"}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.sql.close();
      process.exit(0);
    });
  });
}
