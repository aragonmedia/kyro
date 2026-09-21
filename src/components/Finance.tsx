/**
 * Finance.
 *
 * What a brand owes creators, what it has already paid, and the button that
 * moves one to the other.
 *
 * Money rules worth stating once:
 *
 *   · Only `available` earnings are payable. Pending and clearing are
 *     excluded on purpose — a brand should not be asked to pay for an order
 *     that could still be refunded.
 *   · Nothing multiplies a total by a fee rate. `platform_fee_cents` is
 *     written per earning when the order lands, so changing the fee rule
 *     later cannot retroactively rewrite what a brand was charged.
 *   · Authorising a run does not move money. It records an authorised amount
 *     and marks those earnings paid; settlement is operational until a
 *     processor is connected. The UI says so rather than implying a charge.
 *
 * A brand with nothing yet gets next steps instead of four zeros, because
 * four zeros is a dead end and the actual answer is "you have not launched a
 * campaign yet".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, Banknote, CheckCircle, ChevronRight, Clock, CreditCard,
  Receipt, RefreshCw,
} from 'lucide-react';
import { PaymentMethodSheet, type PayMethod } from './PaymentMethod';
import { useSession } from '../lib/session';
import {
  authorizePaymentRun,
  getBrandBalance,
  listBrandCommissionOrders,
  listPaymentRuns,
  type BrandBalance,
  type CommissionOrderRow,
  type PaymentRun,
} from '../lib/db';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

type StateFilter = 'all' | 'available' | 'clearing' | 'pending' | 'paid';

const STATE_LABEL: Record<string, string> = {
  available: 'Due now',
  clearing: 'Clearing',
  pending: 'Not fulfilled',
  paid: 'Paid',
};

const STATE_TONE: Record<string, string> = {
  available: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  clearing: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  pending: 'border-line bg-surface-2 text-muted',
  paid: 'border-line bg-surface-2 text-faint',
};

function Money({ label, cents, tone, hint }: { label: string; cents: number; tone?: string; hint?: string }) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-line bg-surface-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${tone ?? 'text-heading'}`}>
        {money(cents)}
      </p>
      {hint && <p className="text-[11px] sm:text-xs text-faint mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Nothing yet
   ───────────────────────────────────────────────────────────── */

