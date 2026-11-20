import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { config } from "../src/config.ts";
import { Database } from "../src/db.ts";
import { DEMO_PASSWORD, seedDemoData } from "../src/seed.ts";

const db = new Database(":memory:");
const app = createApp(db);

interface Session {
  token: string;
  user: { id: string; role: string };
}

async function login(email: string): Promise<Session> {
  const res = await request(app).post("/api/auth/signin").send({ email, password: DEMO_PASSWORD }).expect(200);
  return res.body;
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let anna: Session;
let mai: Session;
let drKim: Session;

beforeAll(async () => {
  await seedDemoData(db);
  [anna, mai, drKim] = await Promise.all(["anna@demo.health", "mai@demo.health", "dr.kim@demo.health"].map(login));
});

describe("auth", () => {
  it("signs up a new patient and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ name: "New Patient", email: "New@Example.com", password: "longenough", role: "patient" })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: "new@example.com", role: "patient" });
    expect(res.body.user.passwordHash).toBeUndefined();
    await request(app).get("/api/auth/me").set(auth(res.body.token)).expect(200);
  });

  it("rejects duplicate emails, weak passwords, unknown roles and wrong credentials", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ name: "Dup", email: "anna@demo.health", password: "longenough", role: "patient" })
      .expect(409);
    await request(app).post("/api/auth/signup").send({ name: "X", email: "x@y.z", password: "short", role: "patient" }).expect(400);
    await request(app)
      .post("/api/auth/signup")
      .send({ name: "R", email: "r@y.z", password: "longenough", role: "researcher" })
      .expect(400);
    await request(app).post("/api/auth/signin").send({ email: "anna@demo.health", password: "wrong" }).expect(401);
  });

  it("requires a valid token", async () => {
    await request(app).get("/api/records").expect(401);
    await request(app).get("/api/records").set(auth("not-a-token")).expect(401);
  });
});

describe("records permissions", () => {
  it("patients only see their own records", async () => {
    const res = await request(app).get("/api/records").set(auth(anna.token)).expect(200);
    expect(res.body.records.length).toBeGreaterThan(0);
    expect(res.body.records.every((r: { patientId: string }) => r.patientId === anna.user.id)).toBe(true);
    await request(app).get("/api/records").query({ patientId: anna.user.id }).set(auth(mai.token)).expect(403);
  });

  it("patients can create, update and delete their own records", async () => {
    const created = await request(app)
      .post("/api/records")
      .set(auth(anna.token))
      .send({ patientId: anna.user.id, visitDate: "2026-09-01", cycleLengthDays: 30 })
      .expect(201);
    const id = created.body.record.id;
    const updated = await request(app)
      .put(`/api/records/${id}`)
      .set(auth(anna.token))
      .send({ visitDate: "2026-09-01", cycleLengthDays: 29, weightKg: 68 })
      .expect(200);
    expect(updated.body.record).toMatchObject({ cycleLengthDays: 29, weightKg: 68, patientId: anna.user.id });
    await request(app).delete(`/api/records/${id}`).set(auth(anna.token)).expect(204);
    await request(app).get(`/api/records/${id}`).set(auth(anna.token)).expect(404);
  });

  it("doctors see every patient and can add visits, but delete only their own records", async () => {
    const patients = (await request(app).get("/api/patients").set(auth(drKim.token)).expect(200)).body.patients;
    expect(patients.map((p: { id: string }) => p.id)).toContain(anna.user.id);
    await request(app).get("/api/patients").set(auth(anna.token)).expect(403);

    const created = await request(app)
      .post("/api/records")
      .set(auth(drKim.token))
      .send({ patientId: anna.user.id, visitDate: "2026-09-02", hirsutismScore: 5 })
      .expect(201);

    const annaRecords = (await request(app).get("/api/records").set(auth(anna.token))).body.records;
    const notTheirs = annaRecords.find((r: { authorId: string }) => r.authorId !== drKim.user.id);
    await request(app).delete(`/api/records/${notTheirs.id}`).set(auth(drKim.token)).expect(403);
    await request(app).delete(`/api/records/${created.body.record.id}`).set(auth(drKim.token)).expect(204);
  });

  it("does not create records for unknown patients", async () => {
    await request(app)
      .post("/api/records")
      .set(auth(drKim.token))
      .send({ patientId: drKim.user.id, visitDate: "2026-09-02" })
      .expect(404);
  });

  it("validates record input", async () => {
    await request(app)
      .post("/api/records")
      .set(auth(anna.token))
      .send({ patientId: anna.user.id, visitDate: "not-a-date" })
      .expect(400);
    await request(app)
      .post("/api/records")
      .set(auth(anna.token))
      .send({ patientId: anna.user.id, visitDate: "2026-01-01", cycleLengthDays: -5 })
      .expect(400);
  });
});

describe("chat", () => {
  it("answers from the user's own data in offline mode", async () => {
    const res = await request(app)
      .post("/api/chat")
      .set(auth(anna.token))
      .send({ messages: [{ role: "user", content: "What is my BMI?" }] })
      .expect(200);
    expect(res.headers["x-chat-mode"]).toBe("offline");
    expect(res.text).toContain("BMI");
  });

  describe("with the chatbot service", () => {
    let bot: Server;
    let received: Record<string, unknown> | undefined;
    let fail = false;

    beforeAll(async () => {
      // Stands in for the FastAPI chat-bot: POST /api/v1/chat { message } → { reply }.
      bot = createServer((req, res) => {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          received = JSON.parse(body);
          if (req.url !== "/api/v1/chat" || fail) {
            res.writeHead(500, { "content-type": "application/json" }).end('{"detail":"boom"}');
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ reply: `RAG answer to: ${received!.message}`, module_used: "Module A (RAG Q&A)" }));
        });
      });
      await new Promise<void>((resolve) => bot.listen(0, "127.0.0.1", resolve));
      config.chatbotUrl = `http://127.0.0.1:${(bot.address() as AddressInfo).port}`;
    });

    afterAll(() => {
      config.chatbotUrl = undefined;
      bot.close();
    });

    it("forwards the question with the user's permitted records", async () => {
      const res = await request(app)
        .post("/api/chat")
        .set(auth(anna.token))
        .send({ messages: [{ role: "user", content: "What is PCOS?" }] })
        .expect(200);
      expect(res.headers["x-chat-mode"]).toBe("chatbot");
      expect(res.text).toBe("RAG answer to: What is PCOS?");
      expect(received).toMatchObject({ message: "What is PCOS?", role: "patient", history: [] });
      expect(received!.context).toContain("Your records");
      expect(received!.context).not.toContain("Mai Tran");
    });

    it("falls back to the offline assistant when the service fails", async () => {
      fail = true;
      const res = await request(app)
        .post("/api/chat")
        .set(auth(anna.token))
        .send({ messages: [{ role: "user", content: "What is my BMI?" }] })
        .expect(200);
      fail = false;
      expect(res.headers["x-chat-mode"]).toBe("offline");
      expect(res.text).toContain("unavailable");
      expect(res.text).toContain("BMI");
    });
  });
});
