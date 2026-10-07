import { Link } from "react-router-dom";
import {
  assessRotterdam,
  bmi,
  currentFindings,
  bmiCategory,
  type CriterionStatus,
  homaIr,
  lhFshRatio,
  type PcosRecord,
  PHENOTYPE_LABELS,
  sortByVisit,
  THRESHOLDS,
} from "@pcos/shared";
import { type Point, TrendChart } from "./Charts";
import { Icon } from "./Icon";

export const formatDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Latest defined value of a field, plus the previous one for a delta. */
function latestTwo(records: PcosRecord[], get: (r: PcosRecord) => number | undefined) {
  const values = records.map((r) => ({ value: get(r), date: r.visitDate })).filter((v) => v.value !== undefined) as {
    value: number;
    date: string;
  }[];
  return { latest: values.at(-1), previous: values.at(-2) };
}

function StatTile({
  label,
  value,
  unit,
  foot,
  delta,
  lowerIsBetter = true,
}: {
  label: string;
  value?: number;
  unit?: string;
  foot?: string;
  delta?: number;
  lowerIsBetter?: boolean;
}) {
  const good = delta !== undefined && delta !== 0 && delta < 0 === lowerIsBetter;
  return (
    <div className="card">
      <div className="tile-label">{label}</div>
      <div className="tile-value">
        {value ?? "—"}
        {value !== undefined && unit && <span className="tile-unit">{unit}</span>}
      </div>
      <div className="tile-foot">
        {delta !== undefined && delta !== 0 && (
          <span className={good ? "delta-good" : "delta-bad"}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 10) / 10)}
          </span>
        )}{" "}
        {foot}
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<CriterionStatus, string> = { met: "Present", "not-met": "Not present", unknown: "Not enough data" };

function Criterion({ status, label, hint }: { status: CriterionStatus; label: string; hint: string }) {
  const icon = status === "met" ? "alert" : status === "not-met" ? "check" : "help";
  return (
    <li className="criterion">
      <Icon name={icon} className={`status-icon status-${status}`} />
      <div>
        <div>
          <span className="label">{label}</span> · <span>{STATUS_TEXT[status]}</span>
        </div>
        <div className="hint">{hint}</div>
      </div>
    </li>
  );
}

export function RotterdamCard({ records }: { records: PcosRecord[] }) {
  const findings = currentFindings(records);
  if (!findings) return null;
  const a = assessRotterdam(findings);
  return (
    <section className="card" aria-labelledby="rotterdam-title">
      <div className="card-header">
        <h2 id="rotterdam-title">Rotterdam criteria</h2>
        <span className="sub">as of {formatDate(findings.visitDate!)}</span>
      </div>
      <ul className="criteria">
        <Criterion
          status={a.ovulatoryDysfunction}
          label="Ovulatory dysfunction"
          hint={`Cycles > ${THRESHOLDS.longCycleDays} or < ${THRESHOLDS.shortCycleDays} days, or < ${THRESHOLDS.minPeriodsPerYear} periods a year`}
        />
        <Criterion
          status={a.hyperandrogenism}
          label="Hyperandrogenism"
          hint={`mFG ≥ ${THRESHOLDS.hirsutismScore}, acne or hair loss, or total testosterone > ${THRESHOLDS.totalTestosteroneNgDl} ng/dL`}
        />
        <Criterion
          status={a.polycysticOvaries}
          label="Polycystic ovarian morphology"
          hint={`≥ ${THRESHOLDS.follicleCount} follicles per ovary or volume ≥ ${THRESHOLDS.ovarianVolumeMl} mL`}
        />
      </ul>
      <div className="phenotype">
        {a.phenotype ? (
          <>
            {a.metCount} of 3 criteria present. Matches <strong>phenotype {PHENOTYPE_LABELS[a.phenotype]}</strong>.
          </>
        ) : (
          <>{a.metCount} of 3 criteria present. At least 2 are needed for a PCOS diagnosis.</>
        )}
      </div>
      <p className="disclaimer">
        Uses the most recent value of each measurement across visits. Decision support only. Diagnosis requires a clinician to exclude other causes; lab reference ranges vary.
      </p>
    </section>
  );
}

