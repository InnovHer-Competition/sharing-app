import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { createApp } from "../src/app.ts";
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
let drKim: Session;
let researcher: Session;

beforeAll(async () => {
  await seedDemoData(db);
  [anna, drKim, researcher] = await Promise.all(
    ["anna@demo.health", "dr.kim@demo.health", "research@demo.health"].map(login),
  );
});

describe("auth", () => {
  it("signs up a new patient and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ name: "New Patient", email: "New@Example.com", password: "longenough", role: "patient" })
      .expect(201);
    expect(res.body.user).toMatchObject({ email: "new@example.com", role: "patient", researchConsent: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    await request(app).get("/api/auth/me").set(auth(res.body.token)).expect(200);
  });

  it("rejects duplicate emails, weak passwords and wrong credentials", async () => {
    await request(app)
      .post("/api/auth/signup")
      .send({ name: "Dup", email: "anna@demo.health", password: "longenough", role: "patient" })
      .expect(409);
    await request(app)
      .post("/api/auth/signup")
      .send({ name: "X", email: "x@y.z", password: "short", role: "patient" })
      .expect(400);
    await request(app).post("/api/auth/signin").send({ email: "anna@demo.health", password: "wrong" }).expect(401);
  });

  it("requires a valid token", async () => {
    await request(app).get("/api/records").expect(401);
    await request(app).get("/api/records").set(auth("not-a-token")).expect(401);
  });

  it("links a wallet and signs in with a signature", async () => {
    const wallet = Wallet.createRandom();
    const nonce = async () =>
      (await request(app).get("/api/auth/wallet/nonce").query({ address: wallet.address }).expect(200)).body
        .message as string;

    await request(app)
      .post("/api/auth/wallet/link")
      .set(auth(anna.token))
      .send({ address: wallet.address, signature: await wallet.signMessage(await nonce()) })
      .expect(200);

    const signature = await wallet.signMessage(await nonce());
    const res = await request(app).post("/api/auth/wallet").send({ address: wallet.address, signature }).expect(200);
    expect(res.body.user.id).toBe(anna.user.id);
    // A nonce works only once.
    await request(app).post("/api/auth/wallet").send({ address: wallet.address, signature }).expect(400);
  });
});

describe("records access control", () => {
  it("patients only see their own records", async () => {
    const res = await request(app).get("/api/records").set(auth(anna.token)).expect(200);
    expect(res.body.records.length).toBeGreaterThan(0);
    expect(res.body.records.every((r: { patientId: string }) => r.patientId === anna.user.id)).toBe(true);
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

  it("doctors need a grant, and lose access when it is revoked", async () => {
    await request(app).get("/api/records").query({ patientId: anna.user.id }).set(auth(drKim.token)).expect(403);
    await request(app)
      .post("/api/records")
      .set(auth(drKim.token))
      .send({ patientId: anna.user.id, visitDate: "2026-09-01" })
      .expect(403);

    const grant = await request(app)
      .post("/api/grants")
      .set(auth(anna.token))
      .send({ doctorId: drKim.user.id })
      .expect(201);
    const created = await request(app)
      .post("/api/records")
      .set(auth(drKim.token))
      .send({ patientId: anna.user.id, visitDate: "2026-09-02", hirsutismScore: 5 })
      .expect(201);

    // Doctors cannot delete records written by someone else.
    const annaRecords = (await request(app).get("/api/records").set(auth(anna.token))).body.records;
    const notTheirs = annaRecords.find((r: { authorId: string }) => r.authorId !== drKim.user.id);
    await request(app).delete(`/api/records/${notTheirs.id}`).set(auth(drKim.token)).expect(403);

    await request(app).delete(`/api/grants/${grant.body.grant.id}`).set(auth(anna.token)).expect(200);
    await request(app).get(`/api/records/${created.body.record.id}`).set(auth(drKim.token)).expect(404);
  });

  it("researchers get no identified records, only the de-identified dataset", async () => {
    const own = await request(app).get("/api/records").set(auth(researcher.token)).expect(200);
    expect(own.body.records).toEqual([]);
    const res = await request(app).get("/api/research/dataset").set(auth(researcher.token)).expect(200);
    expect(res.body.consentingPatients).toBe(2);
    for (const row of res.body.records) {
      expect(row).not.toHaveProperty("patientId");
      expect(row).not.toHaveProperty("notes");
      expect(row.subject).toMatch(/^S-\d{3}$/);
    }
    await request(app).get("/api/research/dataset").set(auth(anna.token)).expect(403);
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

describe("ledger", () => {
  it("records every write and verifies the chain", async () => {
    const before = (await request(app).get("/api/ledger").set(auth(anna.token))).body.height;
    await request(app).put("/api/me/research-consent").set(auth(anna.token)).send({ consent: false }).expect(200);
    const after = await request(app).get("/api/ledger").set(auth(anna.token)).expect(200);
    expect(after.body.height).toBe(before + 1);
    expect(after.body.blocks[0].tx).toMatchObject({ type: "RESEARCH_CONSENT_CHANGED", actorId: anna.user.id });
    const verify = await request(app).get("/api/ledger/verify").set(auth(anna.token)).expect(200);
    expect(verify.body).toMatchObject({ valid: true });
  });

  it("detects tampering with stored blocks", async () => {
    db.sql.prepare("UPDATE blocks SET timestamp = '2000-01-01T00:00:00.000Z' WHERE idx = 3").run();
    const verify = await request(app).get("/api/ledger/verify").set(auth(anna.token)).expect(200);
    expect(verify.body).toMatchObject({ valid: false, brokenAt: 3 });
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

  it("does not reveal patients to a doctor without a grant", async () => {
    const res = await request(app)
      .post("/api/chat")
      .set(auth(drKim.token))
      .send({ messages: [{ role: "user", content: "Summarize Anna" }] })
      .expect(200);
    expect(res.text).not.toContain("Anna Nguyen");
  });
});
