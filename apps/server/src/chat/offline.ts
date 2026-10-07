import {
  assessRotterdam,
  bmi,
  bmiCategory,
  currentFindings,
  homaIr,
  latestRecord,
  lhFshRatio,
  PHENOTYPE_LABELS,
  THRESHOLDS,
} from "@pcos/shared";
import type { ChatContext } from "./context.ts";
import { describeRecord } from "./context.ts";

/*
 * Rule-based assistant used when no ANTHROPIC_API_KEY is configured, so the
 * app stays usable in development and demos. It only answers from the
 * signed-in user's permitted data and a small set of PCOS facts.
 */

const DISCLAIMER = "\n\n_This is general information, not a diagnosis. Please discuss results with your doctor._";

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export function offlineReply(question: string, ctx: ChatContext): string {
  const q = question.toLowerCase();
  const own = ctx.patients[0];
  const latest = own && latestRecord(own.records);

  if (ctx.user.role === "researcher") {
    const r = ctx.research!;
    return [
      `There are **${r.consentingPatients}** consenting patients with **${r.records}** de-identified records.`,
      `**${r.meetsCriteria}** of ${r.consentingPatients} subjects meet ≥2 Rotterdam criteria on their latest known findings.`,
      `Phenotype distribution: ${Object.entries(r.phenotypes)
        .map(([k, v]) => `${k === "none" ? "no phenotype" : `phenotype ${k}`}: ${v}`)
        .join(", ")}.`,
      "Open the Research dashboard for the full table and charts.",
    ].join("\n\n");
  }

  if (has(q, "what is pcos", "about pcos", "explain pcos")) {
    return (
      "**Polycystic ovary syndrome (PCOS)** is a common hormonal condition affecting roughly 1 in 8 women of reproductive age. " +
      "Adults are diagnosed using the Rotterdam criteria, which require two of three features:\n\n" +
      "1. **Irregular or absent ovulation** (e.g. cycles longer than 35 days or fewer than 8 periods a year)\n" +
      "2. **Hyperandrogenism**: clinical signs such as hirsutism or acne, or raised androgen levels in blood tests\n" +
      "3. **Polycystic ovarian morphology** on ultrasound (≥20 follicles per ovary) or a raised AMH\n\n" +
      "Other causes (thyroid disease, high prolactin, congenital adrenal hyperplasia) must be excluded." +
      DISCLAIMER
    );
  }

  if (has(q, "access", "share", "who can see", "consent", "permission")) {
    if (ctx.user.role === "doctor")
      return `These patients currently share their records with you: ${ctx.patients.map((p) => p.name).join(", ") || "none yet"}.`;
    return (
      `Doctors with access to your records: **${ctx.doctorsWithAccess.join(", ") || "none"}**. ` +
      `Research sharing is **${ctx.user.researchConsent ? "on" : "off"}**. ` +
      "You can grant or revoke access at any time on the Sharing page. Each change is written to the audit ledger."
    );
  }

  if (ctx.user.role === "doctor") {
    const name = ctx.patients.find((p) => q.includes(p.name.toLowerCase().split(" ")[0]));
    if (!name)
      return `Ask me about a specific patient, e.g. "Summarize ${ctx.patients[0]?.name ?? "<patient>"}". Patients sharing with you: ${ctx.patients.map((p) => p.name).join(", ") || "none"}.`;
    const last = latestRecord(name.records);
    return last ? `Latest record for **${name.name}**:\n\n\`\`\`\n${describeRecord(last)}\n\`\`\`` : `${name.name} has no records yet.`;
  }

  if (!latest) return "You don't have any health records yet. Add your first visit from the Records page and I can explain it.";

  if (has(q, "lh", "fsh", "ratio")) {
    const ratio = lhFshRatio(latest);
    return ratio === undefined
      ? "Your latest record doesn't include both LH and FSH values."
      : `Your LH:FSH ratio on ${latest.visitDate} was **${ratio}**. A ratio above ${THRESHOLDS.lhFshRatio} is often seen in PCOS, but it is no longer part of the diagnostic criteria because many people with PCOS have a normal ratio.` +
          DISCLAIMER;
  }

  if (has(q, "bmi", "weight")) {
    const value = bmi(latest);
    return value === undefined
      ? "Your latest record is missing height or weight, so I can't compute BMI."
      : `Your BMI on ${latest.visitDate} was **${value}** (${bmiCategory(value)}). In PCOS, even a 5–10% weight reduction can improve cycle regularity and insulin sensitivity.` +
          DISCLAIMER;
  }

  if (has(q, "insulin", "glucose", "homa")) {
    const value = homaIr(latest);
    return value === undefined
      ? "Your latest record doesn't include fasting glucose and insulin."
      : `Your HOMA-IR on ${latest.visitDate} was **${value}**. Values above ${THRESHOLDS.homaIr} usually indicate insulin resistance, which is common in PCOS.` +
          DISCLAIMER;
  }

  if (has(q, "trend", "cycle", "progress", "improv", "chang")) {
    const withCycles = own.records.filter((r) => r.cycleLengthDays !== undefined);
    if (withCycles.length < 2) return "I need at least two visits with a cycle length to describe a trend.";
    const first = withCycles[0];
    const last = withCycles.at(-1)!;
    const delta = last.cycleLengthDays! - first.cycleLengthDays!;
    return (
      `Your cycle length went from **${first.cycleLengthDays} days** (${first.visitDate}) to **${last.cycleLengthDays} days** (${last.visitDate}), ` +
      `${delta < 0 ? `${-delta} days shorter` : delta > 0 ? `${delta} days longer` : "unchanged"}. ` +
      "A typical cycle is 21–35 days. See the trend chart on your dashboard." +
      DISCLAIMER
    );
  }

  // Assess on the latest known value of each measurement, not just the last visit.
  const a = assessRotterdam(currentFindings(own.records)!);
  const say = { met: "present", "not-met": "not present", unknown: "not enough data" } as const;
  return (
    `Here's where you stand as of your latest visit (${latest.visitDate}), using the most recent value of each measurement:\n\n` +
    `- Ovulatory dysfunction: **${say[a.ovulatoryDysfunction]}**\n` +
    `- Hyperandrogenism: **${say[a.hyperandrogenism]}**\n` +
    `- Polycystic ovarian morphology: **${say[a.polycysticOvaries]}**\n\n` +
    (a.phenotype
      ? `Together these match **phenotype ${PHENOTYPE_LABELS[a.phenotype]}** of the Rotterdam criteria.`
      : `${a.metCount} of 3 criteria are currently met.`) +
    "\n\nYou can ask me about your BMI, LH:FSH ratio, insulin resistance, cycle trend, or who has access to your records." +
    DISCLAIMER
  );
}
