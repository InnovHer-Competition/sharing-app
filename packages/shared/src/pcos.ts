import type { PcosRecord } from "./types";

/*
 * Screening helpers based on the Rotterdam criteria as refined by the
 * 2023 International Evidence-based Guideline for PCOS. These are decision
 * support for clinicians, not a diagnosis: thresholds for androgens and AMH
 * are assay- and population-specific, and other causes must be excluded.
 */

export const THRESHOLDS = {
  /** Cycles longer than this suggest oligo-ovulation (>3 years post-menarche). */
  longCycleDays: 35,
  shortCycleDays: 21,
  minPeriodsPerYear: 8,
  /** mFG score at or above this indicates clinical hirsutism. */
  hirsutismScore: 4,
  /** Generic upper reference for total testosterone; confirm against the lab's range. */
  totalTestosteroneNgDl: 55,
  /** Follicles (2-9 mm) per ovary on ≥8 MHz transvaginal ultrasound. */
  follicleCount: 20,
  ovarianVolumeMl: 10,
  lhFshRatio: 2,
  /** HOMA-IR above this is commonly read as insulin resistance. */
  homaIr: 2.5,
} as const;

export type CriterionStatus = "met" | "not-met" | "unknown";

export interface RotterdamAssessment {
  ovulatoryDysfunction: CriterionStatus;
  hyperandrogenism: CriterionStatus;
  polycysticOvaries: CriterionStatus;
  metCount: number;
  /** True when at least two of the three criteria are met. */
  meetsCriteria: boolean;
  phenotype?: "A" | "B" | "C" | "D";
}

const status = (value: boolean | undefined): CriterionStatus =>
  value === undefined ? "unknown" : value ? "met" : "not-met";

const anyKnown = (...values: (number | boolean | undefined)[]) => values.some((v) => v !== undefined);

export function assessRotterdam(r: Partial<PcosRecord>): RotterdamAssessment {
  const ovulatory = anyKnown(r.cycleLengthDays, r.periodsPerYear)
    ? (r.cycleLengthDays !== undefined &&
        (r.cycleLengthDays > THRESHOLDS.longCycleDays || r.cycleLengthDays < THRESHOLDS.shortCycleDays)) ||
      (r.periodsPerYear !== undefined && r.periodsPerYear < THRESHOLDS.minPeriodsPerYear)
    : undefined;

  const androgen = anyKnown(r.hirsutismScore, r.totalTestosterone, r.acne, r.hairLoss)
    ? (r.hirsutismScore !== undefined && r.hirsutismScore >= THRESHOLDS.hirsutismScore) ||
      (r.totalTestosterone !== undefined && r.totalTestosterone > THRESHOLDS.totalTestosteroneNgDl) ||
      r.acne === true ||
      r.hairLoss === true
    : undefined;

  const pcom = anyKnown(r.follicleCount, r.ovarianVolumeMl)
    ? (r.follicleCount !== undefined && r.follicleCount >= THRESHOLDS.follicleCount) ||
      (r.ovarianVolumeMl !== undefined && r.ovarianVolumeMl >= THRESHOLDS.ovarianVolumeMl)
    : undefined;

  const metCount = [ovulatory, androgen, pcom].filter(Boolean).length;
  let phenotype: RotterdamAssessment["phenotype"];
  if (ovulatory && androgen && pcom) phenotype = "A";
  else if (ovulatory && androgen) phenotype = "B";
  else if (androgen && pcom) phenotype = "C";
  else if (ovulatory && pcom) phenotype = "D";

  return {
    ovulatoryDysfunction: status(ovulatory),
    hyperandrogenism: status(androgen),
    polycysticOvaries: status(pcom),
    metCount,
    meetsCriteria: metCount >= 2,
    phenotype,
  };
}

export const PHENOTYPE_LABELS: Record<NonNullable<RotterdamAssessment["phenotype"]>, string> = {
  A: "A · classic (all three features)",
  B: "B · classic (no polycystic ovaries)",
  C: "C · ovulatory PCOS",
  D: "D · non-hyperandrogenic",
};

export function bmi(r: Pick<PcosRecord, "weightKg" | "heightCm">): number | undefined {
  if (!r.weightKg || !r.heightCm) return undefined;
  const m = r.heightCm / 100;
  return Math.round((r.weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(value: number): string {
  if (value < 18.5) return "Underweight";
  if (value < 25) return "Healthy range";
  if (value < 30) return "Overweight";
  return "Obesity";
}

export function lhFshRatio(r: Pick<PcosRecord, "lh" | "fsh">): number | undefined {
  if (r.lh === undefined || !r.fsh) return undefined;
  return Math.round((r.lh / r.fsh) * 100) / 100;
}

/** HOMA-IR = glucose (mg/dL) × insulin (µIU/mL) / 405 */
export function homaIr(r: Pick<PcosRecord, "fastingGlucose" | "fastingInsulin">): number | undefined {
  if (r.fastingGlucose === undefined || r.fastingInsulin === undefined) return undefined;
  return Math.round(((r.fastingGlucose * r.fastingInsulin) / 405) * 100) / 100;
}

export function sortByVisit<T extends Pick<PcosRecord, "visitDate">>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
}

export function latestRecord<T extends Pick<PcosRecord, "visitDate">>(records: readonly T[]): T | undefined {
  return sortByVisit(records).at(-1);
}

/**
 * The most recent known value of every measurement across visits, so that
 * e.g. an ultrasound from an earlier visit still counts when the latest
 * visit only recorded labs. `sources` gives the visit date of each value.
 */
export function currentFindings<T extends Partial<PcosRecord> & Pick<PcosRecord, "visitDate">>(
  records: readonly T[],
): (Partial<T> & { sources: Partial<Record<keyof T, string>> }) | undefined {
  const sorted = sortByVisit(records);
  if (!sorted.length) return undefined;
  const merged: Partial<T> = {};
  const sources: Partial<Record<keyof T, string>> = {};
  for (const record of sorted) {
    for (const [key, value] of Object.entries(record) as [keyof T, T[keyof T]][]) {
      if (value === undefined) continue;
      merged[key] = value;
      sources[key] = record.visitDate;
    }
  }
  return { ...merged, sources };
}
