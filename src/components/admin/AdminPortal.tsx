/**
 * The admin portal.
 *
 * Sectioned the way the brand and creator portals are, because one page
 * holding every brand, every creator, every campaign and every payment run
 * stops being an overview and becomes a scroll. Overview answers "how is the
 * platform doing"; the other four answer "tell me about this one thing".
 *
 * Every row that names a brand or a creator opens that brand or creator.
 * A list you cannot drill into makes you go and find the record somewhere
 * else, which in practice means the database.
 *
 * All of it reads through supabase-js under the caller's own session.
 * `public.is_admin()` is in the row-level security on every table this
 * touches, so the server decides what an admin may see. Nothing here widens
 * anything, and an account that is not an admin gets empty arrays rather than
 * a hidden page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, Clock, DollarSign, Download,
  Layers, RefreshCw, TrendingUp, Users, Video, Wallet,
} from 'lucide-react';
import {
  loadAdminOverview,
  type AdminBrandRow, type AdminCampaignRow, type AdminCreatorRow,
  type AdminOverview as Overview, type AdminRunRow,
} from '../../lib/admin';
import { downloadCsv, toCsv } from '../../lib/csv';
import { RevenueChart } from './RevenueChart';
import { CallButton, EmptyRow, Field, MailButton, Panel, Pill, TH, Tile } from './shared';
import { count, day, money, moneyExact, pct } from './format';

type Page = 'overview' | 'brands' | 'creators' | 'campaigns' | 'finance';

const NAV: Array<{ id: Page; label: string; icon: typeof Users }> = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'brands', label: 'Brands', icon: Building2 },
  { id: 'creators', label: 'Creators', icon: Users },
  { id: 'campaigns', label: 'Campaigns', icon: Layers },
  { id: 'finance', label: 'Finance', icon: DollarSign },
];

/* ─────────────────────────────────────────────────────────────
   Sections
   ───────────────────────────────────────────────────────────── */

