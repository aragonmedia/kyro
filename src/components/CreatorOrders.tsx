/**
 * The orders behind a creator's balance.
 *
 * Modelled on how TikTok Shop shows affiliate orders: the balance is a claim,
 * and this is the receipt. Which order, which campaign, what it was worth,
 * what rate applied, and when it clears.
 *
 * Every row is a real `earnings` row joined to its order. Nothing here is
 * derived from a figure shown elsewhere, so the list and the balance cannot
 * drift apart.
 */

import { useCallback, useEffect, useState } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { listCreatorOrders, type CreatorOrderRow } from '../lib/db';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Earning states, in the words a creator would use. */
const STATE_COPY: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'border-line bg-surface-2 text-muted' },
  clearing: { label: 'Clearing', tone: 'border-amber-400/30 bg-amber-400/10 text-amber-300' },
  available: { label: 'Available', tone: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' },
  paid: { label: 'Paid out', tone: 'border-line bg-surface-2 text-muted' },
  reversed: { label: 'Reversed', tone: 'border-pink-400/30 bg-pink-400/10 text-pink-300' },
};

export function CreatorOrders({ creatorId }: { creatorId: string }) {
  const [rows, setRows] = useState<CreatorOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listCreatorOrders(creatorId);
    setRows(res.data);
    setError(res.error);
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-heading">Orders</h2>
          <p className="text-sm text-muted mt-0.5">Every order your videos earned on.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
      {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      {rows !== null && rows.length === 0 && (
        <div className="p-10 text-center">
          <Receipt size={28} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">No attributed orders yet.</p>
          <p className="text-xs text-faint mt-1">
            When someone buys after seeing one of your videos, the order shows up here with what you earned on it.
          </p>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-faint border-b border-line">
                <th className="p-4 font-semibold">Order</th>
                <th className="p-4 font-semibold">Campaign</th>
                <th className="p-4 font-semibold text-right">Order value</th>
                <th className="p-4 font-semibold text-right">Rate</th>
                <th className="p-4 font-semibold text-right">You earned</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const state = STATE_COPY[r.state] ?? STATE_COPY.pending;
                return (
                  <tr key={r.earningId} className="hover:bg-surface-2 transition">
                    <td className="p-4">
                      <p className="font-semibold text-heading">{r.orderNumber ?? '—'}</p>
                      <p className="text-xs text-faint">{shortDate(r.placedAt)}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-body truncate max-w-[180px]">{r.campaignName}</p>
                      <p className="text-xs text-faint truncate max-w-[180px]">{r.brandName}</p>
                    </td>
                    {/* Columns of numbers get tabular figures so they align. */}
                    <td className="p-4 text-right text-body tabular-nums">
                      {money(r.commissionableCents)}
                    </td>
                    <td className="p-4 text-right text-muted tabular-nums">
                      {(r.commissionBps / 100).toFixed(r.commissionBps % 100 === 0 ? 0 : 1)}%
                    </td>
                    <td className="p-4 text-right font-semibold text-emerald-400 tabular-nums">
                      {money(r.commissionCents)}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${state.tone}`}
                      >
                        {state.label}
                      </span>
                      {r.state === 'clearing' && r.availableAt && (
                        <p className="text-xs text-faint mt-1">Clears {shortDate(r.availableAt)}</p>
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
  );
}
