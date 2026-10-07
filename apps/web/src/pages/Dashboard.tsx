import { Link } from "react-router-dom";
import { assessRotterdam, bmi, currentFindings, type DeidentifiedRecord, latestRecord, PHENOTYPE_LABELS } from "@pcos/shared";
import { BarList } from "../components/Charts";
import { Icon } from "../components/Icon";
import { ErrorAlert, Loading, PageHeader } from "../components/Layout";
import { formatDate, PatientOverview } from "../components/PatientOverview";
import { PatientPicker, usePatientSelection } from "../components/PatientPicker";
import { api } from "../lib/api";
import { useUser } from "../lib/auth";
import { useAsync } from "../lib/useAsync";

export function Dashboard() {
  const user = useUser();
  if (user.role === "doctor") return <DoctorDashboard />;
  if (user.role === "researcher") return <ResearcherDashboard />;
  return <PatientDashboard />;
}

function PatientDashboard() {
  const user = useUser();
  const records = useAsync(() => api.records().then((r) => r.records), []);
  const grants = useAsync(() => api.grants().then((r) => r.grants.filter((g) => !g.revokedAt)), []);
  const latest = records.data && latestRecord(records.data);

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle={latest ? `Your latest visit was on ${formatDate(latest.visitDate)}.` : "Welcome to your PCOS health record."}
        actions={
          <>
            <Link className="btn" to="/assistant">
              <Icon name="chat" /> Ask the assistant
            </Link>
            <Link className="btn btn-primary" to="/records/new">
              <Icon name="plus" /> Add record
            </Link>
          </>
        }
      />
      <ErrorAlert message={records.error} />
      {records.loading && !records.data ? <Loading /> : records.data && <PatientOverview records={records.data} newRecordPath="/records/new" />}
      {grants.data && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Who can see your records</h2>
            <Link to="/sharing" className="sub">
              Manage sharing
            </Link>
          </div>
          <div className="row">
            {grants.data.length ? (
              grants.data.map((g) => (
                <span key={g.id} className="badge badge-accent">
                  <Icon name="shield" size={14} /> {g.doctor.name}
                </span>
              ))
            ) : (
              <span className="muted">Only you. Grant a doctor access on the Sharing page.</span>
            )}
            <span className="badge">Research sharing: {user.researchConsent ? "on" : "off"}</span>
          </div>
        </section>
      )}
    </>
  );
}

function DoctorDashboard() {
  const selection = usePatientSelection();
  const patient = selection.selected;
  const records = useAsync(
    () => (patient ? api.records(patient.id).then((r) => r.records) : Promise.resolve([])),
    [patient?.id],
  );
  const newPath = patient ? `/records/new?patient=${patient.id}` : "/records";

  return (
    <>
      <PageHeader
        title="Patient overview"
        subtitle="Patients who have granted you access to their PCOS records."
        actions={
          patient && (
            <Link className="btn btn-primary" to={newPath}>
              <Icon name="plus" /> Add visit for {patient.name.split(" ")[0]}
            </Link>
          )
        }
      />
      <div className="stack">
        <PatientPicker selection={selection} />
        <ErrorAlert message={records.error} />
        {patient && (records.loading && !records.data ? <Loading /> : records.data && <PatientOverview records={records.data} newRecordPath={newPath} />)}
      </div>
    </>
  );
}

function summarize(rows: DeidentifiedRecord[]) {
  // Rows arrive in visit order. De-identified rows only carry the year, so the
  // row's position keeps visits in order within the same year.
  const bySubject = new Map<string, (DeidentifiedRecord & { visitDate: string })[]>();
  rows.forEach((row, i) => {
    const visits = bySubject.get(row.subject) ?? [];
    visits.push({ ...row, visitDate: `${row.visitYear}-${String(i).padStart(5, "0")}` });
    bySubject.set(row.subject, visits);
  });
  // Assess each subject on the latest known value of every measurement.
  const latest = [...bySubject.values()].map((visits) => currentFindings(visits)!);
  const phenotypes: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  let meets = 0;
  for (const row of latest) {
    const a = assessRotterdam(row);
    phenotypes[a.phenotype ?? "none"]++;
    if (a.meetsCriteria) meets++;
  }
  const bmis = latest.map(bmi).filter((v): v is number => v !== undefined);
  const meanBmi = bmis.length ? Math.round((bmis.reduce((a, b) => a + b, 0) / bmis.length) * 10) / 10 : undefined;
  return { subjects: latest.length, meets, phenotypes, meanBmi };
}

function ResearcherDashboard() {
  const dataset = useAsync(() => api.researchDataset(), []);
  const rows = dataset.data?.records ?? [];
  const s = summarize(rows);

  return (
    <>
      <PageHeader
        title="Research dataset"
        subtitle="De-identified PCOS records from patients who consented to research. Names, notes and exact dates are removed."
      />
      <ErrorAlert message={dataset.error} />
      {dataset.loading && !dataset.data ? (
        <Loading />
      ) : (
        <div className="stack">
          <div className="grid-tiles">
            <div className="card">
              <div className="tile-label">Consenting patients</div>
              <div className="tile-value">{dataset.data?.consentingPatients ?? 0}</div>
            </div>
            <div className="card">
              <div className="tile-label">Records</div>
              <div className="tile-value">{rows.length}</div>
            </div>
            <div className="card">
              <div className="tile-label">Meet Rotterdam criteria</div>
              <div className="tile-value">
                {s.meets}
                <span className="tile-unit">of {s.subjects} subjects</span>
              </div>
              <div className="tile-foot">latest known findings per subject</div>
            </div>
            <div className="card">
              <div className="tile-label">Mean BMI</div>
              <div className="tile-value">{s.meanBmi ?? "—"}</div>
              <div className="tile-foot">latest known value per subject</div>
            </div>
          </div>
          <section className="card">
            <div className="card-header">
              <h2>Phenotype distribution</h2>
              <span className="sub">subjects, latest known findings</span>
            </div>
            <BarList
              ariaLabel="Subjects per PCOS phenotype"
              items={[
                ...(["A", "B", "C", "D"] as const).map((p) => ({ label: `Phenotype ${p}`, value: s.phenotypes[p] })),
                { label: "Criteria not met", value: s.phenotypes.none },
              ]}
            />
            <p className="disclaimer">
              {(["A", "B", "C", "D"] as const).map((p) => PHENOTYPE_LABELS[p]).join(" · ")}
            </p>
          </section>
          <section className="card">
            <div className="card-header">
              <h2>De-identified records</h2>
              <span className="sub">{rows.length} rows</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th className="num">Year</th>
                    <th className="num">Cycle (d)</th>
                    <th className="num">BMI</th>
                    <th className="num">Testosterone</th>
                    <th className="num">AMH</th>
                    <th className="num">Follicles</th>
                    <th className="num">mFG</th>
                    <th>Phenotype</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.subject}</td>
                      <td className="num">{r.visitYear}</td>
                      <td className="num">{r.cycleLengthDays ?? "—"}</td>
                      <td className="num">{bmi(r) ?? "—"}</td>
                      <td className="num">{r.totalTestosterone ?? "—"}</td>
                      <td className="num">{r.amh ?? "—"}</td>
                      <td className="num">{r.follicleCount ?? "—"}</td>
                      <td className="num">{r.hirsutismScore ?? "—"}</td>
                      <td>{assessRotterdam(r).phenotype ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
