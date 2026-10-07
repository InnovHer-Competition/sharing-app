import type { AccessGrant, PcosRecord } from "@pcos/shared";
import { hashPassword, randomId } from "./crypto.ts";
import type { Database, UserRow } from "./db.ts";

export const DEMO_PASSWORD = "Demo1234!";

/** Seeds demo accounts (password: Demo1234!) and records into an empty database. */
export async function seedDemoData(db: Database) {
  if (db.userByEmail("anna@demo.health")) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const user = (email: string, name: string, role: UserRow["role"], createdAt: string, researchConsent?: boolean): UserRow => ({
    id: randomId(),
    email,
    name,
    role,
    passwordHash,
    researchConsent: role === "patient" ? Boolean(researchConsent) : undefined,
    createdAt,
  });

  const anna = user("anna@demo.health", "Anna Nguyen", "patient", "2025-01-10T09:00:00.000Z", true);
  const mai = user("mai@demo.health", "Mai Tran", "patient", "2025-02-02T09:00:00.000Z", true);
  const linh = user("linh@demo.health", "Linh Pham", "patient", "2025-03-15T09:00:00.000Z", false);
  const doctor = user("dr.le@demo.health", "Dr. Hazel Le", "doctor", "2025-01-05T09:00:00.000Z");
  const doctor2 = user("dr.kim@demo.health", "Dr. Minh Kim", "doctor", "2025-01-06T09:00:00.000Z");
  const researcher = user("research@demo.health", "Dr. Sara Vo", "researcher", "2025-01-07T09:00:00.000Z");

  for (const u of [doctor, doctor2, researcher, anna, mai, linh]) {
    db.transact(
      { type: "USER_REGISTERED", actorId: u.id, subjectId: u.id, payload: { id: u.id, email: u.email, role: u.role } },
      () => db.insertUser(u),
      u.createdAt,
    );
  }

  const grants: AccessGrant[] = [
    { id: randomId(), patientId: anna.id, doctorId: doctor.id, grantedAt: "2025-01-11T10:00:00.000Z" },
    { id: randomId(), patientId: mai.id, doctorId: doctor.id, grantedAt: "2025-02-03T10:00:00.000Z" },
    { id: randomId(), patientId: linh.id, doctorId: doctor2.id, grantedAt: "2025-03-16T10:00:00.000Z" },
  ];
  for (const g of grants) {
    db.transact(
      { type: "ACCESS_GRANTED", actorId: g.patientId, subjectId: g.id, payload: g, patientId: g.patientId },
      () => db.insertGrant(g),
      g.grantedAt,
    );
  }

  type Visit = Omit<PcosRecord, "id" | "patientId" | "authorId" | "createdAt" | "updatedAt">;
  const visits: [UserRow, UserRow, Visit][] = [
    [anna, doctor, { visitDate: "2025-01-20", cycleLengthDays: 52, periodsPerYear: 6, weightKg: 78, heightCm: 162, waistCm: 92, lh: 14.2, fsh: 5.6, totalTestosterone: 72, amh: 8.4, fastingGlucose: 98, fastingInsulin: 18, follicleCount: 24, ovarianVolumeMl: 12.1, hirsutismScore: 9, acne: true, hairLoss: false, notes: "Initial assessment. Irregular cycles since menarche, hirsutism on chin and abdomen.", medications: "None" }],
    [anna, doctor, { visitDate: "2025-05-14", cycleLengthDays: 45, periodsPerYear: 7, weightKg: 75, heightCm: 162, waistCm: 89, lh: 12.1, fsh: 5.9, totalTestosterone: 66, fastingGlucose: 95, fastingInsulin: 15, hirsutismScore: 8, acne: true, notes: "Started lifestyle program and metformin 500 mg BID.", medications: "Metformin 500 mg BID" }],
    [anna, anna, { visitDate: "2025-09-02", cycleLengthDays: 39, periodsPerYear: 9, weightKg: 72.5, heightCm: 162, waistCm: 86, notes: "Self-reported: cycles more regular, exercising 3×/week." }],
    [anna, doctor, { visitDate: "2026-01-18", cycleLengthDays: 34, periodsPerYear: 10, weightKg: 70, heightCm: 162, waistCm: 83, lh: 9.8, fsh: 6.1, totalTestosterone: 58, amh: 6.9, fastingGlucose: 91, fastingInsulin: 11, follicleCount: 21, ovarianVolumeMl: 10.4, hirsutismScore: 7, acne: false, notes: "Good response to treatment. Continue metformin; review in 6 months.", medications: "Metformin 500 mg BID" }],
    [anna, doctor, { visitDate: "2026-07-09", cycleLengthDays: 31, periodsPerYear: 11, weightKg: 68.4, heightCm: 162, waistCm: 81, lh: 8.7, fsh: 6.3, totalTestosterone: 52, fastingGlucose: 88, fastingInsulin: 9, hirsutismScore: 6, acne: false, medications: "Metformin 500 mg BID" }],
    [mai, doctor, { visitDate: "2025-02-10", cycleLengthDays: 29, periodsPerYear: 12, weightKg: 58, heightCm: 158, lh: 7.1, fsh: 6.4, totalTestosterone: 68, amh: 7.2, follicleCount: 26, ovarianVolumeMl: 11.0, hirsutismScore: 10, acne: true, notes: "Regular cycles; hyperandrogenism with PCOM." }],
    [mai, doctor, { visitDate: "2025-11-21", cycleLengthDays: 30, periodsPerYear: 12, weightKg: 57.5, heightCm: 158, totalTestosterone: 61, hirsutismScore: 8, acne: true, medications: "Combined oral contraceptive" }],
    [linh, doctor2, { visitDate: "2025-03-20", cycleLengthDays: 60, periodsPerYear: 5, weightKg: 64, heightCm: 165, lh: 11.5, fsh: 5.0, totalTestosterone: 40, amh: 9.1, follicleCount: 28, ovarianVolumeMl: 13.2, hirsutismScore: 2, acne: false }],
  ];
  for (const [patient, author, visit] of visits) {
    const at = `${visit.visitDate}T12:00:00.000Z`;
    const record: PcosRecord = { ...visit, id: randomId(), patientId: patient.id, authorId: author.id, createdAt: at, updatedAt: at };
    db.transact(
      { type: "RECORD_CREATED", actorId: author.id, subjectId: record.id, payload: record, patientId: patient.id },
      () => db.upsertRecord(record),
      at,
    );
  }
  console.log(`Seeded demo accounts (password "${DEMO_PASSWORD}"): anna@, mai@, linh@, dr.le@, dr.kim@, research@demo.health`);
}
