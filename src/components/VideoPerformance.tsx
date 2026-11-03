/**
 * What one video did.
 *
 * The same panel for the creator who made it and the brand that ran it, with
 * the same numbers in it. A platform that shows a creator a flattering
 * version of their own performance is a platform they stop believing the
 * first time they check it against the brand's.
 *
 * Two charts, both single series, so neither carries a legend: the heading
 * says what is plotted.
 *
 * The retention curve is drawn from Meta's quartiles, which is all Meta
 * gives. There is no per-second curve to be had, so the axis is labelled by
 * how far through the video somebody got rather than by seconds, and five
 * honest points are drawn instead of a smooth line implying a measurement
 * that was never taken.
 *
 * Everything else is a stat tile, because a single number's job is to be
 * read, not compared, and a chart of one value is a decoration.
 */

import { useEffect, useMemo, useState } from 'react';
import { Activity, MousePointerClick, Percent, Timer } from 'lucide-react';
import { getVideoPerformance, type VideoDay } from '../lib/db';

/* ─────────────────────────────────────────────────────────────
   Drawing space. Fixed units scaled to the panel, so there is no
   measuring and the stroke stays 2px at any width.
   ───────────────────────────────────────────────────────────── */

const W = 560;
const H = 180;
/* No bottom padding for labels any more: the x axis is HTML below the
   plot, because text inside a scaled SVG shrinks with the viewBox and ends
   up at six pixels on a phone. */
