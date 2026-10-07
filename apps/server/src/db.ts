import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AccessGrant, Block, PcosRecord, PublicUser, Role, Transaction } from "@pcos/shared";
import { createGenesisBlock, nextBlock, payloadHash } from "./ledger.ts";

/*
 * Off-chain storage (SQLite) for users, PCOS records and consent grants,
 * plus the hash-chained ledger table. Every mutating method writes the
 * entity and appends its ledger block in one SQL transaction.
 */

export interface UserRow extends PublicUser {
  passwordHash: string;
}

type Row = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient','doctor','researcher')),
  password_hash TEXT NOT NULL,
  wallet_address TEXT UNIQUE,
  research_consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  visit_date TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_patient ON records(patient_id, visit_date);
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES users(id),
  doctor_id TEXT NOT NULL REFERENCES users(id),
  granted_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS grants_patient ON grants(patient_id);
CREATE INDEX IF NOT EXISTS grants_doctor ON grants(doctor_id);
CREATE TABLE IF NOT EXISTS blocks (
  idx INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  tx TEXT NOT NULL,
  -- Not part of the hash: lets the API show each user the blocks that concern them.
  patient_id TEXT,
  anchor_ref TEXT
);
CREATE TABLE IF NOT EXISTS wallet_nonces (
  address TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

const toUser = (r: Row): UserRow => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  role: r.role as Role,
  passwordHash: r.password_hash as string,
  walletAddress: (r.wallet_address as string | null) ?? undefined,
  researchConsent: r.role === "patient" ? Boolean(r.research_consent) : undefined,
  createdAt: r.created_at as string,
});

export const toPublicUser = ({ passwordHash: _h, ...user }: UserRow): PublicUser => user;

const toRecord = (r: Row): PcosRecord => JSON.parse(r.data as string);

const toGrant = (r: Row): AccessGrant => ({
  id: r.id as string,
  patientId: r.patient_id as string,
  doctorId: r.doctor_id as string,
  grantedAt: r.granted_at as string,
  revokedAt: (r.revoked_at as string | null) ?? undefined,
});

const toBlock = (r: Row): Block => ({
  index: r.idx as number,
  timestamp: r.timestamp as string,
  prevHash: r.prev_hash as string,
  hash: r.hash as string,
  tx: JSON.parse(r.tx as string),
  anchorRef: (r.anchor_ref as string | null) ?? undefined,
});

export type LedgerEvent = Omit<Transaction, "payloadHash"> & { payload: unknown; patientId?: string };

