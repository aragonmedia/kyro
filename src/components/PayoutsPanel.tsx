/**
 * What a creator has earned, and every transfer KYRO has sent them.
 *
 * There is no withdrawing here and there used to be. A creator cannot pull
 * this money: it moves when the Brand authorizes a Payment Run, and KYRO
 * transfers their share to Stripe in that same moment (Terms §15). So the
 * figure says what it is waiting on, the history shows what actually moved,
 * and the only action is a link into the creator's own Stripe dashboard,
 * where their bank account lives.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { getCreatorEarnings, listCreatorTransfers, type PayoutRow } from '../lib/db';
import { fetchPayoutStatus, openCreatorDashboard, startCreatorPayouts, type CreatorPayoutStatus } from '../lib/platform';
import { useSession } from '../lib/session';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_TONE: Record<string, string> = {
  paid: 'border-good/30 bg-good-soft text-good',
  processing: 'border-warn/30 bg-warn-soft text-warn',
  pending: 'border-line bg-surface-2 text-muted',
  failed: 'border-bad/30 bg-bad-soft text-bad',
};

/* There was a minimum here, from when a creator pulled their own money. A
   payment run pays whatever a brand owes, however small, so a floor would
   strand the remainder rather than save anyone a fee. Stripe charges nothing
   per transfer on this model. */

export function PayoutsPanel({ creatorId }: { creatorId: string }) {
  const session = useSession();
  const creator = session.creator;

  const [available, setAvailable] = useState(0);
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [payout, setPayout] = useState<CreatorPayoutStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [earn, pay, status] = await Promise.all([
      getCreatorEarnings(creatorId, 90),
      listCreatorTransfers(creatorId),
      fetchPayoutStatus(),
    ]);
    setAvailable(earn.data.availableCents);
    setRows(pay.data);
    setPayout(status.data);
    setLoading(false);
  }, [creatorId]);

  const beginSetup = async () => {
    setStarting(true);
    setSetupError(null);
    const res = await startCreatorPayouts();
    if (res.url) {
      window.location.assign(res.url);
      return;
    }
    setStarting(false);
    setSetupError(res.error);
  };

  useEffect(() => {
    void load();
  }, [load]);

  const openDashboard = async () => {
    setOpening(true);
    setSetupError(null);
    const res = await openCreatorDashboard();
    setOpening(false);
    if (res.url) {
      window.location.assign(res.url);
      return;
    }
    setSetupError(res.error);
  };

  // Stripe decides whether this person can be paid, not KYRO. Anything stored
  // on our side is a copy of their answer and goes stale.
  const payoutsReady = Boolean(payout?.payoutsEnabled);
  const taxDone = creator?.taxFormStatus === 'complete';

  // What is holding up the money, said once. Tax first because KYRO will not
  // send a transfer without it; Stripe readiness before that because nothing
  // can move at all until onboarding is done.
  const blocker = !payoutsReady
    ? 'Set up payouts with Stripe first.'
    : !taxDone
      ? 'Your tax info has to be on file before KYRO can release a payout.'
      : null;

  return (
    <div className="space-y-6">
      {/* Payout account. Stripe collects the bank details on its own pages,
          so none of them ever reach KYRO. */}
      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {payoutsReady ? (
                <CheckCircle2 size={16} className="text-good" />
              ) : (
                <Wallet size={16} className="text-body" />
              )}
              <p className="text-sm font-semibold text-heading">
                {payoutsReady ? 'Payouts are set up' : 'Set up payouts'}
              </p>
            </div>
            <p className="text-sm text-muted mt-1 max-w-prose">
              {payoutsReady
                ? 'Stripe has everything it needs, so your earnings can be sent to you.'
                : payout?.connected
                  ? 'Stripe still needs a few details before it can pay you.'
                  : 'KYRO pays creators through Stripe. You enter your bank details on Stripe, never here.'}
            </p>

            {/* Once Stripe says transfers are active, anything still listed is
                something it will want later, not something holding the money
                up. Saying "continue setup to finish" under "Stripe has
                everything it needs" is two contradictory sentences, and the
                creator cannot tell which one to believe. */}
            {payout?.requirementsDue?.length ? (
              <p className="text-xs text-faint mt-2">
                {payoutsReady
                  ? `Nothing is holding up your payouts. Stripe may ask for ${payout.requirementsDue.length} more ${
                      payout.requirementsDue.length === 1 ? 'detail' : 'details'
                    } later, and will email you if so.`
                  : `Still outstanding: ${payout.requirementsDue.length} ${
                      payout.requirementsDue.length === 1 ? 'item' : 'items'
                    }. Continue setup to finish.`}
              </p>
            ) : null}

            {setupError && <p className="text-xs text-bad mt-2">{setupError}</p>}
          </div>

          {!payoutsReady && (
            <button
              type="button"
              onClick={() => void beginSetup()}
              disabled={starting || loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 border border-line text-sm font-semibold text-heading hover:border-line disabled:opacity-50 whitespace-nowrap"
            >
              {starting ? <RefreshCw size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              {payout?.connected ? 'Continue setup' : 'Set up with Stripe'}
            </button>
          )}
        </div>
      </div>

      {/* Earned and waiting.

          Not "available to withdraw". A creator cannot pull this money: it
          moves when the brand pays their run, and KYRO sends it to Stripe in
          that same moment. The old Withdraw button promised an action that
          did not exist and was wired to nothing, which is worse than no
          button at all. What a creator actually wants from here is their own
          Stripe dashboard, to change where the money lands. */}
      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-body" />
              <p className="text-sm font-semibold text-muted">Earned, waiting on the brand</p>
            </div>
            <p className="text-4xl font-bold text-heading mt-1">
              {loading ? '-' : money(available)}
            </p>
            <p className="text-xs text-faint mt-1">
              {payoutsReady
                ? 'Cleared orders. KYRO sends this to Stripe the moment the brand pays, and Stripe moves it to your bank.'
                : 'Cleared orders, ready to be sent once your payout account is set up.'}
            </p>
          </div>

          {payoutsReady && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void openDashboard()}
                disabled={opening}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {opening ? <RefreshCw size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}
                Manage on Stripe
              </button>
              <p className="text-xs text-faint max-w-[16rem]">
                Change your bank account, and see what Stripe has paid you.
              </p>
            </div>
          )}
        </div>
        {blocker && <p className="text-xs text-faint mt-3">{blocker}</p>}
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
              Every transfer KYRO sends you shows up here the moment a brand pays for your orders.
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
