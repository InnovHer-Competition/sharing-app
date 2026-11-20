import { Router } from "express";
import type { UserSummary } from "@pcos/shared";
import { requireRole } from "../auth.ts";
import type { Database, UserRow } from "../db.ts";

const summary = (u: UserRow): UserSummary => ({ id: u.id, name: u.name, role: u.role });

/** Patient directory for doctors. */
export function peopleRouter(db: Database) {
  const router = Router();

  router.get("/patients", requireRole("doctor"), (_req, res) => {
    res.json({ patients: db.usersByRole("patient").map(summary) });
  });

  return router;
}
