import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { assessRotterdam, bmi, type PcosRecord, sortByVisit } from "@pcos/shared";
import { Icon } from "../components/Icon";
import { ErrorAlert, Loading, PageHeader } from "../components/Layout";
import { formatDate } from "../components/PatientOverview";
import { PatientPicker, usePatientSelection } from "../components/PatientPicker";
import { RecordForm } from "../components/RecordForm";
import { api } from "../lib/api";
import { useUser } from "../lib/auth";
import { useAsync } from "../lib/useAsync";

export function Records() {
  const user = useUser();
  return user.role === "doctor" ? <DoctorRecords /> : <RecordList patientId={user.id} />;
}

function DoctorRecords() {
  const selection = usePatientSelection();
  return (
    <>
      <PageHeader title="Health records" subtitle="Visits of patients who share their records with you." />
      <div className="stack">
        <PatientPicker selection={selection} />
        {selection.selected && <RecordList patientId={selection.selected.id} embedded />}
      </div>
    </>
  );
}

function RecordList({ patientId, embedded }: { patientId: string; embedded?: boolean }) {
  const user = useUser();
  const records = useAsync(() => api.records(user.role === "doctor" ? patientId : undefined).then((r) => r.records), [patientId]);
  const newPath = user.role === "doctor" ? `/records/new?patient=${patientId}` : "/records/new";
  const rows = sortByVisit(records.data ?? []).reverse();

  async function remove(record: PcosRecord) {
    if (!confirm(`Delete the record from ${formatDate(record.visitDate)}? This can't be undone.`)) return;
    try {
      await api.deleteRecord(record.id);
      records.reload();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const table = (
    <section className="card">
      <div className="card-header">
        <h2>{rows.length} visits</h2>
        <Link className="btn btn-primary btn-sm" to={newPath}>
          <Icon name="plus" size={16} /> Add record
        </Link>
      </div>
      <ErrorAlert message={records.error} />
      {records.loading && !records.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="muted">No records yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Visit</th>
                <th className="num">Cycle (d)</th>
                <th className="num">BMI</th>
                <th className="num">LH / FSH</th>
                <th className="num">Testosterone</th>
                <th className="num">Follicles</th>
                <th>Criteria</th>
                <th>By</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = assessRotterdam(r);
                return (
                  <tr key={r.id}>
                    <td>{formatDate(r.visitDate)}</td>
                    <td className="num">{r.cycleLengthDays ?? "—"}</td>
                    <td className="num">{bmi(r) ?? "—"}</td>
                    <td className="num">{r.lh !== undefined && r.fsh !== undefined ? `${r.lh} / ${r.fsh}` : "—"}</td>
                    <td className="num">{r.totalTestosterone ?? "—"}</td>
                    <td className="num">{r.follicleCount ?? "—"}</td>
                    <td>
                      <span className={`badge${a.phenotype ? " badge-accent" : ""}`}>
                        {a.metCount}/3{a.phenotype ? ` · ${a.phenotype}` : ""}
                      </span>
                    </td>
                    <td>{r.authorId === r.patientId ? "Patient" : "Doctor"}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
                        <Link className="btn btn-sm" to={`/records/${r.id}/edit`}>
                          Edit
                        </Link>
                        {/* Listed records are already readable; deleting is limited to the patient or the authoring doctor. */}
                        {(user.role === "patient" || r.authorId === user.id) && (
                          <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  if (embedded) return table;
  return (
    <>
      <PageHeader title="Health records" subtitle="Every visit, lab result and ultrasound finding in one place." />
      {table}
    </>
  );
}

export function NewRecord() {
  const user = useUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const patientId = user.role === "doctor" ? params.get("patient") : user.id;
  const back = user.role === "doctor" ? `/records?patient=${patientId}` : "/records";

  if (!patientId) return <ErrorAlert message="Choose a patient first from the Health records page." />;

  return (
    <>
      <PageHeader title="Add a visit" subtitle="Record cycle history, measurements, labs and ultrasound findings." />
      <RecordForm
        submitLabel="Save record"
        onCancel={() => navigate(back)}
        onSubmit={async (fields) => {
          await api.createRecord({ ...fields, patientId });
          navigate(back);
        }}
      />
    </>
  );
}

export function EditRecord() {
  const user = useUser();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const record = useAsync(() => api.record(id).then((r) => r.record), [id]);
  const back = (r?: PcosRecord) => (user.role === "doctor" && r ? `/records?patient=${r.patientId}` : "/records");

  return (
    <>
      <PageHeader title="Edit record" subtitle={record.data ? `Visit on ${formatDate(record.data.visitDate)}` : undefined} />
      <ErrorAlert message={record.error} />
      {record.loading && !record.data ? (
        <Loading />
      ) : (
        record.data && (
          <RecordForm
            initial={record.data}
            submitLabel="Save changes"
            onCancel={() => navigate(back(record.data))}
            onSubmit={async (fields) => {
              await api.updateRecord(id, fields);
              navigate(back(record.data));
            }}
          />
        )
      )}
    </>
  );
}
