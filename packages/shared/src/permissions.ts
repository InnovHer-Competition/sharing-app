import type { PcosRecord, PublicUser } from "./types";

/*
 * Record permissions, kept as pure functions so the API, the UI and the tests
 * share one source of truth.
 *
 *  - Patients: full CRUD on their own records.
 *  - Doctors: read, create and update records of any patient; delete only
 *    records they authored.
 */

export function canReadPatient(user: PublicUser, patientId: string): boolean {
  if (user.role === "patient") return user.id === patientId;
  return user.role === "doctor";
}

export const canCreateRecordFor = canReadPatient;

export function canUpdateRecord(user: PublicUser, record: PcosRecord): boolean {
  return canReadPatient(user, record.patientId);
}

export function canDeleteRecord(user: PublicUser, record: PcosRecord): boolean {
  if (user.role === "patient") return user.id === record.patientId;
  return user.role === "doctor" && record.authorId === user.id;
}
