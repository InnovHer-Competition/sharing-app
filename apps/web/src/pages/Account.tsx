import { PageHeader, ROLE_LABEL } from "../components/Layout";
import { formatDate } from "../components/PatientOverview";
import { useUser } from "../lib/auth";

export function Account() {
  const user = useUser();

  return (
    <>
      <PageHeader title="Account" />
      <section className="card" style={{ maxWidth: 560 }}>
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
    </>
  );
}
