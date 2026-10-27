/**
 * The admin overview: what is actually happening on KYRO.
 *
 * This replaces a seeded dashboard that described a product KYRO stopped
 * being. Every number here comes from the database, and where a number
 * cannot be known it is absent rather than invented.
 *
 * On the chart: attributed sales and the KYRO fee are the same series an
 * order of magnitude apart, since the fee is 1% of the sales. Plotting both
 * would either need two y-axes, which is the single worst thing you can do
 * to a chart, or render the fee as a line of invisible pixels. So the months
 * chart carries one series and the fee lives in a stat tile, where a single
 * headline number belongs anyway.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, Clock, RefreshCw,
  TrendingUp, Users, Video, Wallet,
} from 'lucide-react';
import {
  loadAdminOverview,
  type AdminBrandRow, type AdminCampaignRow, type AdminCreatorRow, type AdminOverview as Overview,
} from '../lib/admin';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const moneyExact = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const pct = (bps: number | null) => (bps === null ? '—' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`);

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

/* Status tones. These are the same four the creator payouts panel uses, kept
   identical on purpose: a held payout should not be amber in one place and
   pink in another. Every one of them ships with a word, never colour alone. */
const TONE = {
  good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  bad: 'border-pink-400/30 bg-pink-400/10 text-pink-300',
  idle: 'border-line bg-surface-2 text-muted',
};

function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

function Tile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Wallet; label: string; value: string; sub?: string; tone?: keyof typeof TONE;
}) {
  return (
    <div className="p-4 rounded-xl bg-surface-2 border border-line">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className="text-body" />
        <p className="text-xs text-muted">{label}</p>
      </div>
      <p className="text-2xl font-bold text-heading tabular-nums">{value}</p>
      {sub && (
        <p className="text-[11px] mt-1">
          {tone ? <Pill tone={tone}>{sub}</Pill> : <span className="text-faint">{sub}</span>}
        </p>
      )}
    </div>
  );
}

