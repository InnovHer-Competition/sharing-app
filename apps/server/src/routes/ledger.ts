import { Router } from "express";
import { currentUser } from "../auth.ts";
import type { Database } from "../db.ts";
import { verifyChain } from "../ledger.ts";

export function ledgerRouter(db: Database) {
  const router = Router();

  /** The blocks this user performed or that concern their own records. */
  router.get("/", (req, res) => {
    const user = currentUser(req);
    const head = db.lastBlock();
    res.json({ blocks: db.blocksForUser(user.id), height: head.index, headHash: head.hash });
  });

  /** Re-verifies the whole chain. Returns only the verdict, never other users' blocks. */
  router.get("/verify", (_req, res) => {
    res.json(verifyChain(db.allBlocks()));
  });

  return router;
}
