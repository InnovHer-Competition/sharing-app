import {
  assessRotterdam,
  bmi,
  currentFindings,
  homaIr,
  lhFshRatio,
  type PcosRecord,
  PHENOTYPE_LABELS,
  type PublicUser,
  sortByVisit,
} from "@pcos/shared";
import type { Database } from "../db.ts";
import { readablePatientIds } from "../routes/records.ts";

/*
 * Builds the record data the chatbot may use for the signed-in user:
 * patients get their own records, doctors get their patients' records.
 */

export interface ChatContext {
  user: PublicUser;
  /** Plain-text summary passed to the chatbot service. */
  summary: string;
  /** Structured data for the built-in (offline) assistant. */
  patients: { name: string; records: PcosRecord[] }[];
}

const fmt = (v: number | undefined, unit = "") => (v === undefined ? "n/a" : `${v}${unit}`);

export function describeRecord(r: PcosRecord): string {
  const a = assessRotterdam(r);
  const lines = [
    `Visit ${r.visitDate}:`,
    `  cycle ${fmt(r.cycleLengthDays, " days")}, periods/year ${fmt(r.periodsPerYear)}`,
    `  BMI ${fmt(bmi(r))}, waist ${fmt(r.waistCm, " cm")}`,
    `  LH ${fmt(r.lh, " IU/L")}, FSH ${fmt(r.fsh, " IU/L")}, LH:FSH ${fmt(lhFshRatio(r))}`,
    `  total testosterone ${fmt(r.totalTestosterone, " ng/dL")}, AMH ${fmt(r.amh, " ng/mL")}`,
    `  fasting glucose ${fmt(r.fastingGlucose, " mg/dL")}, insulin ${fmt(r.fastingInsulin, " µIU/mL")}, HOMA-IR ${fmt(homaIr(r))}`,
    `  follicles/ovary ${fmt(r.follicleCount)}, ovarian volume ${fmt(r.ovarianVolumeMl, " mL")}`,
    `  mFG hirsutism ${fmt(r.hirsutismScore)}, acne ${r.acne ? "yes" : "no"}, hair loss ${r.hairLoss ? "yes" : "no"}`,
    `  Rotterdam: ovulatory dysfunction ${a.ovulatoryDysfunction}, hyperandrogenism ${a.hyperandrogenism}, polycystic ovaries ${a.polycysticOvaries}` +
      (a.phenotype ? ` → phenotype ${PHENOTYPE_LABELS[a.phenotype]}` : ""),
  ];
  if (r.medications) lines.push(`  medications: ${r.medications}`);
  if (r.notes) lines.push(`  notes: ${r.notes}`);
  return lines.join("\n");
}

export function buildChatContext(db: Database, user: PublicUser): ChatContext {
  const header = `Signed-in user: ${user.name} (role: ${user.role}). Today is ${new Date().toISOString().slice(0, 10)}.`;

  const patients = readablePatientIds(db, user).map((id) => ({
    name: db.userById(id)?.name ?? "Unknown",
    records: sortByVisit(db.recordsForPatients([id])),
  }));

  const parts = [header];
  if (user.role === "doctor") parts.push(`Patients: ${patients.map((p) => p.name).join(", ") || "none"}.`);
  for (const p of patients) {
    // Most recent visits first, capped to keep the prompt small.
    const recent = p.records.slice(-6).reverse();
    const findings = currentFindings(p.records);
    const overall = findings && assessRotterdam(findings);
    parts.push(
      `\n## ${user.role === "patient" ? "Your records" : `Patient: ${p.name}`} (${p.records.length} visits, showing ${recent.length} most recent)`,
      ...(overall
        ? [
            `Current Rotterdam status (latest known value of each measurement): ${overall.metCount}/3 criteria` +
              (overall.phenotype ? `, phenotype ${PHENOTYPE_LABELS[overall.phenotype]}` : ""),
          ]
        : []),
      ...recent.map(describeRecord),
    );
  }
  return { user, patients, summary: parts.join("\n") };
}