function NextSteps({
  hasCampaign,
  hasCreators,
  hasVideos,
  onGo,
}: {
  hasCampaign: boolean;
  hasCreators: boolean;
  hasVideos: boolean;
  onGo: (page: 'campaigns' | 'creators' | 'submissions') => void;
}) {
  const steps = [
    { done: hasCampaign, label: 'Launch a campaign', blurb: 'Set the commission and what you want creators to make.', cta: 'Create a campaign', go: 'campaigns' as const },
    { done: hasCreators, label: 'Get creators on it', blurb: 'Accept applications, or send an invite link to creators you already know.', cta: 'Invite a creator', go: 'creators' as const },
    { done: hasVideos, label: 'Get the first videos up', blurb: 'Creators upload without waiting for approval. Tell them what is working.', cta: 'See submissions', go: 'submissions' as const },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line">
        <h2 className="text-lg font-bold text-heading">Nothing to pay yet</h2>
        <p className="text-sm text-muted mt-0.5">
          Commission appears here when an order is attributed to one of your creators' videos.
          {next && ' Here is what gets you there.'}
        </p>
      </div>

      <div className="divide-y divide-line">
        {steps.map((s) => (
          <div key={s.label} className="p-5 flex items-start gap-3">
            {s.done ? (
              <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <span className="w-[18px] h-[18px] rounded-full border border-line flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`font-semibold ${s.done ? 'text-faint line-through' : 'text-heading'}`}>
                {s.label}
              </p>
              {!s.done && <p className="text-sm text-muted mt-0.5 leading-relaxed">{s.blurb}</p>}
            </div>
            {!s.done && s === next && (
              <button
                type="button"
                onClick={() => onGo(s.go)}
                className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              >
                {s.cta} <ArrowRight size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The page
   ───────────────────────────────────────────────────────────── */

export function BrandFinance({
  brandId,
  campaigns,
  hasCampaign,
  hasCreators,
  hasVideos,
  paymentMethodLabel,
  onGo,
}: {
  brandId: string;
  campaigns: Array<{ id: string; name: string }>;
  hasCampaign: boolean;
  hasCreators: boolean;
  hasVideos: boolean;
  /** e.g. "Chase ····4821", or null when nothing is on file. */
  paymentMethodLabel: string | null;
  onGo: (page: 'campaigns' | 'creators' | 'submissions') => void;
}) {
  const [balance, setBalance] = useState<BrandBalance | null>(null);
  const [rows, setRows] = useState<CommissionOrderRow[] | null>(null);
  const [runs, setRuns] = useState<PaymentRun[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [method, setMethod] = useState<PayMethod>('ach');
  const [connecting, setConnecting] = useState<PayMethod | null>(null);
  /** The orders table is long. It stays folded until asked for. */
  const [showOrders, setShowOrders] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [bal, list, hist] = await Promise.all([
      getBrandBalance(brandId),
      listBrandCommissionOrders(brandId),
      listPaymentRuns(brandId),
    ]);
    setBalance(bal.data);
    setRows(list.data);
    setRuns(hist.data);
    setError(bal.error || list.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    let out = rows ?? [];
    if (campaignId) out = out.filter((r) => r.campaignId === campaignId);
    if (stateFilter !== 'all') out = out.filter((r) => r.state === stateFilter);
    return out;
  }, [rows, campaignId, stateFilter]);

  // Totals follow the filter, so the figures always describe what is on screen.
  const shownCommission = shown.reduce((s, r) => s + r.commissionCents, 0);
  const shownFee = shown.reduce((s, r) => s + r.feeCents, 0);
  // App Store brands get a 30-day trial: orders landing before this date
  // carry no KYRO fee. The rows already say $0; the label says why.
  const { brand: sessionBrand } = useSession();
  const trialEnds = sessionBrand?.feeWaivedUntil ? new Date(sessionBrand.feeWaivedUntil) : null;
  const inTrial = trialEnds !== null && trialEnds.getTime() > Date.now();
  const trialLabel = trialEnds
    ? trialEnds.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  const dueTotal = (balance?.dueCommissionCents ?? 0) + (balance?.dueFeeCents ?? 0);
  const nothingEver =
    balance !== null &&
    balance.dueOrders === 0 && balance.clearingOrders === 0 &&
    balance.pendingOrders === 0 && balance.paidCommissionCents === 0;

  const pay = async () => {
    setError(null);
    setDone(null);
    setPaying(true);
    const res = await authorizePaymentRun(brandId, method);
    setPaying(false);
    if (res.error) { setError(res.error); return; }
    setDone(`Authorised ${money(dueTotal)}.`);
    await load();
  };

  if (balance === null) {
    return <div className="p-10 flex justify-center"><RefreshCw size={16} className="animate-spin text-muted" /></div>;
  }

  if (nothingEver) {
    return (
      <div className="space-y-6">
        <NextSteps hasCampaign={hasCampaign} hasCreators={hasCreators} hasVideos={hasVideos} onGo={onGo} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Balance ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Money
          label="Due now"
          cents={balance.dueCommissionCents}
          tone="text-emerald-400"
          hint={`${balance.dueOrders} orders · ${balance.dueCreators} creators`}
        />
        <Money
          label="Clearing"
          cents={balance.clearingCommissionCents}
          tone="text-amber-300"
          hint={balance.nextDueAt ? `Next due ${day(balance.nextDueAt)}` : `${balance.clearingOrders} orders`}
        />
        <Money
          label="Not fulfilled"
          cents={balance.pendingCommissionCents}
          hint={`${balance.pendingOrders} orders placed`}
        />
        <Money
          label="Paid to date"
          cents={balance.paidCommissionCents}
          hint="Commission released to creators"
        />
      </div>

      {/* ── Pay ── */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-line">
          <h2 className="text-lg font-bold text-heading">Pay creators</h2>
          <p className="text-sm text-muted mt-0.5">
            Only orders that have cleared are payable. Anything still clearing could be refunded.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Creator commission</span>
              <span className="text-heading tabular-nums">{money(balance.dueCommissionCents)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                KYRO fee · 1% of attributed sales
                {inTrial && <span className="text-emerald-300"> · free trial until {trialLabel}</span>}
              </span>
              <span className="text-heading tabular-nums">{money(balance.dueFeeCents)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-line">
              <span className="font-semibold text-heading">Total to pay</span>
              <span className="text-xl font-bold text-heading tabular-nums">{money(dueTotal)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">Pay with</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {([
                { id: 'ach' as PayMethod, icon: Banknote, title: 'Bank account', sub: paymentMethodLabel ?? 'Not connected yet' },
                { id: 'card' as PayMethod, icon: CreditCard, title: 'Card', sub: 'Not connected yet' },
              ]).map((m) => {
                const connected = m.id === 'ach' && Boolean(paymentMethodLabel);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => (connected ? setMethod(m.id) : setConnecting(m.id))}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                      connected && method === m.id
                        ? 'border-purple-500/60 bg-purple-400/5'
                        : 'border-line bg-surface-2 hover:border-purple-500/40'
                    }`}
                  >
                    <m.icon size={16} className="text-body flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-heading inline-flex items-center gap-1.5 flex-wrap">
                        {m.title}
                        {m.id === 'ach' && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 whitespace-nowrap">Recommended</span>
                        )}
                      </p>
                      <p className="text-xs text-faint truncate">{m.sub}</p>
                    </div>
                    {!connected && (
                      <span className="text-xs font-semibold text-purple-300 whitespace-nowrap">Connect</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-pink-400/30 bg-pink-400/10">
              <AlertCircle size={14} className="text-pink-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-pink-200">{error}</p>
            </div>
          )}
          {done && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10">
              <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-200">{done}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void pay()}
            disabled={paying || dueTotal === 0 || !paymentMethodLabel}
            title={!paymentMethodLabel ? 'Add a bank account below first.' : undefined}
            className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {paying && <RefreshCw size={14} className="animate-spin" />}
            {dueTotal === 0 ? 'Nothing due' : `Pay ${money(dueTotal)}`}
          </button>

          {/* Say what the button does, precisely. */}
          <p className="text-xs text-faint leading-relaxed">
            Authorising records the amount and releases those orders to your creators. KYRO debits
            the account on file and pays them out. Card payments arrive when the processor is
            connected.
          </p>
        </div>
      </div>

      {/* ── The lines ── */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-heading">Creator orders</h2>
            <p className="text-sm text-muted mt-0.5">Every order you owe commission on.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowOrders((v) => !v)}
          className="w-full px-5 py-3 border-b border-line flex items-center justify-between gap-2 text-sm font-semibold text-muted hover:text-heading hover:bg-surface-2 transition"
        >
          <span>
            {showOrders ? 'Hide the list' : `Show all ${(rows ?? []).length} orders`}
          </span>
          <ChevronRight size={15} className={`transition-transform ${showOrders ? 'rotate-90' : ''}`} />
        </button>

        <div className={`p-4 border-b border-line flex flex-wrap gap-2 ${showOrders ? '' : 'hidden'}`}>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            aria-label="Filter by campaign"
            className="px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm font-semibold text-body focus:outline-none focus:border-purple-500 max-w-full"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
            aria-label="Filter by status"
            className="px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm font-semibold text-body focus:outline-none focus:border-purple-500"
          >
            <option value="all">All statuses</option>
            <option value="available">Due now</option>
            <option value="clearing">Clearing</option>
            <option value="pending">Not fulfilled</option>
            <option value="paid">Paid</option>
          </select>
          {shown.length > 0 && (
            <span className="text-xs text-faint self-center ml-auto tabular-nums">
              {shown.length} lines · {money(shownCommission)} commission · {money(shownFee)} fee
            </span>
          )}
        </div>

        {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}
        {showOrders && rows !== null && shown.length === 0 && (
          <div className="p-10 text-center">
            <Receipt size={26} className="mx-auto text-faint mb-3" />
            <p className="text-sm text-muted">Nothing matches these filters.</p>
          </div>
        )}

        {showOrders && shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-faint border-b border-line">
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold">Order</th>
                  <th className="p-4 font-semibold">Creator</th>
                  <th className="p-4 font-semibold text-right">Order value</th>
                  <th className="p-4 font-semibold text-right">Commission</th>
                  <th className="p-4 font-semibold text-right">KYRO fee</th>
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.earningId} className="hover:bg-surface-2 transition">
                    <td className="p-4 whitespace-nowrap text-body">{day(r.placedAt)}</td>
                    <td className="p-4 font-mono text-xs text-body">{r.orderNumber ?? '—'}</td>
                    <td className="p-4">
                      <p className="text-body truncate max-w-[140px]">@{r.creatorHandle.replace(/^@+/, '')}</p>
                      <p className="text-xs text-faint truncate max-w-[140px]">{r.campaignName}</p>
                    </td>
                    <td className="p-4 text-right text-body tabular-nums">{money(r.orderValueCents)}</td>
                    <td className="p-4 text-right font-semibold text-blue-400 tabular-nums">{money(r.commissionCents)}</td>
                    <td className="p-4 text-right text-muted tabular-nums">{money(r.feeCents)}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${STATE_TONE[r.state] ?? STATE_TONE.pending}`}>
                        {STATE_LABEL[r.state] ?? r.state}
                      </span>
                      {r.state === 'clearing' && r.availableAt && (
                        <p className="text-xs text-faint mt-1">Due {day(r.availableAt)}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── History ── */}
      {runs.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-line">
            <h2 className="text-lg font-bold text-heading">Payment history</h2>
          </div>
          <div className="divide-y divide-line">
            {runs.map((r) => (
              <div key={r.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-heading tabular-nums">{money(r.totalCents)}</p>
                  <p className="text-xs text-muted">
                    {r.orderCount} orders · {r.creatorCount} creators · {money(r.commissionCents)} commission
                    {r.platformFeeCents > 0 && <>{' + '}{money(r.platformFeeCents)} fee</>}
                  </p>
                  <p className="text-xs text-faint mt-0.5">{day(r.authorizedAt)}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-line bg-surface-2 text-muted whitespace-nowrap inline-flex items-center gap-1.5">
                  {r.status === 'settled' ? <CheckCircle size={12} className="text-emerald-400" /> : <Clock size={12} />}
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {connecting && (
        <PaymentMethodSheet method={connecting} brandId={brandId} onClose={() => setConnecting(null)} />
      )}
    </div>
  );
}

