import Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import { z } from "zod";
import { currentUser } from "../auth.ts";
import { config } from "../config.ts";
import type { Database } from "../db.ts";
import { parseBody, rateLimit } from "../http.ts";
import { buildChatContext } from "./context.ts";
import { offlineReply } from "./offline.ts";

const SYSTEM_PROMPT = `You are the assistant inside PCOS Health Ledger, an app where patients, doctors and researchers share polycystic ovary syndrome (PCOS) health records with consent.

How to help:
- Patients: explain their own records in plain language (cycle regularity, BMI, LH:FSH ratio, androgens, AMH, HOMA-IR, ultrasound findings, the Rotterdam criteria and phenotypes A–D), point out trends between visits, and suggest questions to bring to their doctor. Offer evidence-based lifestyle information from the 2023 International PCOS Guideline where relevant.
- Doctors: summarize and compare records of the patients who have granted them access, and flag values outside common reference ranges. Leave clinical decisions to the doctor.
- Researchers: discuss only the de-identified, aggregated figures provided. Never attempt to re-identify anyone.

Ground rules:
- Use only the data in the "Data available to this user" message. If something isn't there, say so. Never invent values.
- You are not a diagnostic tool. When results look abnormal or the user asks what to do medically, recommend discussing it with a clinician. For urgent symptoms (severe pain, heavy bleeding, chest pain, thoughts of self-harm) tell them to seek emergency care.
- Lab reference ranges vary by laboratory; say so when interpreting borderline values.
- Keep answers concise and well structured with short Markdown lists or tables. Reply in the user's language.
- Access to records is managed on the Sharing page and every change is recorded on the audit ledger; mention this if asked about privacy.`;

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m.at(-1)?.role === "user", "The last message must come from the user."),
});

const client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : undefined;

export function chatRouter(db: Database) {
  const router = Router();

  router.post("/", rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
    const user = currentUser(req);
    const { messages } = parseBody(chatSchema, req.body);
    const context = buildChatContext(db, user);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Chat-Mode", client ? "claude" : "offline");

    if (!client) {
      res.end(offlineReply(messages.at(-1)!.content, context));
      return;
    }

    const stream = client.beta.messages.stream({
      model: config.chatModel,
      max_tokens: 16000,
      output_config: { effort: config.chatEffort },
      // If a safety classifier declines, the API re-runs the request on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Data available to this user:\n\n${context.summary}` },
      ],
      messages,
    });
    res.on("close", () => {
      if (!res.writableFinished) stream.abort();
    });
    stream.on("text", (text) => res.write(text));

    try {
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        res.write("\n\nI can't help with that request. Please rephrase it or ask your clinician.");
      } else if (final.stop_reason === "max_tokens") {
        res.write("\n\n_(Answer cut short. Ask me to continue.)_");
      }
    } catch (error) {
      if (stream.aborted) return;
      console.error("Chat request failed:", error);
      const message =
        error instanceof Anthropic.RateLimitError
          ? "The assistant is busy right now. Please try again in a minute."
          : "Sorry, the assistant is unavailable right now. Please try again.";
      if (!res.headersSent) res.status(502);
      res.write(`\n\n${message}`);
    }
    res.end();
  });

  return router;
}
