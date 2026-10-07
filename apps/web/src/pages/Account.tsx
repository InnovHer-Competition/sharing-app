import { useState } from "react";
import { Icon } from "../components/Icon";
import { ErrorAlert, PageHeader, ROLE_LABEL } from "../components/Layout";
import { formatDate } from "../components/PatientOverview";
import { api } from "../lib/api";
import { useAuth, useUser } from "../lib/auth";
import { errorMessage } from "../lib/useAsync";
import { hasWallet, shortAddress, signWalletChallenge } from "../lib/wallet";

export function Account() {
  const user = useUser();
  const { setUser } = useAuth();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    setError(undefined);
    try {
      const { address, signature } = await signWalletChallenge();
      setUser((await api.linkWallet(address, signature)).user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Account" />
      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Profile</h2>
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", margin: 0 }}>
            <dt className="muted">Name</dt>
            <dd style={{ margin: 0 }}>{user.name}</dd>
            <dt className="muted">Email</dt>
            <dd style={{ margin: 0 }}>{user.email}</dd>
            <dt className="muted">Role</dt>
            <dd style={{ margin: 0 }}>{ROLE_LABEL[user.role]}</dd>
            <dt className="muted">Member since</dt>
            <dd style={{ margin: 0 }}>{formatDate(user.createdAt)}</dd>
          </dl>
        </section>
        <section className="card">
          <div className="card-header">
            <h2>Web3 wallet</h2>
          </div>
          <ErrorAlert message={error} />
          {user.walletAddress ? (
            <p className="row">
              <Icon name="wallet" /> Linked to <span className="mono">{shortAddress(user.walletAddress)}</span>
            </p>
          ) : (
            <p className="muted">
              Link an Ethereum wallet to sign in with a signature and to act as your identity on the blockchain network.
              Linking only asks you to sign a message; no transaction or fee is involved.
            </p>
          )}
          <button className="btn" onClick={link} disabled={busy || !hasWallet()}>
            <Icon name="wallet" /> {busy ? "Waiting for wallet…" : user.walletAddress ? "Link a different wallet" : "Link wallet"}
          </button>
          {!hasWallet() && <p className="muted">No browser wallet detected. Install MetaMask to use this.</p>}
        </section>
      </div>
    </>
  );
}
