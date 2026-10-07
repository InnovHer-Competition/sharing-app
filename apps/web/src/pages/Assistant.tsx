import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type { Role } from "@pcos/shared";
import { chatAdapter } from "../chat/adapter";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/Layout";
import { useUser } from "../lib/auth";

const SUGGESTIONS: Record<Role, string[]> = {
  patient: [
    "Summarize my latest visit",
    "How has my cycle length changed?",
    "What does my LH:FSH ratio mean?",
    "Who can see my records?",
  ],
  doctor: ["Which of my patients meet the Rotterdam criteria?", "Summarize the latest visit for each patient", "Flag any abnormal labs"],
  researcher: ["Summarize the phenotype distribution", "How many subjects meet the Rotterdam criteria?", "Describe the dataset"],
};

const MarkdownText = () => <MarkdownTextPrimitive smooth />;

function UserMessage() {
  return (
    <MessagePrimitive.Root className="msg msg-user">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="msg msg-assistant">
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  );
}

export function Assistant() {
  const user = useUser();
  const runtime = useLocalRuntime(chatAdapter);

  return (
    <>
      <PageHeader
        title="Health assistant"
        subtitle={
          user.role === "researcher"
            ? "Ask about the de-identified research dataset."
            : "Ask about PCOS and the records you have access to. It only sees data you're allowed to see."
        }
      />
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="card chat">
          <ThreadPrimitive.Viewport className="chat-viewport">
            <ThreadPrimitive.Empty>
              <div className="chat-empty">
                <span className="brand-mark" style={{ width: 40, height: 40 }}>
                  <Icon name="chat" />
                </span>
                <h2>How can I help?</h2>
                <p className="muted" style={{ margin: 0 }}>
                  I explain PCOS records in plain language. I'm not a substitute for your doctor.
                </p>
                <div className="suggestions">
                  {SUGGESTIONS[user.role].map((s) => (
                    <ThreadPrimitive.Suggestion key={s} prompt={s} send className="suggestion">
                      {s}
                    </ThreadPrimitive.Suggestion>
                  ))}
                </div>
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
            </ThreadPrimitive.Messages>
            <ThreadPrimitive.If running>
              <p className="typing" aria-live="polite">
                Assistant is typing…
              </p>
            </ThreadPrimitive.If>
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root className="composer">
            <ComposerPrimitive.Input placeholder="Ask about your PCOS records…" rows={1} autoFocus aria-label="Message" />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send className="btn btn-primary" aria-label="Send">
                <Icon name="send" />
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel className="btn">Stop</ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </>
  );
}
