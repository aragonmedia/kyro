/**
 * What one video did.
 *
 * The same panel for the creator who made it and the brand that ran it, with
 * the same numbers in it. A platform that shows a creator a flattering
 * version of their own performance is a platform they stop believing the
 * first time they check it against the brand's.
 *
 * Retention is the thing a creator can act on, so it gets two views of the
 * same five numbers and one shared position between them. Spin the dial and
 * the curve moves; drag the curve and the dial follows. They are linked
 * rather than duplicated: the dial is for a thumb, the curve is for a shape,
 * and a creator checking their phone between takes wants the first.
 *
 * Meta reports quartiles and nothing finer, so there is no per-second curve
 * to be had. The dial stops at the five points that were actually measured
 * instead of sliding smoothly through numbers nobody counted, and the axis
 * is labelled by how far through the video somebody got rather than by
 * seconds.
 *
 * Everything else is a stat tile, because a single number's job is to be
 * read, not compared, and a chart of one value is a decoration.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, MousePointerClick, Percent, Timer, TrendingDown } from 'lucide-react';
import { getVideoPerformance, type VideoDay } from '../lib/db';
import { nearestIndex, smoothPath } from '../lib/chart';
import { AXIS_GUTTER, AxisGutter } from './ChartAxis';

/* ─────────────────────────────────────────────────────────────
   Drawing space. Fixed units scaled to the panel, so there is no
   measuring and the stroke stays 2px at any width.
   ───────────────────────────────────────────────────────────── */

/**
 * A unit square, stretched to whatever box CSS gives it.
 *
 * Keeping the drawing's own proportions means a chart that is a readable
 * shape on a laptop is a 90-pixel strip on a phone, and the other way round.
 * So the plot stretches, the height comes from a CSS class per breakpoint,
 * and nothing that would distort lives inside the SVG: the axes, the day
 * labels and every marker are HTML, and the paths ask not to be scaled.
 */
const U = 1000;

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const count = (n: number) => n.toLocaleString('en-US');

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const seconds = (s: number | null) => (s === null ? null : `${s.toFixed(1)}s`);

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/** The five points Meta measures, and nothing between them. */
const MARKS = [
  { at: 0, label: 'Start', long: 'the start' },
  { at: 25, label: '25%', long: 'a quarter through' },
  { at: 50, label: '50%', long: 'halfway' },
  { at: 75, label: '75%', long: 'three quarters through' },
  { at: 100, label: 'End', long: 'the end' },
];

/* ─────────────────────────────────────────────────────────────
   Stat tile
   ───────────────────────────────────────────────────────────── */

