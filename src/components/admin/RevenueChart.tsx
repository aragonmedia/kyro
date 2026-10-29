/**
 * The headline figure, by month.
 *
 * A line rather than columns. Columns are for comparing months to each other;
 * the question this chart answers is whether the platform is going anywhere,
 * which is about direction, and a line is the shape that shows direction.
 *
 * One measure at a time. Attributed sales and the KYRO fee are the same
 * series two orders of magnitude apart, because the fee is 1% of the sales.
 * Drawing both needs either a second y-axis, which turns the relationship
 * between the two into an artefact of how each was scaled, or a revenue
 * series one pixel tall. So they take turns, and the chart never has two
 * scales on it.
 *
 * One series means no legend: the heading above already says what is
 * plotted, and a box with a single swatch restates it. The value is labelled
 * once, at the end of the line, and the rest live on the axis and in the
 * tooltip. Labelling every point is how a chart stops being read.
 *
 * Drawn as SVG in a fixed coordinate space scaled to the panel, so there is
 * no measuring, no resize observer, and the stroke stays 2px at any width.
 */

import { useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadCsv, toCsv } from '../../lib/csv';
import type { AdminMonth, AdminTotals } from '../../lib/admin';
import { money, moneyExact, monthLabel, stamp, usd } from './format';

export type Measure = 'sales' | 'revenue';

const MEASURES: Array<{ key: Measure; label: string; note: string }> = [
  { key: 'sales', label: 'Attributed sales', note: 'What creator content drove.' },
  { key: 'revenue', label: 'KYRO revenue', note: 'Your 1% of those sales.' },
];

