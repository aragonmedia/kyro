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
  AlertTriangle, Building2, CheckCircle2, Clock, Mail, Phone, RefreshCw,
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
  good: 'border-good/30 bg-good-soft text-good',
  warn: 'border-warn/30 bg-warn-soft text-warn',
  bad: 'border-bad/30 bg-bad-soft text-bad',
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

/**
 * A prefilled draft in whatever mail client they use.
 *
 * Deliberately a mailto rather than anything that sends on its own: an admin
 * should read what goes to a brand before it goes, and nothing here has the
 * standing to write in KYRO's voice unsupervised.
 */
function MailButton({ to, subject, label = 'Email' }: { to: string | null; subject: string; label?: string }) {
  if (!to) {
    return (
      <span className="text-[11px] text-faint whitespace-nowrap" title="No registered address on this account">
        No email on file
      </span>
    );
  }
  return (
    <a
      href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading whitespace-nowrap"
      title={to}
    >
      <Mail size={13} /> {label}
    </a>
  );
}

/** Only rendered when a brand gave one. Operational use, never marketing. */
function CallButton({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading whitespace-nowrap"
      title={phone}
    >
      <Phone size={13} /> Call
    </a>
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

/**
 * One measure at a time, by month.
 *
 * Attributed sales and KYRO's fee are the same series two orders of magnitude
 * apart, because the fee is 1% of the sales. Drawing both would need either a
 * second y-axis, which makes the relationship between the two lines a
 * coincidence of scaling rather than a fact, or a revenue series one pixel
 * tall. So they share a chart and take turns, and only one is ever plotted.
 */
type Measure = 'sales' | 'revenue';

const MEASURES: Array<{ key: Measure; label: string; note: string }> = [
  { key: 'sales', label: 'Attributed sales', note: 'What creator content drove, month by month.' },
  { key: 'revenue', label: 'KYRO revenue', note: "Your 1% of those sales, month by month." },
];

function MonthsPanel({
  months, measure, onMeasure, totals,
}: {
  months: Overview['months'];
  measure: Measure;
  onMeasure: (m: Measure) => void;
  totals: Overview['totals'];
}) {
  const spec = MEASURES.find((m) => m.key === measure) ?? MEASURES[0];
  const valueOf = (m: Overview['months'][number]) =>
    measure === 'revenue' ? m.feeCents : m.attributedSalesCents;
  const hero = measure === 'revenue' ? totals.feeCents : totals.attributedSalesCents;
  const max = Math.max(...months.map(valueOf), 1);

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">{spec.label}</p>
          <p className="text-4xl font-bold text-heading tabular-nums mt-0.5">{money(hero)}</p>
          <p className="text-xs text-faint mt-1">{spec.note}</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
          {MEASURES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMeasure(m.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded transition ${
                m.key === measure ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {months.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">Nothing attributed yet.</p>
      ) : (
        <>
          {/* Each column is full height with its bar pushed to the bottom.
              The row used to be items-end, which let every column shrink to
              its content; a percentage height inside a box with no height
              resolves to nothing, so the bars were there and measured zero. */}
          <div className="flex items-end gap-2 h-44 mt-6">
            {months.map((m) => {
              const v = valueOf(m);
              return (
                <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col justify-end group relative">
                  {/* On hover rather than on every bar, so twelve months stay
                      readable and the exact figure is still one point away. */}
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-heading opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
                    {moneyExact(v)}
                  </span>
                  {v > 0 ? (
                    <div
                      className="w-full bg-gradient-kyro rounded-t group-hover:opacity-80 transition-opacity"
                      style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
                      title={`${monthLabel(m.month)}: ${moneyExact(v)} across ${m.orders} orders`}
                    />
                  ) : (
                    /* A month with nothing in it gets a baseline mark rather
                       than empty space, so a gap reads as a real zero instead
                       of a chart that failed to draw. */
                    <div className="w-full border-t-2 border-dashed border-line" title={`${monthLabel(m.month)}: nothing attributed`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Ends only. A label under every bar is noise at this width. */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-faint">{monthLabel(months[0].month)}</span>
            <span className="text-[11px] text-faint">{monthLabel(months[months.length - 1].month)}</span>
          </div>
        </>
      )}
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
                  <span className={b.billable ? 'text-heading font-semibold' : 'text-bad font-semibold'}>
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
          <CheckCircle2 size={28} className="mx-auto text-good mb-3" />
          <p className="text-sm text-muted">Nothing is stuck.</p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {unbillable.map((b) => (
            <div key={`u-${b.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-bad flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-heading">{b.name} owes {moneyExact(b.owedCents)} and cannot be charged</p>
                <p className="text-xs text-muted">
                  {b.billingOrigin === 'shopify_app_store'
                    ? 'Billed through Shopify, but no approved subscription for this store.'
                    : 'No payment method on file.'}
                  {b.ownerName ? ` Owner: ${b.ownerName}.` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MailButton
                  to={b.ownerEmail}
                  subject={`KYRO: a payment method is needed for ${b.name}`}
                />
                <CallButton phone={b.contactPhone} />
              </div>
            </div>
          ))}
          {held.map((c) => (
            <div key={`h-${c.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <Clock size={16} className="text-warn flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-heading">{c.name} has {moneyExact(c.earnedCents)} earned and payouts held</p>
                <p className="text-xs text-muted">{c.heldReason}.</p>
              </div>
              <MailButton
                to={c.email}
                subject={`KYRO: finish your payout setup to release ${moneyExact(c.earnedCents)}`}
              />
            </div>
          ))}
          {unsigned.map((b) => (
            <div key={`s-${b.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-warn flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-heading">{b.name} is running campaigns with no signed agreement</p>
                <p className="text-xs text-muted">
                  Attributed {money(b.attributedSalesCents)} so far.
                  {b.ownerName ? ` Owner: ${b.ownerName}.` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MailButton
                  to={b.ownerEmail}
                  subject={`KYRO: agreement outstanding for ${b.name}`}
                />
                <CallButton phone={b.contactPhone} />
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
  const [measure, setMeasure] = useState<Measure>('sales');

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
        <AlertTriangle size={28} className="mx-auto text-bad mb-3" />
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
        <div className="p-3 rounded-lg border border-bad/30 bg-bad-soft">
          <p className="text-xs text-bad">{error}</p>
        </div>
      )}

      {/* The headline sits first, the way a brand's Revenue driven and a
          creator's Earnings do. An admin opening this should see the size of
          the business before the list of everything in it. */}
      <MonthsPanel months={data.months} measure={measure} onMeasure={setMeasure} totals={t} />

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
