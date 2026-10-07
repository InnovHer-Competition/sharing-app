import { useEffect, useId, useMemo, useRef, useState } from "react";

/*
 * Small dependency-free SVG charts. One series per chart (the card title
 * names it, so no legend), thin 2px lines, ≥8px markers, recessive grid,
 * and a crosshair + tooltip on hover/focus.
 */

export interface Point {
  label: string; // x label, e.g. visit date
  value: number;
}

const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

export function TrendChart({
  points,
  unit,
  reference,
  ariaLabel,
}: {
  points: Point[];
  unit: string;
  /** Optional dashed threshold line, e.g. the 35-day cycle cut-off. */
  reference?: { value: number; label: string };
  ariaLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  // The drawing width follows the container, so text stays the same size on every screen.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geo = useMemo(() => {
    const values = points.map((p) => p.value).concat(reference ? [reference.value] : []);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const lo = ticks[0];
    const hi = ticks.at(-1)!;
    const x = (i: number) =>
      PAD.left + (points.length === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (points.length - 1)) * (W - PAD.left - PAD.right));
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    return { ticks, x, y };
  }, [points, reference, W]);

  if (points.length === 0) return <p className="muted" ref={ref}>No data yet.</p>;

  const { ticks, x, y } = geo;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const step = points.length > 1 ? x(1) - x(0) : W;
  const activePoint = active !== null ? points[active] : undefined;

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} onMouseLeave={() => setActive(null)}>
        <title id={titleId}>
          {ariaLabel}: {points.map((p) => `${p.label} ${p.value} ${unit}`).join(", ")}
        </title>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {reference && (
          <g>
            <line className="ref-line" x1={PAD.left} x2={W - PAD.right} y1={y(reference.value)} y2={y(reference.value)} />
            <text className="ref-label" x={W - PAD.right} y={y(reference.value) - 5} textAnchor="end">
              {reference.label}
            </text>
          </g>
        )}
        {points.map((p, i) =>
          (points.length <= Math.floor(W / 64) || i === 0) || i === points.length - 1 ? (
            <text key={`x${i}`} className="tick" x={x(i)} y={H - 8} textAnchor="middle">
              {shortDate(p.label)}
            </text>
          ) : null,
        )}
        {activePoint && <line className="crosshair" x1={x(active!)} x2={x(active!)} y1={PAD.top} y2={H - PAD.bottom} />}
        <path className="series-line" d={path} />
        {points.map((p, i) => (
          <circle key={i} className="series-dot" cx={x(i)} cy={y(p.value)} r={active === i ? 6 : 4.5} />
        ))}
        {/* Hit targets wider than the marks */}
        {points.map((p, i) => (
          <rect
            key={`hit${i}`}
            x={x(i) - step / 2}
            y={PAD.top}
            width={step}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            tabIndex={0}
            aria-label={`${p.label}: ${p.value} ${unit}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      {activePoint && (
        <div className="tooltip" style={{ left: `${(x(active!) / W) * 100}%`, top: `${(y(activePoint.value) / H) * 100}%` }}>
          <strong>
            {activePoint.value} {unit}
          </strong>
          {new Date(`${activePoint.label}T00:00:00`).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

/**
 * Horizontal bars for counts per category, in HTML so labels keep their size
 * at any width. Single hue: bar length encodes magnitude, not identity.
 */
export function BarList({ items, ariaLabel }: { items: { label: string; value: number }[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="bar-list" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.label} title={`${item.label}: ${item.value}`}>
          <span className="bar-list-label">{item.label}</span>
          <span className="bar-list-track">
            <span className="bar-list-bar" style={{ width: `${(item.value / max) * 100}%` }} />
          </span>
          <span className="bar-list-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
