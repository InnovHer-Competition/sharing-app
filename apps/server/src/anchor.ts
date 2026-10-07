import type { Block } from "@pcos/shared";
import { config } from "./config.ts";
import type { Database } from "./db.ts";

/*
 * Integration point with the blockchain / ZKP service, which lives in a
 * separate repository. When LEDGER_SERVICE_URL is set, every new ledger
 * block is POSTed to `${LEDGER_SERVICE_URL}/anchors` as
 *
 *   { index, hash, prevHash, timestamp, tx: { type, actorId, subjectId, payloadHash } }
 *
 * and the service is expected to answer `{ "ref": "<chain tx hash or proof id>" }`.
 * Only hashes and opaque ids leave this server; health data never does.
 * Anchoring is best-effort: a failure is logged and the block stays unanchored.
 */

export function startAnchoring(db: Database) {
  const baseUrl = config.ledgerServiceUrl;
  if (!baseUrl) return () => {};

  return db.onBlock((block: Block) => {
    void (async () => {
      try {
        const res = await fetch(new URL("anchors", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.ledgerServiceToken ? { authorization: `Bearer ${config.ledgerServiceToken}` } : {}),
          },
          body: JSON.stringify({
            index: block.index,
            hash: block.hash,
            prevHash: block.prevHash,
            timestamp: block.timestamp,
            tx: block.tx,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`ledger service responded ${res.status}`);
        const { ref } = (await res.json()) as { ref?: string };
        if (ref) db.setAnchorRef(block.index, ref);
      } catch (error) {
        console.warn(`Could not anchor block #${block.index}:`, (error as Error).message);
      }
    })();
  });
}
