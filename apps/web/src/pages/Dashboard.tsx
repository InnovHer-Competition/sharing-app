import { Link } from "react-router-dom";
import { latestRecord } from "@pcos/shared";
import { Icon } from "../components/Icon";
import { ErrorAlert, Loading, PageHeader } from "../components/Layout";
import { formatDate, PatientOverview } from "../components/PatientOverview";
import { PatientPicker, usePatientSelection } from "../components/PatientPicker";
import { api } from "../lib/api";
import { useUser } from "../lib/auth";
import { useAsync } from "../lib/useAsync";

export function Dashboard() {
  const user = useUser();
  return user.role === "doctor" ? <DoctorDashboard /> : <PatientDashboard />;
}

function PatientDashboard() {
  const user = useUser();
  const records = useAsync(() => api.records().then((r) => r.records), []);
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
        subtitle="Follow your patients' PCOS records and trends."
        actions={
          patient && (
            <>
              <Link className="btn" to="/assistant">
                <Icon name="chat" /> Ask the assistant
              </Link>
              <Link className="btn btn-primary" to={newPath}>
                <Icon name="plus" /> Add visit for {patient.name.split(" ")[0]}
              </Link>
            </>
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
