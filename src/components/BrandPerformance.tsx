/**
 * Brand performance.
 *
 * The mirror of the creator's earnings card, reading the same `earnings` rows
 * from the other side: what a brand's campaigns drove, and what that cost in
 * creator commission. A brand and a creator looking at the same campaign are
 * looking at the same numbers.
 *
 * Deliberately no KYRO fee here. The fee belongs on the invoice, not on the
 * screen a brand opens every morning.
 *
 * Chart conventions match the creator card on purpose — one hue, no legend, a
 * direct label on the peak only — so the two sides of the product read as one
 * product.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { centsToDollars, getBrandPerformance, type BrandPerformance } from '../lib/db';

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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-faint">{label}</p>
      <p className="text-lg font-semibold text-heading">{value}</p>
      {hint && <p className="text-xs text-faint leading-snug">{hint}</p>}
    </div>
  );
}

export function BrandPerformanceCard({
  brandId,
  campaigns,
}: {
  brandId: string;
  /** For the campaign filter. Empty means the filter is hidden. */
  campaigns: Array<{ id: string; name: string }>;
}) {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [campaignId, setCampaignId] = useState<string>('');
  const [data, setData] = useState<BrandPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void (async () => {
      const res = await getBrandPerformance(brandId, windowDays, campaignId || null);
      if (!alive) return;
      setData(res.data);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [brandId, windowDays, campaignId]);

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
          <p className="text-sm font-semibold text-muted">
            Revenue driven
            {campaignId && (
              <span className="text-faint font-normal">
                {' · '}
                {campaigns.find((c) => c.id === campaignId)?.name ?? 'campaign'}
              </span>
            )}
          </p>
          {/* Hero figure uses the font's proportional figures. tabular-nums
              gives every digit the width of a zero, which reads loose at
              display sizes; it belongs in columns, not here. */}
          <p className="text-4xl md:text-5xl font-bold text-heading mt-1">
            {loading ? '—' : money(data?.revenueCents ?? 0)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        {campaigns.length > 1 && (
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            aria-label="Filter by campaign"
            className="px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-xs font-semibold text-body focus:outline-none focus:border-purple-500 max-w-[12rem]"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
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
      </div>

      <div className="space-y-2">
        <p className="text-xs text-faint">Creator commission, day by day</p>
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
          Nothing yet. This fills in when Shopify tells KYRO an order was placed after someone saw
          one of your creators' videos.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-line">
        <Stat
          label="Creator commission"
          value={money(data?.windowCents ?? 0)}
          hint={`Last ${windowDays} days`}
        />
        <Stat
          label="Attributed orders"
          value={(data?.orders ?? 0).toLocaleString()}
          hint="Bought after watching"
        />
        <Stat
          label="Creators earning"
          value={(data?.creators ?? 0).toLocaleString()}
          hint="Drove at least one order"
        />
        <Stat
          label="Videos converting"
          value={(data?.videos ?? 0).toLocaleString()}
          hint="Of everything submitted"
        />
      </div>
    </div>
  );
}
