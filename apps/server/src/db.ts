import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PcosRecord, PublicUser, Role } from "@pcos/shared";

/* SQLite storage for users and PCOS records. */

export interface UserRow extends PublicUser {
  passwordHash: string;
}

type Row = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient','doctor')),
  password_hash TEXT NOT NULL,
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
`;

const toUser = (r: Row): UserRow => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  role: r.role as Role,
  passwordHash: r.password_hash as string,
  createdAt: r.created_at as string,
});

export const toPublicUser = ({ passwordHash: _h, ...user }: UserRow): PublicUser => user;

const toRecord = (r: Row): PcosRecord => JSON.parse(r.data as string);

export class Database {
  readonly sql: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.sql.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.sql.exec(SCHEMA);
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

  usersByRole(role: Role): UserRow[] {
    return (this.sql.prepare("SELECT * FROM users WHERE role = ? ORDER BY name").all(role) as Row[]).map(toUser);
  }

  insertUser(user: UserRow) {
    this.sql
      .prepare("INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.name, user.role, user.passwordHash, user.createdAt);
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
}
