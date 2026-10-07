import type { AccessGrant, PcosRecord, PublicUser } from "./types";

/*
 * Access policy, kept as pure functions so the API, the UI and the tests
 * share one source of truth. The on-chain registry (separate repo) is
 * expected to enforce the same rules.
 *
 *  - Patients: full CRUD on their own records; grant/revoke doctors.
 *  - Doctors: read, create and update records of patients who granted them
 *    access; delete only records they authored.
 *  - Researchers: no identified records. They see de-identified data from
 *    patients who opted in to research.
 */

export function hasActiveGrant(grants: readonly AccessGrant[], patientId: string, doctorId: string): boolean {
  return grants.some((g) => g.patientId === patientId && g.doctorId === doctorId && !g.revokedAt);
}

export function canReadPatient(user: PublicUser, patientId: string, grants: readonly AccessGrant[]): boolean {
  if (user.role === "patient") return user.id === patientId;
  if (user.role === "doctor") return hasActiveGrant(grants, patientId, user.id);
  return false;
}

export const canCreateRecordFor = canReadPatient;

export function canUpdateRecord(user: PublicUser, record: PcosRecord, grants: readonly AccessGrant[]): boolean {
  return canReadPatient(user, record.patientId, grants);
}

export function canDeleteRecord(user: PublicUser, record: PcosRecord, grants: readonly AccessGrant[]): boolean {
  if (user.role === "patient") return user.id === record.patientId;
  if (user.role === "doctor") return record.authorId === user.id && hasActiveGrant(grants, record.patientId, user.id);
  return false;
}

export function visibleRecords(
  user: PublicUser,
  records: readonly PcosRecord[],
  grants: readonly AccessGrant[],
): PcosRecord[] {
  return records.filter((r) => canReadPatient(user, r.patientId, grants));
}

export type DeidentifiedRecord = Omit<PcosRecord, "id" | "patientId" | "authorId" | "notes" | "medications" | "visitDate" | "createdAt" | "updatedAt"> & {
  subject: string;
  visitYear: number;
};

/**
 * Strips direct identifiers and free text, coarsens dates to the year and
 * replaces the patient id with a stable pseudonym.
 */
export function deidentify(record: PcosRecord, pseudonym: string): DeidentifiedRecord {
  const {
    id: _id,
    patientId: _p,
    authorId: _a,
    notes: _n,
    medications: _m,
    visitDate,
    createdAt: _c,
    updatedAt: _u,
    ...clinical
  } = record;
  return { ...clinical, subject: pseudonym, visitYear: Number(visitDate.slice(0, 4)) };
}

export function researchDataset(
  user: PublicUser,
  records: readonly PcosRecord[],
  patients: readonly PublicUser[],
): DeidentifiedRecord[] {
  if (user.role !== "researcher") return [];
  const consenting = new Map(
    patients
      .filter((p) => p.role === "patient" && p.researchConsent)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((p, i) => [p.id, `S-${String(i + 1).padStart(3, "0")}`] as const),
  );
  return records.flatMap((r) => {
    const pseudonym = consenting.get(r.patientId);
    return pseudonym ? [deidentify(r, pseudonym)] : [];
  });
}
