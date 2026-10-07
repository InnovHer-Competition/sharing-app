import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ErrorAlert, Loading, PageHeader } from "../components/Layout";
import { formatDate } from "../components/PatientOverview";
import { api } from "../lib/api";
import { useAuth, useUser } from "../lib/auth";
import { errorMessage, useAsync } from "../lib/useAsync";

export function Sharing() {
  const user = useUser();
  return user.role === "doctor" ? <DoctorSharing /> : <PatientSharing />;
}

function PatientSharing() {
  const user = useUser();
  const { setUser } = useAuth();
  const grants = useAsync(() => api.grants().then((r) => r.grants), []);
  const doctors = useAsync(() => api.doctors().then((r) => r.doctors), []);
  const [doctorId, setDoctorId] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const active = (grants.data ?? []).filter((g) => !g.revokedAt);
  const history = (grants.data ?? []).filter((g) => g.revokedAt);
  const available = (doctors.data ?? []).filter((d) => !active.some((g) => g.doctorId === d.id));

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      grants.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Sharing & consent"
        subtitle="You decide who can see your records. Every grant and revocation is written to the audit ledger."
      />
      <div className="stack">
        <ErrorAlert message={error ?? grants.error ?? doctors.error} />
        <section className="card">
          <div className="card-header">
            <h2>Doctors with access</h2>
            <span className="sub">{active.length} active</span>
          </div>
          {grants.loading && !grants.data ? (
            <Loading />
          ) : active.length ? (
            <ul className="list">
              {active.map((g) => (
                <li key={g.id}>
                  <Icon name="shield" />
                  <div>
                    <strong>{g.doctor.name}</strong>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      Since {formatDate(g.grantedAt)} · can read, add and update your records
                    </div>
                  </div>
                  <span className="spacer" />
                  <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => act(() => api.revoke(g.id))}>
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No doctor can see your records right now.</p>
          )}
          <form
            className="row"
            style={{ marginTop: 14 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (doctorId) void act(() => api.grant(doctorId)).then(() => setDoctorId(""));
            }}
          >
            <label htmlFor="doctor" className="sr-only">
              Doctor
            </label>
            <select id="doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} style={{ maxWidth: 320 }}>
              <option value="">Choose a doctor…</option>
              {available.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" type="submit" disabled={!doctorId || busy}>
              Grant access
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Research sharing</h2>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(user.researchConsent)}
              disabled={busy}
              onChange={(e) => act(async () => setUser((await api.setResearchConsent(e.target.checked)).user))}
            />
            Share my de-identified data with PCOS researchers
          </label>
          <p className="muted" style={{ marginBottom: 0 }}>
            Researchers never see your name, email, notes, medications or exact visit dates. You can withdraw at any time,
            and they stop seeing your data immediately.
          </p>
        </section>

        {history.length > 0 && (
          <section className="card">
            <div className="card-header">
              <h2>Past access</h2>
            </div>
            <ul className="list">
              {history.map((g) => (
                <li key={g.id}>
                  <span>{g.doctor.name}</span>
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {formatDate(g.grantedAt)} – {formatDate(g.revokedAt!)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function DoctorSharing() {
  const grants = useAsync(() => api.grants().then((r) => r.grants), []);
  const active = (grants.data ?? []).filter((g) => !g.revokedAt);
  return (
    <>
      <PageHeader title="Sharing & consent" subtitle="Patients choose to share their records with you and can revoke access at any time." />
      <ErrorAlert message={grants.error} />
      <section className="card">
        <div className="card-header">
          <h2>Patients sharing with you</h2>
          <span className="sub">{active.length} active</span>
        </div>
        {grants.loading && !grants.data ? (
          <Loading />
        ) : active.length ? (
          <ul className="list">
            {active.map((g) => (
              <li key={g.id}>
                <Icon name="shield" />
                <strong>{g.patient.name}</strong>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  since {formatDate(g.grantedAt)}
                </span>
                <span className="spacer" />
                <Link className="btn btn-sm" to={`/dashboard?patient=${g.patientId}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No patients have shared their records with you yet.</p>
        )}
      </section>
    </>
  );
}
