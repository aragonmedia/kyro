/**
 * The headline figure, by month.
 *
 * One measure at a time. Attributed sales and the KYRO fee are the same
 * series two orders of magnitude apart, because the fee is 1% of the sales.
 * Drawing both needs either a second y-axis, which turns the relationship
 * between the two into an artefact of how each was scaled, or a revenue
 * series one pixel tall. So they take turns.
 *
 * Bars are capped in width rather than stretched. With five months a
 * flex-1 bar is two hundred pixels across and the chart reads as a block of
 * colour; the data is in the heights, and a bar wider than it needs to be
 * adds nothing but ink.
 */

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadCsv, toCsv } from '../../lib/csv';
import type { AdminMonth, AdminTotals } from '../../lib/admin';
import { money, moneyExact, monthLabel } from './format';

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

export function RevenueChart({ months, totals }: { months: AdminMonth[]; totals: AdminTotals }) {
  const [measure, setMeasure] = useState<Measure>('sales');
  const [range, setRange] = useState<RangeKey>('12');

  const spec = MEASURES.find((m) => m.key === measure) ?? MEASURES[0];
  const span = RANGES.find((r) => r.key === range) ?? RANGES[1];

  const shown = useMemo(
    () => (span.months === Infinity ? months : months.slice(-span.months)),
    [months, span.months]
  );

  const valueOf = (m: AdminMonth) => (measure === 'revenue' ? m.feeCents : m.attributedSalesCents);

  /* The headline follows the range. Showing a lifetime total above six months
     of bars invites the reader to add the bars up and wonder why they do not
     reach it. Lifetime uses the precomputed total, which includes any month
     that fell outside the series. */
  const hero =
    span.months === Infinity
      ? (measure === 'revenue' ? totals.feeCents : totals.attributedSalesCents)
      : shown.reduce((s, m) => s + valueOf(m), 0);

  const max = Math.max(...shown.map(valueOf), 1);

  const exportCsv = () => {
    const header = ['Month', 'Attributed sales (USD)', 'Creator commission (USD)', 'KYRO revenue (USD)', 'Orders'];
    const rows = shown.map((m) => [
      m.month,
      (m.attributedSalesCents / 100).toFixed(2),
      (m.commissionCents / 100).toFixed(2),
      (m.feeCents / 100).toFixed(2),
      m.orders,
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`kyro-revenue-${span.key}-${stamp}.csv`, toCsv(header, rows));
  };

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">{spec.label}</p>
          <p className="text-4xl font-bold text-heading tabular-nums mt-0.5">{money(hero)}</p>
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
        <p className="py-12 text-center text-sm text-muted">Nothing attributed yet.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-1 h-40 mt-6">
            {shown.map((m) => {
              const v = valueOf(m);
              return (
                <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group relative">
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-heading opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
                    {moneyExact(v)}
                  </span>
                  {v > 0 ? (
                    <div
                      className="w-full max-w-[22px] bg-gradient-kyro rounded-t-sm group-hover:opacity-80 transition-opacity"
                      style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
                      title={`${monthLabel(m.month)}: ${moneyExact(v)} across ${m.orders} orders`}
                    />
                  ) : (
                    /* A month with nothing in it gets a baseline mark rather
                       than empty space, so a gap reads as a real zero instead
                       of a chart that failed to draw. */
                    <div
                      className="w-full max-w-[22px] border-t border-dashed border-line"
                      title={`${monthLabel(m.month)}: nothing attributed`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-faint">{monthLabel(shown[0].month)}</span>
            <span className="text-[11px] text-faint">{monthLabel(shown[shown.length - 1].month)}</span>
          </div>
        </>
      )}
    </div>
  );
}
