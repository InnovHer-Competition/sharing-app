export type Role = "patient" | "doctor" | "researcher";

export const ROLES: readonly Role[] = ["patient", "doctor", "researcher"];

/** A user as exposed by the API (credentials never leave the server). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  walletAddress?: string;
  /** Patient-only: share de-identified records with researchers. */
  researchConsent?: boolean;
  createdAt: string;
}

/** What another user is allowed to see about someone (e.g. a doctor list). */
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

export interface AccessGrant {
  id: string;
  patientId: string;
  doctorId: string;
  grantedAt: string;
  revokedAt?: string;
}

export type TxType =
  | "GENESIS"
  | "USER_REGISTERED"
  | "WALLET_LINKED"
  | "RECORD_CREATED"
  | "RECORD_UPDATED"
  | "RECORD_DELETED"
  | "ACCESS_GRANTED"
  | "ACCESS_REVOKED"
  | "RESEARCH_CONSENT_CHANGED";

export interface Transaction {
  type: TxType;
  actorId: string;
  /** The entity the transaction is about (record id, user id, grant id). */
  subjectId: string;
  /** SHA-256 of the off-chain payload. Health data itself never goes on the ledger. */
  payloadHash: string;
}

export interface Block {
  index: number;
  timestamp: string;
  prevHash: string;
  hash: string;
  tx: Transaction;
  /** Reference returned by the external blockchain service once the block is anchored there. */
  anchorRef?: string;
}

export type RecordInput = Omit<PcosRecord, "id" | "authorId" | "createdAt" | "updatedAt">;

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface GrantView extends AccessGrant {
  patient: UserSummary;
  doctor: UserSummary;
}

export interface LedgerVerification {
  valid: boolean;
  length: number;
  brokenAt?: number;
  reason?: string;
}
