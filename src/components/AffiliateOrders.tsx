/**
 * Affiliate orders — the receipt behind a creator's balance.
 *
 * Two exports, because a creator wants two different things at two different
 * moments:
 *
 *   `AffiliateOrdersCard` sits on the Payouts tab and answers "is anything
 *   happening" in one line. It does not list orders. A wall of sixty rows under
 *   a balance buries the thing the creator came for, which is the Withdraw
 *   button.
 *
 *   `AffiliateOrdersPage` is a page of its own, reached from that card. This is
 *   where the list belongs, with room for filters.
 *
 * Every row is a real `earnings` row joined to its order, so the list and the
 * balance are the same numbers and cannot drift apart. Filtering happens in the
 * browser against one fetch rather than a query per filter change — at a few
 * hundred orders that is instant, and it keeps the summary figures consistent
 * with what is on screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Receipt, RefreshCw } from 'lucide-react';
import { listCreatorOrders, type CreatorOrderRow } from '../lib/db';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Earning states, in the words a creator would use. */
const STATE_COPY: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'border-line bg-surface-2 text-muted' },
  clearing: { label: 'Clearing', tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  available: { label: 'Ready to withdraw', tone: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  paid: { label: 'Paid out', tone: 'border-line bg-surface-2 text-muted' },
  reversed: { label: 'Reversed', tone: 'border-pink-400/30 bg-pink-400/10 text-pink-300' },
};

const rate = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/* ─────────────────────────────────────────────────────────────
   The one-line entry point on the Payouts tab
   ───────────────────────────────────────────────────────────── */

export function AffiliateOrdersCard({
  creatorId,
  onOpen,
}: {
  creatorId: string;
  onOpen: () => void;
}) {
  const [rows, setRows] = useState<CreatorOrderRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCreatorOrders(creatorId);
      if (alive) setRows(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [creatorId]);

  const count = rows?.length ?? 0;
  const earned = (rows ?? []).reduce((sum, r) => sum + r.commissionCents, 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full bg-surface border border-line rounded-2xl p-5 flex items-center justify-between gap-4 text-left hover:border-purple-500/40 transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line flex items-center justify-center flex-shrink-0">
          <Receipt size={18} className="text-body" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-heading">Affiliate orders</p>
          <p className="text-sm text-muted truncate">
            {rows === null
              ? 'Loading…'
              : count === 0
                ? 'No attributed orders yet.'
                : `${count.toLocaleString()} ${count === 1 ? 'order' : 'orders'} · ${money(earned)} earned`}
          </p>
        </div>
      </div>
      <ChevronRight size={18} className="text-faint flex-shrink-0" />
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   The page
   ───────────────────────────────────────────────────────────── */

type RangeKey = '7' | '30' | '90' | 'all';
type StatusKey = 'all' | 'pending' | 'clearing' | 'available' | 'paid';

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

const STATUSES: Array<{ key: StatusKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'clearing', label: 'Clearing' },
  { key: 'available', label: 'Ready to withdraw' },
  { key: 'paid', label: 'Paid out' },
];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
        active
          ? 'bg-gradient-kyro text-white border-transparent'
          : 'bg-surface-2 border-line text-muted hover:text-heading'
      }`}
    >
      {label}
    </button>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="p-4 rounded-xl border border-line bg-surface-2">
      <p className="text-xs text-faint">{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${tone ?? 'text-heading'}`}>{value}</p>
    </div>
  );
}

