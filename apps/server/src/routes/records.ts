import { Router } from "express";
import { z } from "zod";
import {
  canCreateRecordFor,
  canDeleteRecord,
  canReadPatient,
  canUpdateRecord,
  type PcosRecord,
  type PublicUser,
} from "@pcos/shared";
import { currentUser } from "../auth.ts";
import { randomId } from "../crypto.ts";
import type { Database } from "../db.ts";
import { forbidden, notFound, parseBody } from "../http.ts";

const num = (min: number, max: number) => z.number().min(min).max(max).optional();

export const recordFieldsSchema = z.object({
  visitDate: z.iso.date("Visit date must be a valid date (YYYY-MM-DD)."),
  cycleLengthDays: num(10, 365),
  periodsPerYear: num(0, 20),
  weightKg: num(20, 350),
  heightCm: num(100, 230),
  waistCm: num(30, 250),
  lh: num(0, 200),
  fsh: num(0, 200),
  totalTestosterone: num(0, 2000),
  amh: num(0, 100),
  fastingGlucose: num(20, 600),
  fastingInsulin: num(0, 500),
  follicleCount: num(0, 100),
  ovarianVolumeMl: num(0, 100),
  hirsutismScore: num(0, 36),
  acne: z.boolean().optional(),
  hairLoss: z.boolean().optional(),
  medications: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
});

const createSchema = recordFieldsSchema.extend({ patientId: z.string().min(1) });

/** Patient ids whose identified records this user may read. */
export function readablePatientIds(db: Database, user: PublicUser): string[] {
  if (user.role === "patient") return [user.id];
  if (user.role === "doctor") return [...new Set(db.grantsForDoctor(user.id).filter((g) => !g.revokedAt).map((g) => g.patientId))];
  return [];
}

export function recordsRouter(db: Database) {
  const router = Router();
  const grantsFor = (patientId: string) => db.grantsForPatient(patientId);

  router.get("/", (req, res) => {
    const user = currentUser(req);
    const requested = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    if (requested && !canReadPatient(user, requested, grantsFor(requested))) throw forbidden();
    const ids = requested ? [requested] : readablePatientIds(db, user);
    res.json({ records: db.recordsForPatients(ids) });
  });

  router.get("/:id", (req, res) => {
    const user = currentUser(req);
    const record = db.recordById(req.params.id);
    if (!record || !canReadPatient(user, record.patientId, grantsFor(record.patientId))) throw notFound("Record not found.");
    res.json({ record });
  });

  router.post("/", (req, res) => {
    const user = currentUser(req);
    const input = parseBody(createSchema, req.body);
    if (!canCreateRecordFor(user, input.patientId, grantsFor(input.patientId)))
      throw forbidden("You don't have permission to add records for this patient.");
    const now = new Date().toISOString();
    const record: PcosRecord = { ...input, id: randomId(), authorId: user.id, createdAt: now, updatedAt: now };
    db.transact(
      { type: "RECORD_CREATED", actorId: user.id, subjectId: record.id, payload: record, patientId: record.patientId },
      () => db.upsertRecord(record),
    );
    res.status(201).json({ record });
  });

  router.put("/:id", (req, res) => {
    const user = currentUser(req);
    const existing = db.recordById(req.params.id);
    if (!existing || !canReadPatient(user, existing.patientId, grantsFor(existing.patientId)))
      throw notFound("Record not found.");
    if (!canUpdateRecord(user, existing, grantsFor(existing.patientId))) throw forbidden();
    const input = parseBody(recordFieldsSchema, req.body);
    // PUT replaces the clinical fields; identity and authorship are preserved.
    const record: PcosRecord = {
      ...input,
      id: existing.id,
      patientId: existing.patientId,
      authorId: existing.authorId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    db.transact(
      { type: "RECORD_UPDATED", actorId: user.id, subjectId: record.id, payload: record, patientId: record.patientId },
      () => db.upsertRecord(record),
    );
    res.json({ record });
  });

  router.delete("/:id", (req, res) => {
    const user = currentUser(req);
    const existing = db.recordById(req.params.id);
    if (!existing || !canReadPatient(user, existing.patientId, grantsFor(existing.patientId)))
      throw notFound("Record not found.");
    if (!canDeleteRecord(user, existing, grantsFor(existing.patientId)))
      throw forbidden("Only the patient, or the doctor who wrote this record, can delete it.");
    db.transact(
      {
        type: "RECORD_DELETED",
        actorId: user.id,
        subjectId: existing.id,
        payload: { id: existing.id, deletedAt: new Date().toISOString() },
        patientId: existing.patientId,
      },
      () => db.deleteRecord(existing.id),
    );
    res.status(204).end();
  });

  return router;
}
