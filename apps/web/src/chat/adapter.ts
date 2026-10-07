import type { ChatModelAdapter } from "@assistant-ui/react";
import { apiFetch } from "../lib/api";

/**
 * Streams replies from POST /api/chat. The server decides what data the
 * assistant may see, so the browser only sends the conversation text.
 */
export const chatAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    const history = messages
      .map((m) => ({
        role: m.role,
        content: m.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("")
          .trim(),
      }))
      .filter((m): m is { role: "user" | "assistant"; content: string } => (m.role === "user" || m.role === "assistant") && m.content !== "");

    const res = await apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify({ messages: history.slice(-40) }),
      signal: abortSignal,
    });
    if (!res.body) throw new Error("The assistant returned an empty response.");

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += value;
      yield { content: [{ type: "text", text }] };
    }
  },
};
