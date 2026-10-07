import type { TxType } from "@pcos/shared";
import { Icon } from "../components/Icon";
import { ErrorAlert, Loading, PageHeader } from "../components/Layout";
import { api } from "../lib/api";
import { useUser } from "../lib/auth";
import { useAsync } from "../lib/useAsync";

const TX_LABEL: Record<TxType, string> = {
  GENESIS: "Ledger created",
  USER_REGISTERED: "Account registered",
  WALLET_LINKED: "Wallet linked",
  RECORD_CREATED: "Record created",
  RECORD_UPDATED: "Record updated",
  RECORD_DELETED: "Record deleted",
  ACCESS_GRANTED: "Access granted",
  ACCESS_REVOKED: "Access revoked",
  RESEARCH_CONSENT_CHANGED: "Research consent changed",
};

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

export function Ledger() {
  const user = useUser();
  const ledger = useAsync(() => api.ledger(), []);
  const verification = useAsync(() => api.verifyLedger(), []);
  const v = verification.data;

  return (
    <>
      <PageHeader
        title="Audit ledger"
        subtitle="A hash-chained log of every action on your data. Blocks hold only SHA-256 fingerprints, never health data."
        actions={
          <button className="btn" onClick={verification.reload} disabled={verification.loading}>
            {verification.loading ? "Verifying…" : "Verify chain"}
          </button>
        }
      />
      <div className="stack">
        <ErrorAlert message={ledger.error ?? verification.error} />
        <div className="grid-tiles">
          <div className="card">
            <div className="tile-label">Chain integrity</div>
            {v ? (
              <div className="row" style={{ marginTop: 6 }}>
                <Icon name={v.valid ? "check" : "alert"} className={v.valid ? "status-not-met" : "status-met"} />
                <strong>{v.valid ? "Verified" : `Broken at block #${v.brokenAt}`}</strong>
              </div>
            ) : (
              <Loading label="Verifying…" />
            )}
            <div className="tile-foot">{v?.valid ? `All ${v.length} blocks re-hashed and linked` : v?.reason}</div>
          </div>
          <div className="card">
            <div className="tile-label">Chain height</div>
            <div className="tile-value">{ledger.data?.height ?? "—"}</div>
            {ledger.data && <div className="tile-foot mono">head {short(ledger.data.headHash)}</div>}
          </div>
        </div>
        <section className="card">
          <div className="card-header">
            <h2>Your activity</h2>
            <span className="sub">blocks you made or that concern your records</span>
          </div>
          {ledger.loading && !ledger.data ? (
            <Loading />
          ) : (
            <div className="chain">
              {ledger.data?.blocks.map((b) => (
                <div key={b.index} className="block">
                  <div className="block-index">#{b.index}</div>
                  <div>
                    <div className="row">
                      <strong>{TX_LABEL[b.tx.type]}</strong>
                      {b.tx.actorId !== user.id && <span className="badge">by another user</span>}
                      {b.anchorRef && <span className="badge badge-good">anchored on-chain</span>}
                      <span className="spacer" />
                      <span className="muted" style={{ fontSize: "0.82rem" }}>
                        {new Date(b.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="mono muted">
                      hash {short(b.hash)} · prev {short(b.prevHash)} · payload {short(b.tx.payloadHash)}
                    </div>
                    {b.anchorRef && <div className="mono muted">anchor {b.anchorRef}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
