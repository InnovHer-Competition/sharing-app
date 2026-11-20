export type Role = "patient" | "doctor";

export const ROLES: readonly Role[] = ["patient", "doctor"];

/** A user as exposed by the API (credentials never leave the server). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

/** What another user is allowed to see about someone (e.g. a patient list). */
export type UserSummary = Pick<PublicUser, "id" | "name" | "role">;

/** One clinical observation of a PCOS patient. Units are noted per field. */
export interface PcosRecord {
  id: string;
  patientId: string;
  authorId: string;
  visitDate: string; // ISO date (yyyy-mm-dd)
  createdAt: string;
  updatedAt: string;

  // Menstrual history
  cycleLengthDays?: number;
  periodsPerYear?: number;

  // Anthropometrics
  weightKg?: number;
  heightCm?: number;
  waistCm?: number;

  // Labs
  lh?: number; // IU/L
  fsh?: number; // IU/L
  totalTestosterone?: number; // ng/dL
  amh?: number; // ng/mL
  fastingGlucose?: number; // mg/dL
  fastingInsulin?: number; // µIU/mL

  // Ultrasound
  follicleCount?: number; // max follicles per ovary (2-9 mm)
  ovarianVolumeMl?: number; // max ovarian volume

  // Clinical signs
  hirsutismScore?: number; // modified Ferriman-Gallwey
  acne?: boolean;
  hairLoss?: boolean;

  medications?: string;
  notes?: string;
}

export type RecordInput = Omit<PcosRecord, "id" | "authorId" | "createdAt" | "updatedAt">;

export interface AuthResponse {
  token: string;
  user: PublicUser;
}