export class Database {
  readonly sql: DatabaseSync;
  private blockListeners = new Set<(block: Block) => void>();

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.sql.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.sql.exec(SCHEMA);
    if (!this.sql.prepare("SELECT 1 FROM blocks LIMIT 1").get()) this.insertBlock(createGenesisBlock());
  }

  onBlock(listener: (block: Block) => void) {
    this.blockListeners.add(listener);
    return () => this.blockListeners.delete(listener);
  }

  /** Runs `write`, then appends a ledger block for `event`, atomically. */
  transact<T>(event: LedgerEvent | ((result: T) => LedgerEvent), write: () => T, timestamp?: string): T {
    this.sql.exec("BEGIN IMMEDIATE");
    let block: Block;
    let result: T;
    try {
      result = write();
      const { payload, patientId, ...tx } = typeof event === "function" ? event(result) : event;
      block = nextBlock(this.lastBlock(), { ...tx, payloadHash: payloadHash(payload) }, timestamp);
      this.insertBlock(block, patientId);
      this.sql.exec("COMMIT");
    } catch (error) {
      this.sql.exec("ROLLBACK");
      throw error;
    }
    this.blockListeners.forEach((l) => l(block));
    return result;
  }

  // -- ledger ---------------------------------------------------------------

  private insertBlock(block: Block, patientId?: string) {
    this.sql
      .prepare("INSERT INTO blocks (idx, timestamp, prev_hash, hash, tx, patient_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(block.index, block.timestamp, block.prevHash, block.hash, JSON.stringify(block.tx), patientId ?? null);
  }

  lastBlock(): Block {
    return toBlock(this.sql.prepare("SELECT * FROM blocks ORDER BY idx DESC LIMIT 1").get() as Row);
  }

  allBlocks(): Block[] {
    return (this.sql.prepare("SELECT * FROM blocks ORDER BY idx").all() as Row[]).map(toBlock);
  }

  /** Blocks a user performed, or that concern their own records. */
  blocksForUser(userId: string, limit = 200): Block[] {
    return (
      this.sql
        .prepare(
          `SELECT * FROM blocks WHERE json_extract(tx, '$.actorId') = ? OR patient_id = ? ORDER BY idx DESC LIMIT ?`,
        )
        .all(userId, userId, limit) as Row[]
    ).map(toBlock);
  }

  setAnchorRef(index: number, ref: string) {
    this.sql.prepare("UPDATE blocks SET anchor_ref = ? WHERE idx = ?").run(ref, index);
  }

  // -- users ----------------------------------------------------------------

  userById(id: string): UserRow | undefined {
    const row = this.sql.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return row && toUser(row);
  }

  userByEmail(email: string): UserRow | undefined {
    const row = this.sql.prepare("SELECT * FROM users WHERE email = ?").get(email) as Row | undefined;
    return row && toUser(row);
  }

  userByWallet(address: string): UserRow | undefined {
    const row = this.sql.prepare("SELECT * FROM users WHERE wallet_address = ?").get(address.toLowerCase()) as
      | Row
      | undefined;
    return row && toUser(row);
  }

  usersByRole(role: Role): UserRow[] {
    return (this.sql.prepare("SELECT * FROM users WHERE role = ? ORDER BY name").all(role) as Row[]).map(toUser);
  }

  insertUser(user: UserRow) {
    this.sql
      .prepare(
        "INSERT INTO users (id, email, name, role, password_hash, wallet_address, research_consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        user.id,
        user.email,
        user.name,
        user.role,
        user.passwordHash,
        user.walletAddress ?? null,
        user.researchConsent ? 1 : 0,
        user.createdAt,
      );
  }

  setWallet(userId: string, address: string) {
    this.sql.prepare("UPDATE users SET wallet_address = ? WHERE id = ?").run(address.toLowerCase(), userId);
  }

  setResearchConsent(userId: string, consent: boolean) {
    this.sql.prepare("UPDATE users SET research_consent = ? WHERE id = ?").run(consent ? 1 : 0, userId);
  }

  // -- wallet sign-in nonces ------------------------------------------------

  saveNonce(address: string, message: string, ttlMs: number) {
    this.sql
      .prepare("INSERT OR REPLACE INTO wallet_nonces (address, message, expires_at) VALUES (?, ?, ?)")
      .run(address.toLowerCase(), message, Date.now() + ttlMs);
  }

  /** Returns the pending message and deletes it, so each nonce works once. */
  takeNonce(address: string): string | undefined {
    const key = address.toLowerCase();
    const row = this.sql.prepare("SELECT * FROM wallet_nonces WHERE address = ?").get(key) as Row | undefined;
    this.sql.prepare("DELETE FROM wallet_nonces WHERE address = ?").run(key);
    if (!row || (row.expires_at as number) < Date.now()) return undefined;
    return row.message as string;
  }

  // -- records --------------------------------------------------------------

  recordById(id: string): PcosRecord | undefined {
    const row = this.sql.prepare("SELECT data FROM records WHERE id = ?").get(id) as Row | undefined;
    return row && toRecord(row);
  }

  recordsForPatients(patientIds: readonly string[]): PcosRecord[] {
    if (!patientIds.length) return [];
    const placeholders = patientIds.map(() => "?").join(",");
    return (
      this.sql
        .prepare(`SELECT data FROM records WHERE patient_id IN (${placeholders}) ORDER BY visit_date`)
        .all(...patientIds) as Row[]
    ).map(toRecord);
  }

  upsertRecord(record: PcosRecord) {
    this.sql
      .prepare(
        `INSERT INTO records (id, patient_id, author_id, visit_date, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET visit_date = excluded.visit_date, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(
        record.id,
        record.patientId,
        record.authorId,
        record.visitDate,
        JSON.stringify(record),
        record.createdAt,
        record.updatedAt,
      );
  }

  deleteRecord(id: string) {
    this.sql.prepare("DELETE FROM records WHERE id = ?").run(id);
  }

  // -- grants ---------------------------------------------------------------

  grantsForPatient(patientId: string): AccessGrant[] {
    return (this.sql.prepare("SELECT * FROM grants WHERE patient_id = ? ORDER BY granted_at").all(patientId) as Row[]).map(
      toGrant,
    );
  }

  grantsForDoctor(doctorId: string): AccessGrant[] {
    return (this.sql.prepare("SELECT * FROM grants WHERE doctor_id = ? ORDER BY granted_at").all(doctorId) as Row[]).map(
      toGrant,
    );
  }

  grantById(id: string): AccessGrant | undefined {
    const row = this.sql.prepare("SELECT * FROM grants WHERE id = ?").get(id) as Row | undefined;
    return row && toGrant(row);
  }

  insertGrant(grant: AccessGrant) {
    this.sql
      .prepare("INSERT INTO grants (id, patient_id, doctor_id, granted_at, revoked_at) VALUES (?, ?, ?, ?, ?)")
      .run(grant.id, grant.patientId, grant.doctorId, grant.grantedAt, grant.revokedAt ?? null);
  }

  revokeGrant(id: string, revokedAt: string) {
    this.sql.prepare("UPDATE grants SET revoked_at = ? WHERE id = ?").run(revokedAt, id);
  }

  // -- research -------------------------------------------------------------

  consentingPatients(): UserRow[] {
    return (
      this.sql.prepare("SELECT * FROM users WHERE role = 'patient' AND research_consent = 1 ORDER BY created_at").all() as Row[]
    ).map(toUser);
  }
}
