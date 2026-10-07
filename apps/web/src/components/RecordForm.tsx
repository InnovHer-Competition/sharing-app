import { type FormEvent, useState } from "react";
import type { PcosRecord, RecordInput } from "@pcos/shared";
import { ErrorAlert } from "./Layout";

type Fields = Omit<RecordInput, "patientId">;
type NumberKey = { [K in keyof Fields]-?: Fields[K] extends number | undefined ? K : never }[keyof Fields];

const NUMBER_GROUPS: { legend: string; fields: { key: NumberKey; label: string; unit?: string; step?: string }[] }[] = [
  {
    legend: "Menstrual cycle",
    fields: [
      { key: "cycleLengthDays", label: "Cycle length", unit: "days" },
      { key: "periodsPerYear", label: "Periods per year" },
    ],
  },
  {
    legend: "Body measurements",
    fields: [
      { key: "weightKg", label: "Weight", unit: "kg", step: "0.1" },
      { key: "heightCm", label: "Height", unit: "cm", step: "0.1" },
      { key: "waistCm", label: "Waist", unit: "cm", step: "0.1" },
    ],
  },
  {
    legend: "Laboratory",
    fields: [
      { key: "lh", label: "LH", unit: "IU/L", step: "0.1" },
      { key: "fsh", label: "FSH", unit: "IU/L", step: "0.1" },
      { key: "totalTestosterone", label: "Total testosterone", unit: "ng/dL", step: "0.1" },
      { key: "amh", label: "AMH", unit: "ng/mL", step: "0.1" },
      { key: "fastingGlucose", label: "Fasting glucose", unit: "mg/dL", step: "0.1" },
      { key: "fastingInsulin", label: "Fasting insulin", unit: "µIU/mL", step: "0.1" },
    ],
  },
  {
    legend: "Ultrasound & clinical signs",
    fields: [
      { key: "follicleCount", label: "Follicles per ovary", unit: "max" },
      { key: "ovarianVolumeMl", label: "Ovarian volume", unit: "mL", step: "0.1" },
      { key: "hirsutismScore", label: "Hirsutism (mFG score)", unit: "0–36" },
    ],
  },
];

const today = () => new Date().toISOString().slice(0, 10);

export function RecordForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PcosRecord;
  submitLabel: string;
  onSubmit: (fields: Fields) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = { visitDate: initial?.visitDate ?? today() };
    for (const g of NUMBER_GROUPS) for (const f of g.fields) v[f.key] = initial?.[f.key]?.toString() ?? "";
    v.medications = initial?.medications ?? "";
    v.notes = initial?.notes ?? "";
    return v;
  });
  const [acne, setAcne] = useState(initial?.acne ?? false);
  const [hairLoss, setHairLoss] = useState(initial?.hairLoss ?? false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const set = (key: string) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fields: Fields = { visitDate: values.visitDate, acne, hairLoss };
    for (const g of NUMBER_GROUPS)
      for (const f of g.fields) {
        const raw = values[f.key].trim();
        if (raw !== "") fields[f.key] = Number(raw);
      }
    if (values.medications.trim()) fields.medications = values.medications.trim();
    if (values.notes.trim()) fields.notes = values.notes.trim();

    setSaving(true);
    setError(undefined);
    try {
      await onSubmit(fields);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <ErrorAlert message={error} />
      <fieldset>
        <legend>Visit</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="visitDate">Visit date</label>
            <input id="visitDate" type="date" required value={values.visitDate} max={today()} onChange={set("visitDate")} />
          </div>
        </div>
      </fieldset>
      {NUMBER_GROUPS.map((group) => (
        <fieldset key={group.legend}>
          <legend>{group.legend}</legend>
          <div className="form-grid">
            {group.fields.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={f.key}>
                  {f.label}
                  {f.unit && <span className="muted"> ({f.unit})</span>}
                </label>
                <input id={f.key} type="number" inputMode="decimal" min={0} step={f.step ?? "1"} value={values[f.key]} onChange={set(f.key)} />
              </div>
            ))}
            {group.legend.startsWith("Ultrasound") && (
              <div className="field">
                <span className="label">Other signs</span>
                <label className="check">
                  <input type="checkbox" checked={acne} onChange={(e) => setAcne(e.target.checked)} /> Acne
                </label>
                <label className="check">
                  <input type="checkbox" checked={hairLoss} onChange={(e) => setHairLoss(e.target.checked)} /> Scalp hair loss
                </label>
              </div>
            )}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend>Treatment & notes</legend>
        <div className="stack">
          <div className="field">
            <label htmlFor="medications">Medications</label>
            <input id="medications" value={values.medications} onChange={set("medications")} placeholder="e.g. Metformin 500 mg twice daily" />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" value={values.notes} onChange={set("notes")} />
          </div>
        </div>
      </fieldset>
      <p className="muted" style={{ margin: 0 }}>
        Leave a field empty if it wasn't measured. Saving writes a hash of this record to the audit ledger.
      </p>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
