import type { Block, LedgerVerification, Transaction } from "@pcos/shared";
import { canonicalJson, sha256 } from "./crypto.ts";

/*
 * Hash-chained audit ledger. Each block stores only the SHA-256 of the
 * off-chain payload, never the health data itself, and links to the
 * previous block's hash, so any tampering with history is detectable.
 * Anchoring blocks on a public chain is handled by the separate
 * blockchain service (see anchor.ts).
 */

export const GENESIS_PREV_HASH = "0".repeat(64);

export function hashBlock(block: Pick<Block, "index" | "timestamp" | "prevHash" | "tx">): string {
  return sha256(
    canonicalJson({ index: block.index, timestamp: block.timestamp, prevHash: block.prevHash, tx: block.tx }),
  );
}

export function createGenesisBlock(timestamp = new Date().toISOString()): Block {
  const base = {
    index: 0,
    timestamp,
    prevHash: GENESIS_PREV_HASH,
    tx: { type: "GENESIS", actorId: "system", subjectId: "ledger", payloadHash: GENESIS_PREV_HASH } as Transaction,
  };
  return { ...base, hash: hashBlock(base) };
}

export function nextBlock(prev: Block, tx: Transaction, timestamp = new Date().toISOString()): Block {
  const base = { index: prev.index + 1, timestamp, prevHash: prev.hash, tx };
  return { ...base, hash: hashBlock(base) };
}

export function payloadHash(payload: unknown): string {
  return sha256(canonicalJson(payload));
}

/** Recomputes every hash and link. Editing any past block breaks the chain from that point on. */
export function verifyChain(chain: readonly Block[]): LedgerVerification {
  for (let i = 0; i < chain.length; i++) {
    const block = chain[i];
    const fail = (reason: string): LedgerVerification => ({ valid: false, length: chain.length, brokenAt: i, reason });
    if (block.index !== i) return fail("index out of order");
    if (block.prevHash !== (i === 0 ? GENESIS_PREV_HASH : chain[i - 1].hash)) return fail("previous-hash link broken");
    if (hashBlock(block) !== block.hash) return fail("block contents were modified");
  }
  return { valid: true, length: chain.length };
}
