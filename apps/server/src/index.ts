import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { Database } from "./db.ts";
import { seedDemoData } from "./seed.ts";

const db = new Database(config.databasePath);
if (config.seedDemo) await seedDemoData(db);

const server = createApp(db).listen(config.port, () => {
  console.log(`PCOS App Interface API listening on http://localhost:${config.port}`);
  console.log(
    `Chatbot: ${config.chatbotUrl ? `PCOS chatbot service at ${config.chatbotUrl}` : "offline assistant (set CHATBOT_URL to use the chatbot service)"}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.sql.close();
      process.exit(0);
    });
  });
}