function Tile({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="p-4 rounded-xl border border-line bg-surface-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} className="text-faint flex-shrink-0" />
        <p className="text-xs text-muted truncate">{label}</p>
      </div>
      <p className="text-xl font-bold text-heading tabular-nums">{value}</p>
      {note && <p className="text-xs text-faint mt-0.5">{note}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The dial
   ───────────────────────────────────────────────────────────── */

const DIAL = 200;
const DIAL_C = DIAL / 2;
const DIAL_R = 76;

/** A point on the ring. t runs 0 at the top, clockwise, to 1 back at the top. */
function onRing(t: number, radius = DIAL_R) {
  const rad = ((t * 360 - 90) * Math.PI) / 180;
  return { x: DIAL_C + radius * Math.cos(rad), y: DIAL_C + radius * Math.sin(rad) };
}

/** The arc from the top round to t. A full turn needs a circle, not an arc. */
function ringPath(t: number): string {
  if (t <= 0) return '';
  const start = onRing(0);
  const end = onRing(Math.min(t, 0.9999));
  return `M ${start.x} ${start.y} A ${DIAL_R} ${DIAL_R} 0 ${t > 0.5 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

/**
 * Retention as something to turn with a thumb.
 *
 * The ring is the video itself, bent into a circle: the top is the first
 * frame and going clockwise is going further in. Where the thumb sits is how
 * far through the video it is asking about, and the middle answers with how
 * many people were still there.
 *
 * It snaps to the five measured points. A dial that slid smoothly would read
 * a number at 37% through, and no such number was ever counted.
 */
function RetentionDial({
  shares,
  mark,
  onMark,
}: {
  shares: number[];
  mark: number;
  onMark: (i: number) => void;
}) {
  const frame = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const t = mark / (shares.length - 1);
  const share = shares[mark];
  const prev = mark > 0 ? shares[mark - 1] : null;
  const drop = prev === null ? null : prev - share;

  const handle = onRing(t);

  const track = (clientX: number, clientY: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = ((clientX - box.left) / box.width) * DIAL - DIAL_C;
    const y = ((clientY - box.top) / box.height) * DIAL - DIAL_C;
    // Dead zone in the middle, where a small movement swings the angle wildly.
    if (Math.hypot(x, y) < 22) return;
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    const turn = (((deg + 90) % 360) + 360) % 360 / 360;
    onMark(Math.round(turn * (shares.length - 1)));
  };

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={frame}
        viewBox={`0 0 ${DIAL} ${DIAL}`}
        className="w-[180px] h-[180px] touch-none select-none cursor-pointer"
        role="slider"
        tabIndex={0}
        aria-label="How far through the video"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={MARKS[mark]?.at ?? 0}
        aria-valuetext={`${pct(share)} still watching at ${MARKS[mark]?.long ?? 'the start'}`}
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          track(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (dragging) track(e.clientX, e.clientY); }}
        onPointerUp={(e) => {
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onMark(Math.min(mark + 1, shares.length - 1));
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onMark(Math.max(mark - 1, 0));
          }
        }}
      >
        <defs>
          <linearGradient id="kyro-dial" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5b9bff" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ff33cc" />
          </linearGradient>
        </defs>

        {/* The whole video, as a ring. */}
        <circle
          cx={DIAL_C}
          cy={DIAL_C}
          r={DIAL_R}
          fill="none"
          className="stroke-line"
          strokeWidth={12}
        />

        {/* How far in the thumb has got. */}
        <path
          d={ringPath(t)}
          fill="none"
          stroke="url(#kyro-dial)"
          strokeWidth={12}
          strokeLinecap="round"
        />

        {/* The measured points, so the snapping is visible before it happens. */}
        {shares.map((_, i) => {
          const p = onRing(i / (shares.length - 1), DIAL_R);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2}
              className={i <= mark ? 'fill-surface' : 'fill-faint'}
            />
          );
        })}

        <circle cx={handle.x} cy={handle.y} r={9} fill="#8b5cf6" className="stroke-surface" strokeWidth={3} />

        <text
          x={DIAL_C}
          y={DIAL_C - 2}
          textAnchor="middle"
          className="fill-heading font-bold tabular-nums"
          style={{ fontSize: 34 }}
        >
          {pct(share)}
        </text>
        <text x={DIAL_C} y={DIAL_C + 20} textAnchor="middle" className="fill-muted" style={{ fontSize: 13 }}>
          still watching
        </text>
        <text x={DIAL_C} y={DIAL_C + 38} textAnchor="middle" className="fill-faint" style={{ fontSize: 12 }}>
          at {MARKS[mark]?.long ?? 'the start'}
        </text>
      </svg>

      <p className="text-xs text-muted mt-1 text-center">
        {drop === null
          ? 'Turn the dial to move through the video'
          : drop <= 0
            ? `Nobody left since ${MARKS[mark - 1].long}`
            : `${pct(drop)} of viewers left since ${MARKS[mark - 1].long}`}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Retention curve
   ───────────────────────────────────────────────────────────── */

function Retention({
  shares,
  mark,
  onMark,
  live = true,
}: {
  shares: number[];
  mark: number;
  onMark: (i: number) => void;
  /** Off for the example panel, where the curve is an illustration. */
  live?: boolean;
}) {
  const frame = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const points = shares.map((share, i) => ({
    x: (i * U) / (shares.length - 1),
    y: U * (1 - share),
    share,
  }));

  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x} ${U} L ${points[0].x} ${U} Z`;

  const track = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const i = nearestIndex(clientX, box, U, points);
    if (i !== null) onMark(i);
  };

  return (
    <div style={{ paddingLeft: AXIS_GUTTER }}>
      <div className="relative">
        <AxisGutter
          labels={[1, 0.75, 0.5, 0.25, 0].map((t) => ({
            text: `${Math.round(t * 100)}%`,
            at: 1 - t,
          }))}
        />

        <svg
          ref={frame}
          viewBox={`0 0 ${U} ${U}`}
          preserveAspectRatio="none"
          className={`block w-full h-[170px] md:h-[230px] ${live ? 'touch-none select-none cursor-ew-resize' : ''}`}
          onPointerDown={live ? (e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            track(e.clientX);
          } : undefined}
          onPointerMove={live ? (e) => {
            if (dragging || e.pointerType === 'mouse') track(e.clientX);
          } : undefined}
          onPointerUp={live ? (e) => {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          } : undefined}
          role="img"
          aria-label="Share of viewers still watching at each point in the video"
        >
          <defs>
            {/* The same brand gradient the revenue chart uses, so the two
                charts read as one system. One series, so this is decoration
                rather than an identity channel. */}
            <linearGradient id="kyro-perf-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5b9bff" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ff33cc" />
            </linearGradient>
            <linearGradient id="kyro-perf-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={U}
              y1={U * t}
              y2={U * t}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill="url(#kyro-perf-area)" />
          <path
            d={line}
            fill="none"
            stroke="url(#kyro-perf-line)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {live && (
            <line
              x1={points[mark].x}
              y1={0}
              x2={points[mark].x}
              y2={U}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Markers in HTML, so stretching the drawing to its box cannot turn
            a dot into an oval. */}
        {points.map((p, i) => (
          <span
            key={i}
            className={`absolute rounded-full bg-purple-500 ring-2 ring-surface pointer-events-none ${
              live && i === mark ? 'w-3.5 h-3.5 -ml-[7px] -mt-[7px]' : 'w-2 h-2 -ml-1 -mt-1'
            }`}
            style={{ left: `${(p.x / U) * 100}%`, top: `${(p.y / U) * 100}%` }}
          />
        ))}
      </div>

      <div className="flex justify-between mt-1">
        {MARKS.map((m, i) => (
          <span key={m.at} className={`text-[11px] ${live && i === mark ? 'text-heading font-semibold' : 'text-faint'}`}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Daily trend
   ───────────────────────────────────────────────────────────── */

function Daily({ days }: { days: VideoDay[] }) {
  const frame = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const top = Math.max(...days.map((d) => d.spendCents), 1);

  const points = days.map((d, i) => ({
    x: days.length === 1 ? U / 2 : (i * U) / (days.length - 1),
    y: U * (1 - d.spendCents / top),
    day: d,
  }));

  const line = smoothPath(points);
  const every = Math.max(1, Math.ceil(days.length / 6));
  const active = hover === null ? null : points[hover];

  const track = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setHover(nearestIndex(clientX, box, U, points));
  };

  return (
    <div style={{ paddingLeft: AXIS_GUTTER }}>
      <div className="relative">
        <AxisGutter labels={[{ text: money(top), at: 0 }, { text: '$0', at: 1 }]} />

        <svg
          ref={frame}
          viewBox={`0 0 ${U} ${U}`}
          preserveAspectRatio="none"
          className="block w-full h-[150px] md:h-[190px] touch-none select-none cursor-ew-resize"
          onPointerDown={(e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            track(e.clientX);
          }}
          onPointerMove={(e) => { if (dragging || e.pointerType === 'mouse') track(e.clientX); }}
          onPointerUp={(e) => {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerLeave={() => { if (!dragging) setHover(null); }}
          role="img"
          aria-label="Spend behind this video, by day"
        >
          <defs>
            <linearGradient id="kyro-perf-line-d" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5b9bff" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ff33cc" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={U}
              y1={U * t}
              y2={U * t}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path
            d={line}
            fill="none"
            stroke="url(#kyro-perf-line-d)"
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
              y2={U}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {points.map((p, i) =>
          hover === i || days.length <= 14 ? (
            <span
              key={p.day.day}
              className={`absolute rounded-full bg-purple-500 ring-2 ring-surface pointer-events-none ${
                hover === i ? 'w-3 h-3 -ml-1.5 -mt-1.5' : 'w-1.5 h-1.5 -ml-[3px] -mt-[3px]'
              }`}
              style={{ left: `${(p.x / U) * 100}%`, top: `${(p.y / U) * 100}%` }}
            />
          ) : null
        )}
      </div>

      <div className="flex justify-between mt-1">
        {points.filter((_, i) => i % every === 0).map((p) => (
          <span key={p.day.day} className="text-[11px] text-faint">{dayLabel(p.day.day)}</span>
        ))}
      </div>

      <p className="text-xs text-faint mt-1 text-center">
        {active
          ? `${dayLabel(active.day.day)}: ${money(active.day.spendCents)} spent, ${count(active.day.linkClicks)} link clicks`
          : 'Drag across to read a day'}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Before there is anything to show
   ───────────────────────────────────────────────────────────── */

/**
 * One fixed set of figures, the same on every video.
 *
 * Deliberately not derived from the submission. Numbers that varied per
 * video would look like measurements, and a creator comparing two videos
 * would be comparing noise. Identical everywhere, nobody mistakes them for
 * their own.
 */
const EXAMPLE = {
  hookRate: 0.31,
  linkCtr: 0.018,
  avgWatch: 6.2,
  spendCents: 42_000,
  impressions: 128_000,
  linkClicks: 2_304,
  shares: [1, 0.62, 0.41, 0.3, 0.24],
};

/**
 * What the panel will look like once the video runs.
 *
 * An empty state that only says "nothing yet" tells a creator what is
 * missing without telling them what they are waiting for. This shows the
 * shape of the answer, labelled hard enough that it cannot be read as
 * theirs: an Example badge, a dashed frame, muted figures, and a sentence
 * that says so in words.
 */
function ExamplePerformance() {
  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Activity size={16} className="text-body" />
        <h3 className="font-semibold text-heading">Performance</h3>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-warn/40 bg-warn-soft text-warn">
          Example
        </span>
      </div>

      <p className="text-sm text-muted">
        Not running as an ad yet. Here is what fills in once the brand puts spend behind it.
      </p>

      <div className="rounded-xl border border-dashed border-line p-4 space-y-5 opacity-60" aria-hidden>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile icon={Percent} label="Hook rate" value={pct(EXAMPLE.hookRate)} note="Plays per impression" />
          <Tile icon={MousePointerClick} label="Link CTR" value={pct(EXAMPLE.linkCtr)} note={`${count(EXAMPLE.linkClicks)} link clicks`} />
          <Tile icon={Timer} label="Avg watch" value={`${EXAMPLE.avgWatch}s`} note="Across every play" />
          <Tile icon={Activity} label="Spend" value={money(EXAMPLE.spendCents)} note={`${count(EXAMPLE.impressions)} impressions`} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-heading">Video retention</p>
          <Retention shares={EXAMPLE.shares} mark={0} onMark={() => {}} live={false} />
        </div>
      </div>

      <p className="text-xs text-faint">
        Example figures, not yours. Your own numbers appear here within a day of the ad going live.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The panel
   ───────────────────────────────────────────────────────────── */

export function VideoPerformance({ submissionId }: { submissionId: string }) {
  const [days, setDays] = useState<VideoDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* One position shared by the dial and the curve. */
  const [mark, setMark] = useState(0);

  useEffect(() => {
    let alive = true;
    setDays(null);
    setError(null);
    setMark(0);
    void (async () => {
      const res = await getVideoPerformance(submissionId);
      if (!alive) return;
      setDays(res.data);
      setError(res.error);
    })();
    return () => { alive = false; };
  }, [submissionId]);

  const totals = useMemo(() => {
    const rows = days ?? [];
    const sum = (pick: (d: VideoDay) => number) => rows.reduce((t, d) => t + pick(d), 0);

    const impressions = sum((d) => d.impressions);
    const plays = sum((d) => d.plays);
    const linkClicks = sum((d) => d.linkClicks);
    const spendCents = sum((d) => d.spendCents);

    /* Weighted by plays, not a mean of means: a day with six plays should not
       pull the average as hard as a day with six thousand. */
    const watchWeighted = rows.reduce(
      (t, d) => (d.avgWatchSeconds === null ? t : t + d.avgWatchSeconds * d.plays),
      0
    );
    const watchBase = rows.reduce((t, d) => (d.avgWatchSeconds === null ? t : t + d.plays), 0);

    return {
      impressions,
      plays,
      linkClicks,
      spendCents,
      reach: sum((d) => d.reach),
      hookRate: impressions > 0 ? plays / impressions : null,
      linkCtr: impressions > 0 ? linkClicks / impressions : null,
      avgWatch: watchBase > 0 ? watchWeighted / watchBase : null,
      // Relative to people who started, which is what retention means.
      shares: plays > 0
        ? [1, sum((d) => d.p25) / plays, sum((d) => d.p50) / plays, sum((d) => d.p75) / plays, sum((d) => d.p100) / plays]
        : null,
    };
  }, [days]);

  /* Where the video loses the most people. The one line of this panel a
     creator can do something about on the next take. */
  const worst = useMemo(() => {
    if (!totals.shares) return null;
    let at = 1;
    for (let i = 2; i < totals.shares.length; i += 1) {
      if (totals.shares[i - 1] - totals.shares[i] > totals.shares[at - 1] - totals.shares[at]) at = i;
    }
    const lost = totals.shares[at - 1] - totals.shares[at];
    return lost > 0 ? { at, lost } : null;
  }, [totals.shares]);

  if (days === null) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5">
        <p className="text-sm text-muted">Loading performance…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5">
        <p className="text-sm text-bad">{error}</p>
      </div>
    );
  }

  /* No row means no matched ad yet, which is a real state and not a zero.
     Rather than a flat line, the example panel shows what will be here. */
  if (days.length === 0) return <ExamplePerformance />;

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Activity size={16} className="text-body" />
        <h3 className="font-semibold text-heading">Performance</h3>
        <span className="text-xs text-faint">
          {days.length} {days.length === 1 ? 'day' : 'days'} of data
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          icon={Percent}
          label="Hook rate"
          value={totals.hookRate === null ? 'No data' : pct(totals.hookRate)}
          note="Plays per impression"
        />
        <Tile
          icon={MousePointerClick}
          label="Link CTR"
          value={totals.linkCtr === null ? 'No data' : pct(totals.linkCtr)}
          note={`${count(totals.linkClicks)} link clicks`}
        />
        <Tile
          icon={Timer}
          label="Avg watch"
          value={seconds(totals.avgWatch) ?? 'No data'}
          note={`${count(totals.plays)} plays`}
        />
        <Tile
          icon={Activity}
          label="Spend"
          value={money(totals.spendCents)}
          note={`${count(totals.impressions)} impressions`}
        />
      </div>

      {totals.shares && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-heading">Where people drop off</p>

          {/* Dial first on a phone, where a thumb is the input and a 560-unit
              curve is a strip. Side by side from md up, where the curve has
              room to be a shape rather than a line. */}
          <div className="grid md:grid-cols-[190px_minmax(0,1fr)] gap-5 items-center">
            <RetentionDial shares={totals.shares} mark={mark} onMark={setMark} />
            <Retention shares={totals.shares} mark={mark} onMark={setMark} />
          </div>

          {worst && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-line bg-surface-2">
              <TrendingDown size={15} className="text-warn flex-shrink-0 mt-0.5" />
              <p className="text-xs text-body leading-relaxed">
                Biggest drop is between {MARKS[worst.at - 1].long} and {MARKS[worst.at].long}, where{' '}
                <span className="font-semibold text-heading">{pct(worst.lost)}</span> of viewers leave.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-heading">Daily spend</p>
        <Daily days={days} />
      </div>

      <p className="text-xs text-faint">From Meta, updated daily.</p>
    </div>
  );
}