export function AffiliateOrdersPage({
  creatorId,
  onBack,
}: {
  creatorId: string;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<CreatorOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('30');
  const [status, setStatus] = useState<StatusKey>('all');
  const [campaign, setCampaign] = useState('all');

  const load = useCallback(async () => {
    const res = await listCreatorOrders(creatorId);
    setRows(res.data);
    setError(res.error);
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Campaign names present in the data, so the filter can never be empty. */
  const campaigns = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.campaignName))].sort(),
    [rows]
  );

  const shown = useMemo(() => {
    const cutoff =
      range === 'all' ? 0 : Date.now() - Number(range) * 24 * 60 * 60 * 1000;
    return (rows ?? []).filter((r) => {
      if (cutoff && new Date(r.placedAt).getTime() < cutoff) return false;
      if (status !== 'all' && r.state !== status) return false;
      if (campaign !== 'all' && r.campaignName !== campaign) return false;
      return true;
    });
  }, [rows, range, status, campaign]);

  const totalValue = shown.reduce((sum, r) => sum + r.commissionableCents, 0);
  const totalEarned = shown.reduce((sum, r) => sum + r.commissionCents, 0);

  return (
    <div className="min-h-screen bg-app">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-heading"
        >
          <ArrowLeft size={16} /> Back to payouts
        </button>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-heading">Affiliate orders</h1>
            <p className="text-muted mt-1">
              Every order one of your videos drove, what it was worth, and what you earned on it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Summary reflects the filter, not the whole account, so the figures
            always describe what is on screen. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Summary label="Orders" value={shown.length.toLocaleString()} />
          <Summary label="Order value" value={money(totalValue)} />
          <Summary label="You earned" value={money(totalEarned)} tone="text-emerald-400" />
        </div>

        {/* Filters */}
        <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-faint w-16">Date</span>
            {RANGES.map((r) => (
              <Chip key={r.key} active={range === r.key} label={r.label} onClick={() => setRange(r.key)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-faint w-16">Status</span>
            {STATUSES.map((s) => (
              <Chip key={s.key} active={status === s.key} label={s.label} onClick={() => setStatus(s.key)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-faint w-16">Campaign</span>
            <select
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-xs font-semibold text-body focus:outline-none focus:border-purple-500 max-w-full"
            >
              <option value="all">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
          {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

          {rows !== null && rows.length === 0 && (
            <div className="p-12 text-center">
              <Receipt size={28} className="mx-auto text-faint mb-3" />
              <p className="text-sm text-muted">No attributed orders yet.</p>
              <p className="text-xs text-faint mt-1">
                When someone buys after seeing one of your videos, the order shows up here with what
                you earned on it.
              </p>
            </div>
          )}

          {rows !== null && rows.length > 0 && shown.length === 0 && (
            <div className="p-12 text-center">
              <p className="text-sm text-muted">No orders match these filters.</p>
              <button
                type="button"
                onClick={() => { setRange('all'); setStatus('all'); setCampaign('all'); }}
                className="text-xs text-purple-300 hover:text-purple-200 mt-2"
              >
                Clear filters
              </button>
            </div>
          )}

          {shown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-faint border-b border-line">
                    <th className="p-4 font-semibold">Date</th>
                    <th className="p-4 font-semibold">Order</th>
                    <th className="p-4 font-semibold">Campaign</th>
                    <th className="p-4 font-semibold text-right">Order value</th>
                    <th className="p-4 font-semibold text-right">Rate</th>
                    <th className="p-4 font-semibold text-right">You earned</th>
                    <th className="p-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((r) => {
                    const state = STATE_COPY[r.state] ?? STATE_COPY.pending;
                    return (
                      <tr key={r.earningId} className="hover:bg-surface-2 transition">
                        <td className="p-4 whitespace-nowrap">
                          <p className="text-heading font-semibold">{fullDate(r.placedAt)}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-body font-mono text-xs">{r.orderNumber ?? '—'}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-body truncate max-w-[200px]">{r.campaignName}</p>
                          <p className="text-xs text-faint truncate max-w-[200px]">{r.brandName}</p>
                        </td>
                        {/* Columns of numbers get tabular figures so they align. */}
                        <td className="p-4 text-right text-body tabular-nums">
                          {money(r.commissionableCents)}
                        </td>
                        <td className="p-4 text-right text-muted tabular-nums">
                          {rate(r.commissionBps)}
                        </td>
                        <td className="p-4 text-right font-semibold text-emerald-400 tabular-nums">
                          {money(r.commissionCents)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${state.tone}`}
                          >
                            {state.label}
                          </span>
                          {r.state === 'clearing' && r.availableAt && (
                            <p className="text-xs text-faint mt-1">
                              Clears {shortDate(r.availableAt)}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
