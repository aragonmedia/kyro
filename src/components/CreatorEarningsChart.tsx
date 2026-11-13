/**
 * What a creator earned, day by day.
 *
 * The same picture the admin portal draws for platform revenue, pointed at
 * one creator's own money, and sharing its axis and curve maths through
 * lib/chart so the two cannot drift into charts that round differently.
 *
 * Every day in the window is plotted, including the empty ones. Dropping
 * days with no orders would compress the gaps and draw a line that rises
 * steadily through a fortnight of silence.
 *
 * One measure at a time, so there is never a second y-axis: money and order
 * counts are the same series two orders of magnitude apart, and scaling them
 * onto one grid turns the relationship between them into an artefact of how
 * each was scaled.
 *
 * Scrubbing works with a finger. The whole plot is a drag surface, pointer
 * events rather than mouse events, with touch-action off so dragging reads
 * the chart instead of scrolling the page.
 */

import { useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { axisCount, axisMoney, axisTop, nearestIndex, smoothPath } from '../lib/chart';
import { AXIS_GUTTER, AxisGutter } from './ChartAxis';

export interface EarningDay {
  /** YYYY-MM-DD, UTC. */
  day: string;
  earnedCents: number;
  orders: number;
}

type Measure = 'earned' | 'orders';

const MEASURES: Array<{ key: Measure; label: string }> = [
  { key: 'earned', label: 'Earned' },
  { key: 'orders', label: 'Orders' },
];

/* The plot is stretched to whatever box CSS gives it rather than keeping the
   viewBox's own proportions, so the panel can be 180px tall on a phone and
   260 on a laptop without the drawing letterboxing itself into a strip. That
   means no text and no circles inside the SVG, since both would stretch
   with it: the axis, the marker and the day labels are all HTML. Strokes
   survive because every path asks not to be scaled. */
const W = 1000;
const H = 1000;
const TICKS = 4;

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export function CreatorEarningsChart({
  days,
  windowDays,
}: {
  days: EarningDay[];
  windowDays: number;
}) {
  const [measure, setMeasure] = useState<Measure>('earned');
  const [at, setAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<SVGSVGElement>(null);

  const valueOf = (d: EarningDay) => (measure === 'orders' ? d.orders : d.earnedCents);

  const total = days.reduce((s, d) => s + valueOf(d), 0);
  const top = axisTop(Math.max(...days.map(valueOf), measure === 'orders' ? 1 : 100), TICKS);

  const points = useMemo(
    () =>
      days.map((d, i) => ({
        x: days.length === 1 ? W / 2 : (i * W) / (days.length - 1),
        y: H * (1 - valueOf(d) / top),
        day: d,
      })),
    // valueOf closes over `measure`, which reaches the deps through `top`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, top, measure]
  );

  const line = smoothPath(points);
  const area =
    points.length > 0
      ? `${line} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`
      : '';

  const track = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setAt(nearestIndex(clientX, box, W, points));
  };

  const active = at === null ? null : points[at] ?? null;

  /* Three labels under the plot: the ends and the middle. More than that
     collide on a phone, and fewer leaves the line floating in no time at
     all. The scrub readout carries the exact day anyway. */
  const edges = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];

  const show = (d: EarningDay) => (measure === 'orders' ? `${d.orders}` : money(d.earnedCents));
  const tick = (v: number) => (measure === 'orders' ? axisCount(v) : axisMoney(v));

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-body" />
            <p className="text-sm font-semibold text-muted">
              {measure === 'orders' ? 'Orders from your videos' : 'What you earned'}
            </p>
          </div>
          <p className="text-4xl font-bold text-heading mt-0.5 tabular-nums">
            {measure === 'orders' ? total.toLocaleString('en-US') : money(total)}
          </p>
          <p className="text-xs text-faint mt-1">Last {windowDays} days.</p>
        </div>

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
      </div>

      {days.length === 0 ? (
        <p className="py-14 text-center text-sm text-muted">Nothing attributed in this period.</p>
      ) : (
        <div className="mt-4">
          <div style={{ paddingLeft: AXIS_GUTTER }}>
            <div className="relative">
              <AxisGutter
                labels={Array.from({ length: TICKS + 1 }, (_, i) => ({
                  text: tick(top * (1 - i / TICKS)),
                  at: i / TICKS,
                }))}
              />
              <svg
                ref={frame}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="block w-full h-[180px] md:h-[260px] touch-none select-none cursor-ew-resize"
                onPointerDown={(e) => {
                  setDragging(true);
                  e.currentTarget.setPointerCapture(e.pointerId);
                  track(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (dragging || e.pointerType === 'mouse') track(e.clientX);
                }}
                onPointerUp={(e) => {
                  setDragging(false);
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onPointerLeave={() => { if (!dragging) setAt(null); }}
                role="img"
                aria-label={`${measure === 'orders' ? 'Orders' : 'Earnings'} by day. Drag across to read a day.`}
              >
                <defs>
                  <linearGradient id="kyro-earn-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5b9bff" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#ff33cc" />
                  </linearGradient>
                  <linearGradient id="kyro-earn-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {Array.from({ length: TICKS + 1 }, (_, i) => (
                  <line
                    key={i}
                    x1={0}
                    y1={(H * i) / TICKS}
                    x2={W}
                    y2={(H * i) / TICKS}
                    className="stroke-line"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}

                <path d={area} fill="url(#kyro-earn-area)" />
                <path
                  d={line}
                  fill="none"
                  stroke="url(#kyro-earn-line)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {active && (
                  <line
                    x1={active.x}
                    y1={0}
                    x2={active.x}
                    y2={H}
                    className="stroke-line"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

              {/* The marker is HTML so a stretched viewBox cannot turn it
                  into an oval. */}
              {active && (
                <span
                  className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-purple-500 ring-2 ring-surface pointer-events-none"
                  style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
                />
              )}
            </div>

            <div className="flex justify-between mt-1">
              {edges.map((i) => (
                <span key={points[i].day.day} className="text-[11px] text-faint">
                  {dayLabel(points[i].day.day)}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-faint mt-2 text-center">
            {active
              ? `${dayLabel(active.day.day)}: ${show(active.day)}`
              : 'Drag across the chart to read a day'}
          </p>
        </div>
      )}
    </div>
  );
}
