import { Router } from "express";
import { z } from "zod";
import { currentUser } from "../auth.ts";
import { config } from "../config.ts";
import type { Database } from "../db.ts";
import { parseBody, rateLimit } from "../http.ts";
import { askChatbot } from "./client.ts";
import { buildChatContext } from "./context.ts";
import { offlineReply } from "./offline.ts";

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m.at(-1)?.role === "user", "The last message must come from the user."),
});

/**
 * Chat gateway: forwards the question to the PCOS chatbot service
 * (InnovHer-Competition/chat-bot) together with the records the signed-in
 * user may see, and falls back to the built-in offline assistant when the
 * service isn't configured or can't be reached.
 */
export function chatRouter(db: Database) {
  const router = Router();

  router.post("/", rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
    const user = currentUser(req);
    const { messages } = parseBody(chatSchema, req.body);
    const question = messages.at(-1)!.content;
    const context = buildChatContext(db, user);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (!config.chatbotUrl) {
      res.setHeader("X-Chat-Mode", "offline");
      res.end(offlineReply(question, context));
      return;
    }

    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) abort.abort();
    });

    try {
      const reply = await askChatbot(
        { message: question, history: messages.slice(0, -1), role: user.role, context: context.summary },
        abort.signal,
      );
      res.setHeader("X-Chat-Mode", "chatbot");
      res.end(reply);
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error("Chatbot service request failed:", (error as Error).message);
      res.setHeader("X-Chat-Mode", "offline");
      res.end(
        "_The chatbot service is unavailable right now, so the built-in assistant answered instead._\n\n" +
          offlineReply(question, context),
      );
    }
  });

  return router;
}