function Attention({ data, onBrand, onCreator }: {
  data: Overview;
  onBrand: (id: string) => void;
  onCreator: (id: string) => void;
}) {
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
                <button type="button" onClick={() => onBrand(b.id)} className="text-sm font-semibold text-heading hover:underline text-left">
                  {b.name} owes {moneyExact(b.owedCents)} and cannot be charged
                </button>
                <p className="text-xs text-muted">
                  {b.billingOrigin === 'shopify_app_store'
                    ? 'Billed through Shopify, but no approved subscription for this store.'
                    : 'No payment method on file.'}
                  {b.ownerName ? ` Owner: ${b.ownerName}.` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MailButton to={b.ownerEmail} subject={`KYRO: a payment method is needed for ${b.name}`} />
                <CallButton phone={b.contactPhone} />
              </div>
            </div>
          ))}
          {held.map((c) => (
            <div key={`h-${c.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <Clock size={16} className="text-warn flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => onCreator(c.id)} className="text-sm font-semibold text-heading hover:underline text-left">
                  {c.name} has {moneyExact(c.earnedCents)} earned and payouts held
                </button>
                <p className="text-xs text-muted">{c.heldReason}.</p>
              </div>
              <MailButton to={c.email} subject={`KYRO: finish your payout setup to release ${moneyExact(c.earnedCents)}`} />
            </div>
          ))}
          {unsigned.map((b) => (
            <div key={`s-${b.id}`} className="p-4 flex flex-wrap items-center gap-3">
              <AlertTriangle size={16} className="text-warn flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <button type="button" onClick={() => onBrand(b.id)} className="text-sm font-semibold text-heading hover:underline text-left">
                  {b.name} is running campaigns with no signed agreement
                </button>
                <p className="text-xs text-muted">
                  Attributed {money(b.attributedSalesCents)} so far.
                  {b.ownerName ? ` Owner: ${b.ownerName}.` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <MailButton to={b.ownerEmail} subject={`KYRO: agreement outstanding for ${b.name}`} />
                <CallButton phone={b.contactPhone} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function BrandsTable({ rows, onOpen }: { rows: AdminBrandRow[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <EmptyRow>No brands yet.</EmptyRow>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            <TH>Brand</TH><TH>Connections</TH><TH>Billing</TH>
            <TH right>Campaigns</TH><TH right>Creators</TH>
            <TH right>Attributed</TH><TH right>KYRO fee</TH><TH right>Owed</TH>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => onOpen(b.id)}>
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
                  <Pill tone={b.shopifyPlanStatus === 'ACTIVE' ? 'good' : 'warn'}>Shopify billing</Pill>
                ) : (
                  <Pill tone={b.paymentMethod ? 'good' : 'idle'}>{b.paymentMethod ?? 'No method'}</Pill>
                )}
              </td>
              <td className="p-4 text-right tabular-nums text-body">{b.campaigns}</td>
              <td className="p-4 text-right tabular-nums text-body">{b.creators}</td>
              <td className="p-4 text-right tabular-nums text-heading font-semibold">{money(b.attributedSalesCents)}</td>
              <td className="p-4 text-right tabular-nums text-body">{money(b.feeCents)}</td>
              <td className="p-4 text-right tabular-nums">
                {b.owedCents > 0
                  ? <span className={b.billable ? 'text-heading font-semibold' : 'text-bad font-semibold'}>{money(b.owedCents)}</span>
                  : <span className="text-faint">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreatorsTable({ rows, onOpen }: { rows: AdminCreatorRow[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <EmptyRow>No creators yet.</EmptyRow>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            <TH>Creator</TH><TH>Payout status</TH>
            <TH right>Campaigns</TH><TH right>Videos</TH><TH right>Used</TH>
            <TH right>Orders</TH><TH right>Earned</TH><TH right>Paid</TH>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => onOpen(c.id)}>
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

function CampaignsTable({ rows, onBrand }: { rows: AdminCampaignRow[]; onBrand: (id: string) => void }) {
  if (rows.length === 0) return <EmptyRow>No campaigns yet.</EmptyRow>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            <TH>Campaign</TH><TH>Status</TH><TH right>Rate</TH>
            <TH right>Creators</TH><TH right>Videos</TH><TH right>Orders</TH>
            <TH right>Attributed</TH><TH right>KYRO fee</TH>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-2">
              <td className="p-4">
                <p className="font-semibold text-heading">{c.name}</p>
                <button type="button" onClick={() => onBrand(c.brandId)} className="text-xs text-faint hover:text-heading hover:underline">
                  {c.brandName}
                </button>
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

/**
 * Finance: what has actually moved.
 *
 * The distinction that matters here is earned against collected. A fee on an
 * order that cleared is earned; it is only collected once the brand's run has
 * settled, and a run sitting in `processing` on a bank debit has been charged
 * without the money arriving.
 */
function FinanceSection({ data, onBrand }: { data: Overview; onBrand: (id: string) => void }) {
  const t = data.totals;
  const settled = data.runs.filter((r) => r.status === 'settled');
  const inFlight = data.runs.filter((r) => r.status === 'authorized' || r.status === 'processing');
  const collectedProcessing = settled.reduce((s, r) => s + r.processingCents, 0);
  const uncollected = t.feeCents - t.feeCollectedCents;

  const exportRuns = () => {
    const header = [
      'Authorized', 'Settled', 'Brand', 'Status', 'Method',
      'Creator commission (USD)', 'KYRO fee (USD)', 'Processing (USD)', 'Total charged (USD)',
      'Orders', 'Creators',
    ];
    const rows = data.runs.map((r) => [
      r.authorizedAt, r.settledAt ?? '', r.brandName, r.status, r.method ?? '',
      (r.commissionCents / 100).toFixed(2), (r.feeCents / 100).toFixed(2),
      (r.processingCents / 100).toFixed(2), (r.totalCents / 100).toFixed(2),
      r.orders, r.creators,
    ]);
    downloadCsv(`kyro-payment-runs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={Wallet} label="KYRO revenue collected" value={money(t.feeCollectedCents)}
          sub="through settled runs" tone="good" />
        <Tile icon={Clock} label="Earned, not collected" value={money(uncollected)}
          sub={uncollected > 0 ? 'waiting on a brand to pay' : 'nothing outstanding'}
          tone={uncollected > 0 ? 'warn' : 'good'} />
        <Tile icon={Users} label="Paid to creators" value={money(t.paidToCreatorsCents)}
          sub={`${money(t.owedToCreatorsCents)} still owed`} />
        <Tile icon={DollarSign} label="Processing paid out" value={money(collectedProcessing)}
          sub="passed to Stripe at cost" />
      </div>

      <Panel
        title="Payment runs"
        note="Every run a brand authorized, what it was charged, and what reached creators."
        right={
          <button
            type="button"
            onClick={exportRuns}
            disabled={data.runs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading disabled:opacity-40"
          >
            <Download size={13} /> Export
          </button>
        }
      >
        {data.runs.length === 0 ? (
          <EmptyRow>No payment runs yet. A run appears when a brand authorizes one.</EmptyRow>
        ) : (
          <div className="divide-y divide-line">
            {data.runs.map((r) => <RunRow key={r.id} run={r} onBrand={onBrand} />)}
          </div>
        )}
      </Panel>

      {inFlight.length > 0 && (
        <p className="text-xs text-faint text-center">
          {inFlight.length} run{inFlight.length === 1 ? '' : 's'} in flight. A bank debit takes a few days to settle.
        </p>
      )}
    </div>
  );
}

function RunRow({ run, onBrand }: { run: AdminRunRow; onBrand: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const tone = run.status === 'settled' ? 'good' : run.status === 'failed' || run.status === 'cancelled' ? 'bad' : 'warn';

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => onBrand(run.brandId)} className="font-semibold text-heading hover:underline">
            {run.brandName}
          </button>
          <p className="text-xs text-muted">
            {day(run.authorizedAt)} · {run.orders} orders · {run.creators} creator{run.creators === 1 ? '' : 's'}
            {run.method ? ` · ${run.method === 'us_bank_account' ? 'bank debit' : run.method}` : ''}
          </p>
        </div>
        <Pill tone={tone}>{run.status}</Pill>
        <div className="text-right">
          <p className="text-sm font-bold text-heading tabular-nums">{moneyExact(run.totalCents)}</p>
          <p className="text-[11px] text-faint">KYRO {moneyExact(run.feeCents)}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-semibold text-muted hover:text-heading px-2 py-1 rounded border border-line"
        >
          {open ? 'Hide' : 'Transfers'}
        </button>
      </div>

      {open && (
        <div className="mt-3 pl-3 border-l-2 border-line space-y-2">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-faint">Commission</span><p className="text-heading tabular-nums">{moneyExact(run.commissionCents)}</p></div>
            <div><span className="text-faint">KYRO fee</span><p className="text-heading tabular-nums">{moneyExact(run.feeCents)}</p></div>
            <div><span className="text-faint">Processing</span><p className="text-heading tabular-nums">{moneyExact(run.processingCents)}</p></div>
          </div>
          {run.payouts.length === 0 ? (
            <p className="text-xs text-faint">No transfers recorded on this run.</p>
          ) : (
            run.payouts.map((p) => (
              <div key={`${run.id}-${p.creatorId}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-body truncate">{p.creatorName}</span>
                <span className="flex items-center gap-2">
                  <span className="text-heading tabular-nums">{moneyExact(p.amountCents)}</span>
                  <Pill tone={p.status === 'paid' ? 'good' : p.status === 'failed' ? 'bad' : 'warn'}>{p.status}</Pill>
                </span>
              </div>
            ))
          )}
          {run.payouts.some((p) => p.failureReason) && (
            <p className="text-xs text-bad">
              {run.payouts.find((p) => p.failureReason)?.failureReason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Detail panes
   ───────────────────────────────────────────────────────────── */

function BrandDetail({ brand, data, onBack, onCreator }: {
  brand: AdminBrandRow; data: Overview; onBack: () => void; onCreator: (id: string) => void;
}) {
  const campaigns = data.campaigns.filter((c) => c.brandId === brand.id);
  const creators = data.creators.filter((c) => c.brandIds.includes(brand.id));
  const runs = data.runs.filter((r) => r.brandId === brand.id);

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-heading">
        <ArrowLeft size={16} /> All brands
      </button>

      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt="" className="w-14 h-14 rounded-xl object-cover border border-line" />
              : <div className="w-14 h-14 rounded-xl bg-surface-2 border border-line flex items-center justify-center"><Building2 size={20} className="text-faint" /></div>}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-heading truncate">{brand.name}</h1>
              <p className="text-sm text-muted">
                {brand.handle ? `@${brand.handle} · ` : ''}Joined {day(brand.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MailButton to={brand.ownerEmail} subject={`KYRO: ${brand.name}`} />
            <CallButton phone={brand.contactPhone} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          <Field label="Owner" value={brand.ownerName ?? brand.ownerEmail} />
          <Field label="Email" value={brand.ownerEmail} />
          <Field label="Phone" value={brand.contactPhone} />
          <Field label="Website" value={brand.websiteUrl
            ? <a href={brand.websiteUrl} target="_blank" rel="noreferrer" className="text-kyro-500 hover:underline">{brand.websiteUrl}</a>
            : null} />
          <Field label="Business type" value={brand.businessType} />
          <Field label="Billed through" value={brand.billingOrigin === 'shopify_app_store' ? 'Shopify usage billing' : 'Stripe'} />
          <Field label="Payment method" value={brand.paymentMethod} />
          <Field label="Shopify plan" value={brand.shopifyPlanStatus} />
          <Field label="Agreement" value={brand.agreementSignedAt ? `Signed ${day(brand.agreementSignedAt)}` : null} />
        </div>

        {brand.description && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">Description</p>
            <p className="text-sm text-body mt-1 max-w-prose">{brand.description}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Pill tone={brand.shopifyConnected ? 'good' : 'idle'}>Shopify {brand.shopifyConnected ? 'connected' : 'not connected'}</Pill>
          <Pill tone={brand.metaConnected ? 'good' : 'idle'}>Meta {brand.metaConnected ? 'connected' : 'not connected'}</Pill>
          <Pill tone={brand.billable ? 'good' : 'bad'}>{brand.billable ? 'Billable' : 'Cannot be charged'}</Pill>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={TrendingUp} label="Attributed sales" value={money(brand.attributedSalesCents)} sub={`${count(brand.orders)} orders`} />
        <Tile icon={Wallet} label="KYRO fee" value={money(brand.feeCents)} sub="earned from this brand" />
        <Tile icon={Users} label="Owed to creators" value={money(brand.owedCents)} sub={brand.owedCents > 0 ? 'cleared and unpaid' : 'nothing outstanding'} />
        <Tile icon={Layers} label="Campaigns" value={`${brand.campaigns}`} sub={`${brand.creators} creators`} />
      </div>

      <Panel title="Campaigns" note={`Everything ${brand.name} has run.`}>
        <CampaignsTable rows={campaigns} onBrand={() => {}} />
      </Panel>

      <Panel title="Creators" note={`Everyone who has submitted to ${brand.name}.`}>
        <CreatorsTable rows={creators} onOpen={onCreator} />
      </Panel>

      {runs.length > 0 && (
        <Panel title="Payment runs" note="What this brand has authorized.">
          <div className="divide-y divide-line">
            {runs.map((r) => <RunRow key={r.id} run={r} onBrand={() => {}} />)}
          </div>
        </Panel>
      )}
    </div>
  );
}

function CreatorDetail({ creator, data, onBack, onBrand }: {
  creator: AdminCreatorRow; data: Overview; onBack: () => void; onBrand: (id: string) => void;
}) {
  const campaigns = data.campaigns.filter((c) => creator.campaignIds.includes(c.id));
  const brands = data.brands.filter((b) => creator.brandIds.includes(b.id));
  const transfers = data.runs.flatMap((r) =>
    r.payouts.filter((p) => p.creatorId === creator.id).map((p) => ({ run: r, payout: p }))
  );

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-heading">
        <ArrowLeft size={16} /> All creators
      </button>

      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-heading truncate">{creator.name}</h1>
            <p className="text-sm text-muted">
              {creator.handle ? `@${creator.handle}` : 'No handle'}
              {creator.location ? ` · ${creator.location}` : ''} · Joined {day(creator.createdAt)}
            </p>
          </div>
          <MailButton to={creator.email} subject={`KYRO: ${creator.name}`} />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Email" value={creator.email} />
          <Field label="Payouts" value={creator.payoutsReady ? 'Enabled on Stripe' : 'Not enabled'} />
          <Field label="Tax details" value={creator.taxFormStatus === 'complete' ? 'Complete' : creator.taxFormStatus} />
          <Field label="Niche" value={creator.niche.length ? creator.niche.join(', ') : null} />
          <Field
            label="Social"
            value={creator.socials.length
              ? creator.socials.map((s) => `${s.network} @${s.handle}${s.followers ? ` (${count(s.followers)})` : ''}`).join(' · ')
              : null}
          />
          <Field label="Brands" value={brands.length ? brands.map((b) => b.name).join(', ') : null} />
        </div>

        {creator.bio && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">Bio</p>
            <p className="text-sm text-body mt-1 max-w-prose">{creator.bio}</p>
          </div>
        )}

        {creator.heldReason && (
          <div className="p-3 rounded-lg border border-warn/30 bg-warn-soft">
            <p className="text-xs text-warn">Payouts held: {creator.heldReason}.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={Wallet} label="Earned" value={moneyExact(creator.earnedCents)} sub="all time" />
        <Tile icon={CheckCircle2} label="Paid" value={moneyExact(creator.paidCents)} sub="reached their Stripe account" />
        <Tile icon={Video} label="Videos" value={`${creator.submissions}`} sub={`${creator.used} used by brands`} />
        <Tile icon={TrendingUp} label="Orders" value={`${creator.orders}`} sub="attributed to their content" />
      </div>

      <Panel title="Campaigns" note="Everything this creator has submitted to.">
        <CampaignsTable rows={campaigns} onBrand={onBrand} />
      </Panel>

      <Panel title="Transfers" note="Every payment KYRO has sent them.">
        {transfers.length === 0 ? (
          <EmptyRow>Nothing has been transferred to this creator yet.</EmptyRow>
        ) : (
          <div className="divide-y divide-line">
            {transfers.map(({ run, payout }) => (
              <div key={`${run.id}-${payout.creatorId}`} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-heading tabular-nums">{moneyExact(payout.amountCents)}</p>
                  <p className="text-xs text-muted">{run.brandName} · {day(payout.paidAt ?? run.authorizedAt)}</p>
                </div>
                <Pill tone={payout.status === 'paid' ? 'good' : payout.status === 'failed' ? 'bad' : 'warn'}>{payout.status}</Pill>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Shell
   ───────────────────────────────────────────────────────────── */

export function AdminPortal() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('overview');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadAdminOverview();
    setData(res.data);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openBrand = (id: string) => { setCreatorId(null); setBrandId(id); setPage('brands'); };
  const openCreator = (id: string) => { setBrandId(null); setCreatorId(id); setPage('creators'); };
  const go = (p: Page) => { setBrandId(null); setCreatorId(null); setPage(p); };

  const brand = useMemo(() => data?.brands.find((b) => b.id === brandId) ?? null, [data, brandId]);
  const creator = useMemo(() => data?.creators.find((c) => c.id === creatorId) ?? null, [data, creatorId]);

  if (loading && !data) return <div className="p-16 text-center text-sm text-muted">Loading…</div>;

  if (!data) {
    return (
      <div className="p-16 text-center">
        <AlertTriangle size={28} className="mx-auto text-bad mb-3" />
        <p className="text-sm text-muted">{error ?? 'Could not load the overview.'}</p>
      </div>
    );
  }

  const t = data.totals;
  const uncollected = t.feeCents - t.feeCollectedCents;

  const body = brand ? (
    <BrandDetail brand={brand} data={data} onBack={() => setBrandId(null)} onCreator={openCreator} />
  ) : creator ? (
    <CreatorDetail creator={creator} data={data} onBack={() => setCreatorId(null)} onBrand={openBrand} />
  ) : page === 'overview' ? (
    <div className="space-y-6">
      <RevenueChart months={data.months} totals={t} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={TrendingUp} label="Attributed sales" value={money(t.attributedSalesCents)} sub={`${count(t.orders)} orders`} />
        <Tile icon={Wallet} label="KYRO fee earned" value={money(t.feeCents)}
          sub={uncollected > 0 ? `${money(uncollected)} not collected` : 'All collected'}
          tone={uncollected > 0 ? 'warn' : 'good'} />
        <Tile icon={Users} label="Owed to creators" value={money(t.owedToCreatorsCents)} sub={`${money(t.paidToCreatorsCents)} paid to date`} />
        <Tile icon={Building2} label="Brands" value={`${t.brandsLive}`} sub={`of ${t.brands} signed up, with sales`} />
      </div>

      <Attention data={data} onBrand={openBrand} onCreator={openCreator} />
    </div>
  ) : page === 'brands' ? (
    <Panel title="Brands" note="Every brand on KYRO. Open one for its profile, campaigns and creators.">
      <BrandsTable rows={data.brands} onOpen={openBrand} />
    </Panel>
  ) : page === 'creators' ? (
    <Panel title="Creators" note="Everyone on the platform. Open one for their profile and transfers.">
      <CreatorsTable rows={data.creators} onOpen={openCreator} />
    </Panel>
  ) : page === 'campaigns' ? (
    <Panel title="Campaigns" note="Every campaign, its rate, and what it has driven.">
      <CampaignsTable rows={data.campaigns} onBrand={openBrand} />
    </Panel>
  ) : (
    <FinanceSection data={data} onBrand={openBrand} />
  );

  const navItem = (id: Page, label: string, Icon: typeof Users) => {
    const on = page === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => go(id)}
        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
          on ? 'bg-surface-2 text-heading' : 'text-muted hover:text-heading hover:bg-surface-2/60'
        }`}
      >
        {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-gradient-kyro" />}
        <Icon size={16} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Platform overview</h1>
          <p className="text-sm text-muted mt-0.5">Every brand, creator, campaign and dollar on KYRO. Live from the database.</p>
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

      {/* Stacked on a phone, one row per section. Sidebar from lg up, matching
          the brand portal so the two feel like the same product. */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 lg:hidden">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => go(n.id)}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
              page === n.id
                ? 'bg-gradient-kyro text-white border-transparent'
                : 'bg-surface-2 border-line text-muted hover:text-heading'
            }`}
          >
            <n.icon size={16} className="flex-shrink-0" />
            <span className="truncate">{n.label}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-8">
        <aside className="hidden lg:flex flex-col gap-1 w-48 flex-shrink-0">
          {NAV.map((n) => navItem(n.id, n.label, n.icon))}
        </aside>
        <div className="flex-1 min-w-0">{body}</div>
      </div>

      <p className="text-xs text-faint text-center">
        Loaded {new Date(data.loadedAt).toLocaleTimeString('en-US')}.
      </p>
    </div>
  );
}
