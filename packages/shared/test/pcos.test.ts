import { describe, expect, it } from "vitest";
import { canDeleteRecord, canReadPatient } from "../src/permissions";
import { assessRotterdam, bmi, currentFindings, homaIr, lhFshRatio } from "../src/pcos";
import type { PcosRecord, PublicUser } from "../src/types";

const record = (fields: Partial<PcosRecord> = {}): PcosRecord => ({
  id: "r1",
  patientId: "p1",
  authorId: "p1",
  visitDate: "2026-01-15",
  createdAt: "",
  updatedAt: "",
  ...fields,
});

describe("assessRotterdam", () => {
  it("classifies phenotype A when all three criteria are met", () => {
    const a = assessRotterdam(record({ cycleLengthDays: 50, hirsutismScore: 9, follicleCount: 24 }));
    expect(a).toMatchObject({ metCount: 3, meetsCriteria: true, phenotype: "A" });
  });

  it("classifies phenotype C for regular cycles with androgen excess and PCOM", () => {
    const a = assessRotterdam(record({ cycleLengthDays: 29, totalTestosterone: 70, ovarianVolumeMl: 11 }));
    expect(a).toMatchObject({ ovulatoryDysfunction: "not-met", phenotype: "C", meetsCriteria: true });
  });

  it("reports unknown when data is missing instead of guessing", () => {
    const a = assessRotterdam(record({ cycleLengthDays: 40 }));
    expect(a).toMatchObject({ hyperandrogenism: "unknown", polycysticOvaries: "unknown", meetsCriteria: false });
  });
});

describe("currentFindings", () => {
  it("carries forward the latest known value of each measurement", () => {
    const merged = currentFindings([
      record({ visitDate: "2026-01-01", follicleCount: 24, cycleLengthDays: 50 }),
      record({ visitDate: "2026-06-01", cycleLengthDays: 31, hirsutismScore: 9 }),
    ]);
    expect(merged).toMatchObject({ visitDate: "2026-06-01", cycleLengthDays: 31, follicleCount: 24, hirsutismScore: 9 });
    expect(merged?.sources.follicleCount).toBe("2026-01-01");
    expect(assessRotterdam(merged!)).toMatchObject({ phenotype: "C", meetsCriteria: true });
  });
});

describe("derived metrics", () => {
  it("computes BMI, LH:FSH and HOMA-IR", () => {
    expect(bmi({ weightKg: 70, heightCm: 162 })).toBe(26.7);
    expect(lhFshRatio({ lh: 12, fsh: 6 })).toBe(2);
    expect(homaIr({ fastingGlucose: 90, fastingInsulin: 9 })).toBe(2);
    expect(bmi({ weightKg: 70 })).toBeUndefined();
  });
});

describe("record permissions", () => {
  const user = (id: string, role: PublicUser["role"]): PublicUser => ({ id, email: "", name: "", role, createdAt: "" });
  const patient = user("p1", "patient");
  const otherPatient = user("p2", "patient");
  const doctor = user("d1", "doctor");

  it("lets patients read only their own records and doctors read any patient", () => {
    expect(canReadPatient(patient, "p1")).toBe(true);
    expect(canReadPatient(otherPatient, "p1")).toBe(false);
    expect(canReadPatient(doctor, "p1")).toBe(true);
  });

  it("lets doctors delete only records they authored", () => {
    expect(canDeleteRecord(doctor, record({ authorId: "d1" }))).toBe(true);
    expect(canDeleteRecord(doctor, record({ authorId: "p1" }))).toBe(false);
    expect(canDeleteRecord(patient, record({ authorId: "d1" }))).toBe(true);
  });
});