function Panel({
  title, note, right, children,
}: {
  title: string; note?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-heading">{title}</h2>
          {note && <p className="text-sm text-muted mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Attributed sales by month. One series, so no legend: the title names it. */
function MonthsChart({ months }: { months: Overview['months'] }) {
  if (months.length === 0) {
    return <p className="p-10 text-center text-sm text-muted">No attributed sales yet.</p>;
  }
  const max = Math.max(...months.map((m) => m.attributedSalesCents), 1);

  return (
    <div className="p-5">
      <div className="flex items-end gap-2 h-44">
        {months.map((m) => (
          <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center gap-2 group">
            <div className="relative w-full flex-1 flex items-end">
              {/* The value appears on hover rather than on every bar, so the
                  chart stays readable at twelve months and still answers
                  "what exactly was March". */}
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-heading opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
                {money(m.attributedSalesCents)}
              </span>
              <div
                className="w-full bg-gradient-kyro rounded-t group-hover:opacity-80 transition-opacity"
                style={{ height: `${Math.max((m.attributedSalesCents / max) * 100, 2)}%` }}
                title={`${monthLabel(m.month)}: ${moneyExact(m.attributedSalesCents)} across ${m.orders} orders`}
              />
            </div>
            <span className="text-[11px] text-faint whitespace-nowrap">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandsTable({ rows }: { rows: AdminBrandRow[] }) {
  if (rows.length === 0) return <p className="p-10 text-center text-sm text-muted">No brands yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            <th className="p-4 font-semibold">Brand</th>
            <th className="p-4 font-semibold">Connections</th>
            <th className="p-4 font-semibold">Billing</th>
            <th className="p-4 font-semibold text-right">Campaigns</th>
            <th className="p-4 font-semibold text-right">Creators</th>
            <th className="p-4 font-semibold text-right">Attributed</th>
            <th className="p-4 font-semibold text-right">KYRO fee</th>
            <th className="p-4 font-semibold text-right">Owed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-surface-2">
              <td className="p-4">
                <p className="font-semibold text-heading">{b.name}</p>
                <p className="text-xs text-faint">
                  {b.agreementSignedAt ? `Agreed ${day(b.agreementSignedAt)}` : 'No agreement signed'}
                </p>
              </td>
              <td className="p-4 space-x-1">
                <Pill tone={b.shopifyConnected ? 'good' : 'idle'}>Shopify</Pill>
                <Pill tone={b.metaConnected ? 'good' : 'idle'}>Meta</Pill>
              </td>
              <td className="p-4">
                {b.billingOrigin === 'shopify_app_store' ? (
                  <>
                    <Pill tone={b.shopifyPlanStatus === 'ACTIVE' ? 'good' : 'warn'}>Shopify billing</Pill>
                    <p className="text-xs text-faint mt-1">{b.shopifyPlanStatus ?? 'No plan approved'}</p>
                  </>
                ) : (
                  <>
                    <Pill tone={b.paymentMethod ? 'good' : 'idle'}>Stripe</Pill>
                    <p className="text-xs text-faint mt-1">{b.paymentMethod ?? 'No method on file'}</p>
                  </>
                )}
              </td>
              <td className="p-4 text-right tabular-nums text-body">{b.campaigns}</td>
              <td className="p-4 text-right tabular-nums text-body">{b.creators}</td>
              <td className="p-4 text-right tabular-nums text-heading font-semibold">{money(b.attributedSalesCents)}</td>
              <td className="p-4 text-right tabular-nums text-body">{money(b.feeCents)}</td>
              <td className="p-4 text-right tabular-nums">
                {b.owedCents > 0 ? (
                  <span className={b.billable ? 'text-heading font-semibold' : 'text-pink-300 font-semibold'}>
                    {money(b.owedCents)}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignsTable({ rows }: { rows: AdminCampaignRow[] }) {
  if (rows.length === 0) return <p className="p-10 text-center text-sm text-muted">No campaigns yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            <th className="p-4 font-semibold">Campaign</th>
            <th className="p-4 font-semibold">Status</th>
            <th className="p-4 font-semibold text-right">Rate</th>
            <th className="p-4 font-semibold text-right">Creators</th>
            <th className="p-4 font-semibold text-right">Videos</th>
            <th className="p-4 font-semibold text-right">Orders</th>
            <th className="p-4 font-semibold text-right">Attributed</th>
            <th className="p-4 font-semibold text-right">KYRO fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2">
              <td className="p-4">
                <p className="font-semibold text-heading">{c.name}</p>
                <p className="text-xs text-faint">{c.brandName}</p>
              </td>
              <td className="p-4">
                <Pill tone={c.status === 'live' ? 'good' : c.status === 'draft' ? 'idle' : 'warn'}>
                  {c.status === 'pending_fund' ? 'legacy' : c.status}
                </Pill>
              </td>
              <td className="p-4 text-right tabular-nums text-body">{pct(c.commissionBps)}</td>
              <td className="p-4 text-right tabular-nums text-body">{c.creators}</td>
              <td className="p-4 text-right tabular-nums text-body">{c.submissions}</td>
              <td className="p-4 text-right tabular-nums text-body">{c.orders}</td>
              <td className="p-4 text-right tabular-nums text-heading font-semibold">{money(c.attributedSalesCents)}</td>
              <td className="p-4 text-right tabular-nums text-body">{money(c.feeCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreatorsTable({ rows }: { rows: AdminCreatorRow[] }) {
  if (rows.length === 0) return <p className="p-10 text-center text-sm text-muted">No creators yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            <th className="p-4 font-semibold">Creator</th>
            <th className="p-4 font-semibold">Payout status</th>
            <th className="p-4 font-semibold text-right">Campaigns</th>
            <th className="p-4 font-semibold text-right">Videos</th>
            <th className="p-4 font-semibold text-right">Used</th>
            <th className="p-4 font-semibold text-right">Orders</th>
            <th className="p-4 font-semibold text-right">Earned</th>
            <th className="p-4 font-semibold text-right">Paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2">
              <td className="p-4">
                <p className="font-semibold text-heading">{c.name}</p>
                {c.handle && <p className="text-xs text-faint">@{c.handle}</p>}
              </td>
              <td className="p-4">
                {c.heldReason ? <Pill tone="warn">{c.heldReason}</Pill> : <Pill tone="good">Payable</Pill>}
              </td>
              <td className="p-4 text-right tabular-nums text-body">{c.campaigns}</td>
              <td className="p-4 text-right tabular-nums text-body">{c.submissions}</td>
              <td className="p-4 text-right tabular-nums text-body">{c.used}</td>
              <td className="p-4 text-right tabular-nums text-body">{c.orders}</td>
              <td className="p-4 text-right tabular-nums text-heading font-semibold">{moneyExact(c.earnedCents)}</td>
              <td className="p-4 text-right tabular-nums text-body">{moneyExact(c.paidCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The rows that need a person to do something. Empty is the good state. */
function Attention({ data }: { data: Overview }) {
  const unbillable = data.brands.filter((b) => b.owedCents > 0 && !b.billable);
  const held = data.creators.filter((c) => c.heldReason && c.earnedCents > 0);
  const unsigned = data.brands.filter((b) => b.attributedSalesCents > 0 && !b.agreementSignedAt);

  const nothing = unbillable.length === 0 && held.length === 0 && unsigned.length === 0;

  return (
    <Panel title="Needs attention" note="Money that cannot move, and brands running without a signature.">
      {nothing ? (
        <div className="p-10 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-sm text-muted">Nothing is stuck.</p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {unbillable.map((b) => (
            <div key={`u-${b.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-pink-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-heading">{b.name} owes {moneyExact(b.owedCents)} and cannot be charged</p>
                <p className="text-xs text-muted">
                  {b.billingOrigin === 'shopify_app_store'
                    ? 'Billed through Shopify, but no approved subscription for this store.'
                    : 'No payment method on file.'}
                </p>
              </div>
            </div>
          ))}
          {held.map((c) => (
            <div key={`h-${c.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <Clock size={16} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-heading">{c.name} has {moneyExact(c.earnedCents)} earned and payouts held</p>
                <p className="text-xs text-muted">{c.heldReason}.</p>
              </div>
            </div>
          ))}
          {unsigned.map((b) => (
            <div key={`s-${b.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-heading">{b.name} is running campaigns with no signed agreement</p>
                <p className="text-xs text-muted">Attributed {money(b.attributedSalesCents)} so far.</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadAdminOverview();
    setData(res.data);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <div className="p-16 text-center text-sm text-muted">Loading…</div>;
  }

  if (!data) {
    return (
      <div className="p-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-pink-400 mb-3" />
        <p className="text-sm text-muted">{error ?? 'Could not load the overview.'}</p>
      </div>
    );
  }

  const t = data.totals;
  // Earned but not collected. This is the number that tells you whether the
  // billing path is actually working, rather than whether sales happened.
  const uncollected = t.feeCents - t.feeCollectedCents;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Platform overview</h1>
          <p className="text-sm text-muted mt-0.5">
            Every brand, creator, campaign and dollar on KYRO. Live from the database.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-pink-400/30 bg-pink-400/10">
          <p className="text-xs text-pink-200">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={TrendingUp} label="Attributed sales" value={money(t.attributedSalesCents)}
          sub={`${t.orders} orders`} />
        <Tile icon={Wallet} label="KYRO fee earned" value={money(t.feeCents)}
          sub={uncollected > 0 ? `${money(uncollected)} not collected` : 'All collected'}
          tone={uncollected > 0 ? 'warn' : 'good'} />
        <Tile icon={Users} label="Owed to creators" value={money(t.owedToCreatorsCents)}
          sub={`${money(t.paidToCreatorsCents)} paid to date`} />
        <Tile icon={Building2} label="Brands" value={`${t.brandsLive}`}
          sub={`of ${t.brands} signed up, with sales`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={Users} label="Creators" value={`${t.creators}`}
          sub={`${t.creatorsPayable} can be paid`}
          tone={t.creatorsPayable < t.creators ? 'warn' : 'good'} />
        <Tile icon={Video} label="Campaigns" value={`${t.campaigns}`} sub={`${t.campaignsOpen} active`} />
        <Tile icon={Wallet} label="Creator commission" value={money(t.commissionCents)} sub="earned, all time" />
        <Tile icon={CheckCircle2} label="Fee collected" value={money(t.feeCollectedCents)} sub="through settled runs" />
      </div>

      <Attention data={data} />

      <Panel title="Attributed sales by month" note="What creator content drove, month by month. Hover a bar for the exact figure.">
        <MonthsChart months={data.months} />
      </Panel>

      <Panel title="Brands" note="Every brand on KYRO, their connections, how they are billed, and what they owe.">
        <BrandsTable rows={data.brands} />
      </Panel>

      <Panel title="Campaigns" note="Every campaign, its rate, and what it has driven.">
        <CampaignsTable rows={data.campaigns} />
      </Panel>

      <Panel title="Creators" note="Every creator, the campaigns they are on, and whether KYRO can pay them.">
        <CreatorsTable rows={data.creators} />
      </Panel>

      <p className="text-xs text-faint text-center">
        Loaded {new Date(data.loadedAt).toLocaleTimeString('en-US')}.
      </p>
    </div>
  );
}