const PAD = { top: 10, right: 12, bottom: 10, left: 46 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

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

/** A path through the points, gently smoothed. Matches the revenue chart. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }
  return d;
}

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
   Retention
   ───────────────────────────────────────────────────────────── */

const MARKS = [
  { at: 0, label: 'Start' },
  { at: 25, label: '25%' },
  { at: 50, label: '50%' },
  { at: 75, label: '75%' },
  { at: 100, label: 'End' },
];

function Retention({ shares }: { shares: number[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const points = shares.map((share, i) => ({
    x: PAD.left + (i * PLOT_W) / (shares.length - 1),
    y: PAD.top + PLOT_H * (1 - share),
    share,
  }));

  const line = smoothPath(points);
  const area = `${line} L ${points[points.length - 1].x} ${PAD.top + PLOT_H} L ${points[0].x} ${PAD.top + PLOT_H} Z`;
  const active = hover === null ? null : points[hover];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseLeave={() => setHover(null)}
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
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={PAD.top + PLOT_H * t}
            y2={PAD.top + PLOT_H * t}
            className="stroke-line"
            strokeWidth={1}
          />
        ))}

        {[1, 0.75, 0.5, 0.25, 0].map((t, i) => (
          <text
            key={t}
            x={PAD.left - 6}
            y={PAD.top + (PLOT_H * i) / 4 + 4}
            textAnchor="end"
            className="fill-faint"
            style={{ fontSize: 13 }}
          >
            {Math.round(t * 100)}%
          </text>
        ))}

        <path d={area} fill="url(#kyro-perf-area)" />
        <path
          d={line}
          fill="none"
          stroke="url(#kyro-perf-line)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 3.5}
              fill="#8b5cf6"
              className="stroke-surface"
              strokeWidth={2}
            />
            {/* Hit target bigger than the mark. */}
            <rect
              x={p.x - PLOT_W / (shares.length * 2)}
              y={PAD.top}
              width={PLOT_W / shares.length}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      <div className="flex justify-between mt-1" style={{ paddingLeft: `${(PAD.left / W) * 100}%`, paddingRight: `${(PAD.right / W) * 100}%` }}>
        {MARKS.map((m) => (
          <span key={m.at} className="text-[11px] text-faint">{m.label}</span>
        ))}
      </div>

      <p className="text-xs text-faint mt-1 text-center">
        {active
          ? `${pct(active.share)} still watching at ${MARKS[hover ?? 0].label.toLowerCase()}`
          : 'Share of people who started the video and were still watching'}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Daily trend
   ───────────────────────────────────────────────────────────── */

function Daily({ days }: { days: VideoDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(...days.map((d) => d.spendCents), 1);

  const points = days.map((d, i) => ({
    x: days.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i * PLOT_W) / (days.length - 1),
    y: PAD.top + PLOT_H * (1 - d.spendCents / top),
    day: d,
  }));

  const line = smoothPath(points);
  const every = Math.max(1, Math.ceil(days.length / 6));
  const active = hover === null ? null : points[hover];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Spend behind this video, by day"
      >
        <defs>
          {/* The same brand gradient the revenue chart uses, so the two
              charts read as one system. One series, so this is decoration
              rather than an identity channel. */}
          <linearGradient id="kyro-perf-line-d" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5b9bff" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ff33cc" />
          </linearGradient>
          <linearGradient id="kyro-perf-area-d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={PAD.top + PLOT_H * t}
            y2={PAD.top + PLOT_H * t}
            className="stroke-line"
            strokeWidth={1}
          />
        ))}

        <text x={PAD.left - 6} y={PAD.top + 5} textAnchor="end" className="fill-faint" style={{ fontSize: 13 }}>
          {money(top)}
        </text>
        <text x={PAD.left - 6} y={PAD.top + PLOT_H + 4} textAnchor="end" className="fill-faint" style={{ fontSize: 13 }}>
          $0
        </text>

        <path
          d={line}
          fill="none"
          stroke="url(#kyro-perf-line-d)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <g key={p.day.day}>
            {(hover === i || days.length <= 14) && (
              <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="#8b5cf6" className="stroke-surface" strokeWidth={2} />
            )}
            <rect
              x={p.x - PLOT_W / (days.length * 2 || 1)}
              y={PAD.top}
              width={Math.max(PLOT_W / (days.length || 1), 8)}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      <div className="flex justify-between mt-1" style={{ paddingLeft: `${(PAD.left / W) * 100}%`, paddingRight: `${(PAD.right / W) * 100}%` }}>
        {points.filter((_, i) => i % every === 0).map((p) => (
          <span key={p.day.day} className="text-[11px] text-faint">{dayLabel(p.day.day)}</span>
        ))}
      </div>

      <p className="text-xs text-faint mt-1 text-center">
        {active
          ? `${dayLabel(active.day.day)}: ${money(active.day.spendCents)} spent, ${count(active.day.linkClicks)} link clicks`
          : 'Spend behind this video, by day'}
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

  useEffect(() => {
    let alive = true;
    setDays(null);
    setError(null);
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
     Saying "nothing yet" is the difference between a product that is honest
     about what it knows and one that shows a creator a flat line. */
  if (days.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-body" />
          <h3 className="font-semibold text-heading">Performance</h3>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          Nothing to show yet. Performance appears once this video is running as an ad and KYRO has matched
          it, which happens automatically from the tracking link in the ad's destination URL.
        </p>
      </div>
    );
  }

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
          note="Plays for every impression"
        />
        <Tile
          icon={MousePointerClick}
          label="Link CTR"
          value={totals.linkCtr === null ? 'No data' : pct(totals.linkCtr)}
          note={`${count(totals.linkClicks)} link clicks`}
        />
        <Tile
          icon={Timer}
          label="Avg watch time"
          value={seconds(totals.avgWatch) ?? 'No data'}
          note={`${count(totals.plays)} plays`}
        />
        <Tile
          icon={Activity}
          label="Spend behind it"
          value={money(totals.spendCents)}
          note={`${count(totals.impressions)} impressions`}
        />
      </div>

      {totals.shares && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-heading">Video retention</p>
          <Retention shares={totals.shares} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-heading">Daily spend</p>
        <Daily days={days} />
      </div>

      <p className="text-xs text-faint leading-relaxed">
        From Meta, updated daily. Retention comes from Meta's quartiles, so it is measured at the start and
        at a quarter, half, three quarters and the end of the video rather than second by second. Earnings
        are counted separately, from Shopify orders attributed to this video's tracking link.
      </p>
    </div>
  );
}
