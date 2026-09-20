/**
 * Creator earnings.
 *
 * A hero figure plus a daily bar chart. Magnitude over time, one series, so:
 * one hue (KYRO violet, validated at >=3:1 contrast on both the light and
 * dark chart surfaces), no legend box (a single swatch would only restate the
 * title), and a direct label on the peak rather than on every bar.
 *
 * The number does NOT tick upward on a timer. It moves when an order is
 * attributed and not before. A figure that climbs on its own teaches a creator
 * to distrust every number on the screen.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { centsToDollars, getCreatorEarnings, type CreatorEarnings } from '../lib/db';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Compact, for the peak label where space is tight. */
const moneyShort = (cents: number) => {
  const d = centsToDollars(cents);
  if (d >= 1000) return `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k`;
  return `$${d.toFixed(d < 10 ? 2 : 0)}`;
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

function BalanceStat({ label, cents, hint }: { label: string; cents: number; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-faint">{label}</p>
      <p className="text-lg font-semibold text-heading">{money(cents)}</p>
      {hint && <p className="text-xs text-faint leading-snug">{hint}</p>}
    </div>
  );
}

export function EarningsCard({ creatorId }: { creatorId: string }) {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<CreatorEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const res = await getCreatorEarnings(creatorId, windowDays);
      if (!alive) return;
      setData(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [creatorId, windowDays]);

  const series = data?.series ?? [];
  const max = useMemo(() => Math.max(1, ...series.map((p) => p.cents)), [series]);
  const peakIndex = useMemo(
    () => series.reduce((best, p, i) => (p.cents > (series[best]?.cents ?? -1) ? i : best), 0),
    [series]
  );
  const hasAny = series.some((p) => p.cents > 0);
  const active = hover === null ? null : series[hover];

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">Earnings</p>
          {/* Hero figure uses the font's proportional figures. tabular-nums
              gives every digit the width of a zero, which reads loose at
              display sizes; it belongs in columns, not here. */}
          <p className="text-4xl md:text-5xl font-bold text-heading mt-1">
            {loading ? '—' : money(data?.windowCents ?? 0)}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setWindowDays(w.days)}
              className={`text-xs font-semibold px-2.5 py-1 rounded transition ${
                w.days === windowDays ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div
          className="flex items-end justify-between gap-px h-32"
          onMouseLeave={() => setHover(null)}
        >
          {loading && (
            <div className="w-full h-full flex items-center justify-center text-muted">
              <RefreshCw size={16} className="animate-spin" />
            </div>
          )}

          {!loading &&
            series.map((p, i) => {
              const pct = hasAny ? (p.cents / max) * 100 : 0;
              const isHover = hover === i;
              return (
                <div
                  key={p.date}
                  onMouseEnter={() => setHover(i)}
                  className="relative flex-1 h-full flex items-end justify-center cursor-default"
                  style={{ maxWidth: 24 }}
                >
                  {/* Bars are capped at 24px and sit narrower than their slot,
                      so the separation between neighbours is surface, not a
                      stroke. */}
                  <div
                    className="w-[calc(100%-2px)] rounded-t transition-opacity duration-150"
                    style={{
                      height: `${Math.max(pct, p.cents > 0 ? 4 : 2)}%`,
                      minHeight: 2,
                      background: p.cents > 0 ? '#8b5cf6' : 'rgb(var(--line))',
                      opacity: hover === null || isHover ? 1 : 0.45,
                    }}
                  />
                  {hasAny && i === peakIndex && hover === null && (
                    <span className="absolute -top-5 text-[10px] font-semibold text-muted whitespace-nowrap">
                      {moneyShort(p.cents)}
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        <div className="flex items-center justify-between text-xs text-faint min-h-[1rem]">
          {active ? (
            <span className="text-body font-medium">
              {dayLabel(active.date)} · {money(active.cents)}
            </span>
          ) : (
            <>
              <span>{series[0] ? dayLabel(series[0].date) : ''}</span>
              <span>{series.length ? dayLabel(series[series.length - 1].date) : ''}</span>
            </>
          )}
        </div>
      </div>

      {!loading && !hasAny && (
        <p className="text-sm text-muted leading-relaxed">
          Nothing yet. Earnings appear here when an order is attributed to one of your videos,
          and not a moment before.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-line">
        <BalanceStat label="Pending" cents={data?.pendingCents ?? 0} hint="Order not fulfilled yet" />
        <BalanceStat label="Clearing" cents={data?.clearingCents ?? 0} hint="In the 30-day window" />
        <BalanceStat
          label="Available"
          cents={data?.availableCents ?? 0}
          hint={
            data?.nextClearsAt
              ? `Next clears ${dayLabel(data.nextClearsAt.slice(0, 10))}`
              : 'Ready to withdraw'
          }
        />
        <BalanceStat label="Paid out" cents={data?.paidCents ?? 0} hint="Lifetime" />
      </div>
    </div>
  );
}
