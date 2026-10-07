import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { UserSummary } from "@pcos/shared";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ErrorAlert, Loading } from "./Layout";

/** Doctor-only: the patients who currently share records, with the selection kept in `?patient=`. */
export function usePatientSelection() {
  const [params, setParams] = useSearchParams();
  const patients = useAsync(() => api.patients().then((r) => r.patients), []);
  const list = patients.data ?? [];
  const selectedId = params.get("patient") ?? undefined;
  const selected = list.find((p) => p.id === selectedId) ?? list[0];

  useEffect(() => {
    if (selected && selected.id !== selectedId) setParams({ patient: selected.id }, { replace: true });
  }, [selected, selectedId, setParams]);

  return {
    patients: list,
    loading: patients.loading,
    error: patients.error,
    selected,
    select: (p: UserSummary) => setParams({ patient: p.id }),
  };
}

export function PatientPicker({ selection }: { selection: ReturnType<typeof usePatientSelection> }) {
  if (selection.loading) return <Loading label="Loading patients…" />;
  if (selection.error) return <ErrorAlert message={selection.error} />;
  if (!selection.patients.length)
    return (
      <div className="card">
        <h2>No patients yet</h2>
        <p className="muted">
          Patients appear here once they grant you access from their Sharing page. See <Link to="/sharing">Sharing</Link>.
        </p>
      </div>
    );
  return (
    <div className="patient-pick" role="group" aria-label="Choose a patient">
      {selection.patients.map((p) => (
        <button key={p.id} type="button" aria-pressed={p.id === selection.selected?.id} onClick={() => selection.select(p)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
