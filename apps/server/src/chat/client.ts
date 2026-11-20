import { config } from "../config.ts";

/*
 * Client for the PCOS chatbot service (InnovHer-Competition/chat-bot, FastAPI):
 *
 *   POST {CHATBOT_URL}/api/v1/chat
 *   { "message": "...", "history": [...], "role": "patient", "context": "..." }
 *   → { "reply": "...", "module_used": "Module A (RAG Q&A)" }
 *
 * The service currently reads only `message` (its RAG retriever uses the question
 * itself). `history`, `role` and `context` (the records this user may see) are
 * extra fields, which FastAPI ignores until the service starts using them.
 */

export interface ChatbotRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  role: string;
  context: string;
}

export async function askChatbot(body: ChatbotRequest, signal?: AbortSignal): Promise<string> {
  if (!config.chatbotUrl) throw new Error("CHATBOT_URL is not set");
  const res = await fetch(`${config.chatbotUrl}/api/v1/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.chatbotToken ? { authorization: `Bearer ${config.chatbotToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.chatbotTimeoutMs)]) : AbortSignal.timeout(config.chatbotTimeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`chatbot service responded ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await res.json()) as { reply?: unknown };
  if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("chatbot service returned an empty reply");
  return data.reply;
}