const RANGES = [
  { key: '6', label: '6 months', months: 6 },
  { key: '12', label: '12 months', months: 12 },
  { key: 'all', label: 'Lifetime', months: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/* The drawing surface. Everything below is in these units and the browser
   scales the result, which is why the line is 2px wide whatever the panel. */
const W = 760;
const H = 260;
const PAD = { top: 18, right: 64, bottom: 26, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Four gridlines, including the baseline. */
const TICKS = 4;

/**
 * An axis a person would say out loud.
 *
 * The step is rounded first and the top falls out of it, rather than the
 * other way round. Rounding the top and then quartering it is what produces
 * an axis reading $0, $1.3K, $2.5K, $3.8K: every intermediate tick is a
 * number nobody would ever choose.
 */
function axisTop(maxValue: number, ticks: number): number {
  if (maxValue <= 0) return ticks;
  const rough = maxValue / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / magnitude;
  /* 1.5 and 3 are on the ladder because without them a series peaking just
     over a round number doubles the axis and spends half the panel on empty
     space above the line. */
  const step = (scaled <= 1 ? 1
    : scaled <= 1.5 ? 1.5
      : scaled <= 2 ? 2
        : scaled <= 2.5 ? 2.5
          : scaled <= 3 ? 3
            : scaled <= 5 ? 5 : 10) * magnitude;
  return step * ticks;
}

/** $0, $1.2K, $340K, $1.8M. Compact from a thousand up, as the axis wants. */
function tick(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(dollars >= 10_000_000 ? 0 : 1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(dollars >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(dollars)}`;
}

/**
 * A smooth path through the points.
 *
 * Catmull-Rom converted to cubic beziers, with every control point clamped
 * inside the range of the two values it sits between. Without the clamp a
 * curve through a spike dips below the months either side of it, and on a
 * money chart that invents a fall that did not happen.
 */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    const c1y = Math.min(Math.max(p1.y + (p2.y - p0.y) / 6, lo), hi);
    const c2y = Math.min(Math.max(p2.y - (p3.y - p1.y) / 6, lo), hi);

    d += ` C ${p1.x + (p2.x - p1.x) / 3} ${c1y}, ${p2.x - (p2.x - p1.x) / 3} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function RevenueChart({ months, totals }: { months: AdminMonth[]; totals: AdminTotals }) {
  const [measure, setMeasure] = useState<Measure>('sales');
  const [range, setRange] = useState<RangeKey>('12');
  const [hover, setHover] = useState<number | null>(null);
  const frame = useRef<SVGSVGElement>(null);

  const spec = MEASURES.find((m) => m.key === measure) ?? MEASURES[0];
  const span = RANGES.find((r) => r.key === range) ?? RANGES[1];

  const shown = useMemo(
    () => (span.months === Infinity ? months : months.slice(-span.months)),
    [months, span.months]
  );

  const valueOf = (m: AdminMonth) => (measure === 'revenue' ? m.feeCents : m.attributedSalesCents);

  /* The headline follows the range. Showing a lifetime total above six months
     of line invites the reader to add the months up and wonder why they do
     not reach it. Lifetime uses the precomputed total, which includes any
     month that fell outside the series. */
  const hero =
    span.months === Infinity
      ? (measure === 'revenue' ? totals.feeCents : totals.attributedSalesCents)
      : shown.reduce((s, m) => s + valueOf(m), 0);

  const top = axisTop(Math.max(...shown.map(valueOf), 1), TICKS);

  const points = useMemo(
    () =>
      shown.map((m, i) => ({
        x: shown.length === 1
          ? PAD.left + PLOT_W / 2
          : PAD.left + (i * PLOT_W) / (shown.length - 1),
        y: PAD.top + PLOT_H * (1 - valueOf(m) / top),
        month: m,
      })),
    // valueOf closes over `measure`, which is in the deps through `top`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, top, measure]
  );

  const line = smoothPath(points);
  const area = points.length > 0
    ? `${line} L ${points[points.length - 1].x} ${PAD.top + PLOT_H} L ${points[0].x} ${PAD.top + PLOT_H} Z`
    : '';

  /* Enough month labels to orient, never enough to collide. */
  const labelEvery = Math.max(1, Math.ceil(shown.length / 7));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || points.length === 0) return;
    // The SVG is scaled, so the pointer has to come back into chart units.
    const x = ((e.clientX - box.left) / box.width) * W;
    let nearest = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i;
    }
    setHover(nearest);
  };

  const exportCsv = () => {
    const header = ['Month', 'Attributed sales (USD)', 'Creator commission (USD)', 'KYRO revenue (USD)', 'Orders'];
    const rows = shown.map((m) => [
      m.month, usd(m.attributedSalesCents), usd(m.commissionCents), usd(m.feeCents), m.orders,
    ]);
    downloadCsv(`kyro-revenue-${span.key}-${stamp()}.csv`, toCsv(header, rows));
  };

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">{spec.label}</p>
          <p className="text-4xl font-bold text-heading mt-0.5">{money(hero)}</p>
          <p className="text-xs text-faint mt-1">
            {spec.note} {span.months === Infinity ? 'All time.' : `Last ${span.months} months.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
            {MEASURES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMeasure(m.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded transition ${
                  m.key === measure ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded transition ${
                  r.key === range ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={shown.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading disabled:opacity-40"
            title="Every month in view, as a spreadsheet"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">Nothing attributed yet.</p>
      ) : (
        <div className="relative mt-4">
          <svg
            ref={frame}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-[240px] md:h-[280px] overflow-visible"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`${spec.label} by month`}
          >
            <defs>
              {/* The brand gradient along the line. One series, so this is
                  decoration rather than an identity channel. */}
              <linearGradient id="kyro-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#5b9bff" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#ff33cc" />
              </linearGradient>
              {/* A wash, not a block. */}
              <linearGradient id="kyro-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Gridlines: hairline, solid, one step off the surface. */}
            {Array.from({ length: TICKS + 1 }, (_, i) => {
              const y = PAD.top + (PLOT_H * i) / TICKS;
              const value = top * (1 - i / TICKS);
              return (
                <g key={i}>
                  <line
                    x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                    className="stroke-line" strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 10} y={y + 3.5}
                    textAnchor="end"
                    className="fill-faint text-[11px] tabular-nums"
                  >
                    {tick(value)}
                  </text>
                </g>
              );
            })}

            <path d={area} fill="url(#kyro-area)" />
            <path
              d={line}
              fill="none"
              stroke="url(#kyro-line)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* The end of the line gets its value, and nothing else does. */}
            {points.length > 0 && !active && (
              <>
                <circle
                  cx={points[points.length - 1].x}
                  cy={points[points.length - 1].y}
                  r={4}
                  fill="#ff33cc"
                  className="stroke-surface"
                  strokeWidth={2}
                />
                <text
                  x={points[points.length - 1].x + 10}
                  y={points[points.length - 1].y + 4}
                  className="fill-heading text-[12px] font-semibold"
                >
                  {money(valueOf(points[points.length - 1].month))}
                </text>
              </>
            )}

            {/* Crosshair. */}
            {active && (
              <>
                <line
                  x1={active.x} y1={PAD.top} x2={active.x} y2={PAD.top + PLOT_H}
                  className="stroke-line" strokeWidth={1}
                />
                <circle
                  cx={active.x} cy={active.y} r={5}
                  fill="#8b5cf6"
                  className="stroke-surface"
                  strokeWidth={2}
                />
              </>
            )}

            {shown.map((m, i) =>
              /* The last month is always labelled, so a regular label that
                 lands next to it is dropped rather than drawn on top of it. */
              i === shown.length - 1
              || (i % labelEvery === 0 && i < shown.length - 1 - labelEvery / 2) ? (
                <text
                  key={m.month}
                  x={points[i].x}
                  y={H - 6}
                  textAnchor={i === 0 ? 'start' : i === shown.length - 1 ? 'end' : 'middle'}
                  className="fill-faint text-[11px]"
                >
                  {monthLabel(m.month)}
                </text>
              ) : null
            )}
          </svg>

          {/* The tooltip is HTML rather than SVG so it wears the same tokens
              as the rest of the portal and stays readable in both themes. */}
          {active && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full px-3 py-2 rounded-lg bg-surface-2 border border-line shadow-lg whitespace-nowrap"
              style={{
                left: `${(active.x / W) * 100}%`,
                top: `${(active.y / H) * 100}%`,
                marginTop: '-10px',
              }}
            >
              <p className="text-[11px] text-faint">{monthLabel(active.month.month)}</p>
              <p className="text-sm font-bold text-heading tabular-nums">
                {moneyExact(valueOf(active.month))}
              </p>
              <p className="text-[11px] text-muted tabular-nums">
                {active.month.orders} {active.month.orders === 1 ? 'order' : 'orders'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