export function PatientOverview({ records, newRecordPath }: { records: PcosRecord[]; newRecordPath: string }) {
  const sorted = sortByVisit(records);
  const latest = sorted.at(-1);

  if (!latest) {
    return (
      <div className="card">
        <h2>No health records yet</h2>
        <p className="muted">Add the first visit to see the PCOS assessment and trends here.</p>
        <Link className="btn btn-primary" to={newRecordPath}>
          <Icon name="plus" /> Add a record
        </Link>
      </div>
    );
  }

  const cycle = latestTwo(sorted, (r) => r.cycleLengthDays);
  const bmiVals = latestTwo(sorted, bmi);
  const ratio = latestTwo(sorted, lhFshRatio);
  const homa = latestTwo(sorted, homaIr);
  const testo = latestTwo(sorted, (r) => r.totalTestosterone);
  const delta = (v: ReturnType<typeof latestTwo>) => (v.latest && v.previous ? v.latest.value - v.previous.value : undefined);

  const series = (get: (r: PcosRecord) => number | undefined): Point[] =>
    sorted.flatMap((r) => {
      const value = get(r);
      return value === undefined ? [] : [{ label: r.visitDate, value }];
    });

  return (
    <div className="stack">
      <div className="grid-tiles">
        <StatTile
          label="Cycle length"
          value={cycle.latest?.value}
          unit="days"
          delta={delta(cycle)}
          foot={cycle.latest && (cycle.latest.value <= THRESHOLDS.longCycleDays ? "within 21–35 days" : "longer than 35 days")}
        />
        <StatTile
          label="BMI"
          value={bmiVals.latest?.value}
          delta={delta(bmiVals)}
          foot={bmiVals.latest && bmiCategory(bmiVals.latest.value)}
        />
        <StatTile label="LH : FSH ratio" value={ratio.latest?.value} delta={delta(ratio)} foot={`often > ${THRESHOLDS.lhFshRatio} in PCOS`} />
        <StatTile label="HOMA-IR" value={homa.latest?.value} delta={delta(homa)} foot={`> ${THRESHOLDS.homaIr} suggests insulin resistance`} />
      </div>

      <div className="grid-2">
        <RotterdamCard records={sorted} />
        <section className="card" aria-labelledby="cycle-title">
          <div className="card-header">
            <h2 id="cycle-title">Cycle length</h2>
            <span className="sub">days per cycle</span>
          </div>
          <TrendChart
            points={series((r) => r.cycleLengthDays)}
            unit="days"
            reference={{ value: THRESHOLDS.longCycleDays, label: "35-day limit" }}
            ariaLabel="Cycle length by visit"
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="bmi-title">
          <div className="card-header">
            <h2 id="bmi-title">Body mass index</h2>
            <span className="sub">kg/m²</span>
          </div>
          <TrendChart points={series(bmi)} unit="kg/m²" reference={{ value: 25, label: "25" }} ariaLabel="BMI by visit" />
        </section>
        <section className="card" aria-labelledby="testo-title">
          <div className="card-header">
            <h2 id="testo-title">Total testosterone</h2>
            <span className="sub">ng/dL{testo.latest ? ` · latest ${testo.latest.value}` : ""}</span>
          </div>
          <TrendChart
            points={series((r) => r.totalTestosterone)}
            unit="ng/dL"
            reference={{ value: THRESHOLDS.totalTestosteroneNgDl, label: `${THRESHOLDS.totalTestosteroneNgDl} ng/dL` }}
            ariaLabel="Total testosterone by visit"
          />
        </section>
      </div>
    </div>
  );
}
