import { Router } from "express";
import { z } from "zod";
import { type AccessGrant, type GrantView, researchDataset, type UserSummary } from "@pcos/shared";
import { currentUser, requireRole } from "../auth.ts";
import { randomId } from "../crypto.ts";
import type { Database, UserRow } from "../db.ts";
import { toPublicUser } from "../db.ts";
import { HttpError, notFound, parseBody } from "../http.ts";
import { readablePatientIds } from "./records.ts";

const summary = (u: UserRow | undefined): UserSummary =>
  u ? { id: u.id, name: u.name, role: u.role } : { id: "unknown", name: "Unknown user", role: "patient" };

/** Consent (grants), directories and the de-identified research dataset. */
export function peopleRouter(db: Database) {
  const router = Router();

  const view = (g: AccessGrant): GrantView => ({
    ...g,
    patient: summary(db.userById(g.patientId)),
    doctor: summary(db.userById(g.doctorId)),
  });

  router.get("/grants", (req, res) => {
    const user = currentUser(req);
    const grants =
      user.role === "patient" ? db.grantsForPatient(user.id) : user.role === "doctor" ? db.grantsForDoctor(user.id) : [];
    res.json({ grants: grants.map(view) });
  });

  router.post("/grants", requireRole("patient"), (req, res) => {
    const user = currentUser(req);
    const { doctorId } = parseBody(z.object({ doctorId: z.string().min(1) }), req.body);
    const doctor = db.userById(doctorId);
    if (doctor?.role !== "doctor") throw notFound("Doctor not found.");
    if (db.grantsForPatient(user.id).some((g) => g.doctorId === doctorId && !g.revokedAt))
      throw new HttpError(409, `${doctor.name} already has access.`);
    const grant: AccessGrant = { id: randomId(), patientId: user.id, doctorId, grantedAt: new Date().toISOString() };
    db.transact(
      { type: "ACCESS_GRANTED", actorId: user.id, subjectId: grant.id, payload: grant, patientId: user.id },
      () => db.insertGrant(grant),
    );
    res.status(201).json({ grant: view(grant) });
  });

  router.delete("/grants/:id", requireRole("patient"), (req, res) => {
    const user = currentUser(req);
    const grant = db.grantById(String(req.params.id));
    if (!grant || grant.patientId !== user.id || grant.revokedAt) throw notFound("Active grant not found.");
    const revokedAt = new Date().toISOString();
    db.transact(
      { type: "ACCESS_REVOKED", actorId: user.id, subjectId: grant.id, payload: { ...grant, revokedAt }, patientId: user.id },
      () => db.revokeGrant(grant.id, revokedAt),
    );
    res.json({ grant: view({ ...grant, revokedAt }) });
  });

  router.put("/me/research-consent", requireRole("patient"), (req, res) => {
    const user = currentUser(req);
    const { consent } = parseBody(z.object({ consent: z.boolean() }), req.body);
    db.transact(
      { type: "RESEARCH_CONSENT_CHANGED", actorId: user.id, subjectId: user.id, payload: { userId: user.id, consent }, patientId: user.id },
      () => db.setResearchConsent(user.id, consent),
    );
    res.json({ user: toPublicUser(db.userById(user.id)!) });
  });

  /** Doctors a patient can choose from when granting access. */
  router.get("/doctors", requireRole("patient"), (_req, res) => {
    res.json({ doctors: db.usersByRole("doctor").map(summary) });
  });

  /** Patients who currently share their records with the signed-in doctor. */
  router.get("/patients", requireRole("doctor"), (req, res) => {
    const ids = readablePatientIds(db, currentUser(req));
    res.json({ patients: ids.map((id) => summary(db.userById(id))) });
  });

  router.get("/research/dataset", requireRole("researcher"), (req, res) => {
    const patients = db.consentingPatients();
    const records = db.recordsForPatients(patients.map((p) => p.id));
    res.json({
      consentingPatients: patients.length,
      records: researchDataset(currentUser(req), records, patients.map(toPublicUser)),
    });
  });

  return router;
}
