/**
 * Withdrawing, and the history of withdrawals.
 *
 * Shaped like TikTok Shop's affiliate balance: a withdrawable figure with the
 * action right beside it, and the record of past payouts underneath.
 *
 * The Withdraw button is genuinely disabled rather than decorative, and the
 * card says which condition is blocking it. A creator staring at a greyed
 * button with no explanation assumes the product is broken.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw, Wallet } from 'lucide-react';
import { getCreatorEarnings, listPayouts, type PayoutRow } from '../lib/db';
import { useSession } from '../lib/session';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_TONE: Record<string, string> = {
  paid: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  processing: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  pending: 'border-line bg-surface-2 text-muted',
  failed: 'border-pink-400/30 bg-pink-400/10 text-pink-300',
};

/** The minimum KYRO will send. Below this the transfer fee eats the payout. */
const MIN_WITHDRAW_CENTS = 2500;

export function PayoutsPanel({ creatorId }: { creatorId: string }) {
  const session = useSession();
  const creator = session.creator;

  const [available, setAvailable] = useState(0);
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [earn, pay] = await Promise.all([
      getCreatorEarnings(creatorId, 90),
      listPayouts(creatorId),
    ]);
    setAvailable(earn.data.availableCents);
    setRows(pay.data);
    setLoading(false);
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasBank = Boolean(creator?.payoutBankLast4);
  const taxDone = creator?.taxFormStatus === 'complete';
  const enough = available >= MIN_WITHDRAW_CENTS;
  const canWithdraw = hasBank && taxDone && enough;

  const blocker = !hasBank
    ? 'Add a payout account first.'
    : !taxDone
      ? 'Your tax info has to be on file before KYRO can release a payout.'
      : !enough
        ? `You need at least ${money(MIN_WITHDRAW_CENTS)} available to withdraw.`
        : null;

  return (
    <div className="space-y-6">
      {/* Withdraw */}
      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-body" />
              <p className="text-sm font-semibold text-muted">Available to withdraw</p>
            </div>
            <p className="text-4xl font-bold text-heading mt-1">
              {loading ? '—' : money(available)}
            </p>
            {creator?.payoutBankLast4 && (
              <p className="text-xs text-faint mt-1">
                To {creator.payoutBankName || 'your bank'} ····{creator.payoutBankLast4}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <button
              type="button"
              disabled={!canWithdraw}
              title={blocker ?? undefined}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUpRight size={16} />
              Withdraw
            </button>
            {blocker && <p className="text-xs text-faint max-w-[16rem]">{blocker}</p>}
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-heading">Payout history</h2>
            <p className="text-sm text-muted mt-0.5">Money that has left KYRO and gone to you.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

        {rows !== null && rows.length === 0 && (
          <div className="p-10 text-center">
            <Wallet size={28} className="mx-auto text-faint mb-3" />
            <p className="text-sm text-muted">No payouts yet.</p>
            <p className="text-xs text-faint mt-1">
              Once you withdraw, every transfer shows up here with its period and status.
            </p>
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <div className="divide-y divide-line">
            {rows.map((p) => (
              <div key={p.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-heading font-semibold tabular-nums">{money(p.amountCents)}</p>
                  <p className="text-xs text-muted">
                    {p.periodStart && p.periodEnd
                      ? `${day(p.periodStart)} to ${day(p.periodEnd)}`
                      : day(p.createdAt)}
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                      STATUS_TONE[p.status] ?? STATUS_TONE.pending
                    }`}
                  >
                    {p.status === 'paid' ? 'Paid' : p.status === 'processing' ? 'Processing' : p.status}
                  </span>
                  {p.completedAt && (
                    <p className="text-xs text-faint">{day(p.completedAt)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
