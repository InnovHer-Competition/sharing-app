import {
  assessRotterdam,
  bmi,
  currentFindings,
  homaIr,
  lhFshRatio,
  type PcosRecord,
  PHENOTYPE_LABELS,
  type PublicUser,
  researchDataset,
  sortByVisit,
} from "@pcos/shared";
import type { Database } from "../db.ts";
import { toPublicUser } from "../db.ts";
import { readablePatientIds } from "../routes/records.ts";

/*
 * Builds the data the chatbot may see for the signed-in user, applying the
 * same access rules as the REST API: patients see their own records,
 * doctors see consenting patients, researchers only de-identified aggregates.
 */

export interface ChatContext {
  user: PublicUser;
  /** Plain-text summary given to the model. */
  summary: string;
  /** Structured data for the built-in (offline) assistant. */
  patients: { name: string; records: PcosRecord[] }[];
  doctorsWithAccess: string[];
  research?: { consentingPatients: number; records: number; meetsCriteria: number; phenotypes: Record<string, number> };
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

  if (user.role === "researcher") {
    const consenting = db.consentingPatients();
    const records = db.recordsForPatients(consenting.map((p) => p.id));
    const rows = researchDataset(user, records, consenting.map(toPublicUser));
    // Per subject, on the latest known value of each measurement. Only counts leave this function.
    const phenotypes: Record<string, number> = {};
    let meets = 0;
    for (const patient of consenting) {
      const findings = currentFindings(records.filter((r) => r.patientId === patient.id));
      if (!findings) continue;
      const a = assessRotterdam(findings);
      if (a.meetsCriteria) meets++;
      const key = a.phenotype ?? "none";
      phenotypes[key] = (phenotypes[key] ?? 0) + 1;
    }
    const research = { consentingPatients: consenting.length, records: rows.length, meetsCriteria: meets, phenotypes };
    return {
      user,
      patients: [],
      doctorsWithAccess: [],
      research,
      summary: [
        header,
        "The researcher can only see de-identified, aggregated data from patients who consented to research.",
        `Consenting patients: ${research.consentingPatients}; de-identified records: ${research.records}; subjects meeting Rotterdam criteria (latest known findings): ${meets}.`,
        `Phenotype counts per subject: ${JSON.stringify(phenotypes)}.`,
      ].join("\n"),
    };
  }

  const patientIds = readablePatientIds(db, user);
  const patients = patientIds.map((id) => ({
    name: db.userById(id)?.name ?? "Unknown",
    records: sortByVisit(db.recordsForPatients([id])),
  }));
  const doctorsWithAccess =
    user.role === "patient"
      ? db
          .grantsForPatient(user.id)
          .filter((g) => !g.revokedAt)
          .map((g) => db.userById(g.doctorId)?.name ?? "Unknown doctor")
      : [];

  const parts = [header];
  if (user.role === "patient") {
    parts.push(
      `Doctors with access to the patient's records: ${doctorsWithAccess.join(", ") || "none"}.`,
      `Shares de-identified data with researchers: ${user.researchConsent ? "yes" : "no"}.`,
    );
  } else {
    parts.push(`Patients who granted this doctor access: ${patients.map((p) => p.name).join(", ") || "none"}.`);
  }
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
  return { user, patients, doctorsWithAccess, summary: parts.join("\n") };
}
