/**
 * The admin portal.
 *
 * Sectioned the way the brand and creator portals are, because one page
 * holding every brand, every creator, every campaign and every payment run
 * stops being an overview and becomes a scroll. Overview answers "how is the
 * platform doing"; the other four answer "tell me about this one thing".
 *
 * Every list is the same table: search it, narrow it with as many filters as
 * the question needs, sort any column, switch columns off, save the whole
 * arrangement as a view you come back to, select rows and act on them, and
 * take what is left to a spreadsheet. Those controls live in TableView and
 * DataTable; what each section contributes is a set of columns and a set of
 * things worth filtering by.
 *
 * Every row that names a brand, a creator or a campaign opens it. A list you
 * cannot drill into makes you go and find the record somewhere else, which in
 * practice means the database.
 *
 * All of it reads through supabase-js under the caller's own session.
 * `public.is_admin()` is in the row-level security on every table this
 * touches, so the server decides what an admin may see. Nothing here widens
 * anything, and an account that is not an admin gets empty arrays rather than
 * a hidden page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Building2, CheckCircle2, Clock, DollarSign,
  Layers, RefreshCw, TrendingUp, Users, Video, Wallet,
} from 'lucide-react';
import {
  loadAdminOverview,
  type AdminBrandRow, type AdminCampaignRow, type AdminCreatorRow,
  type AdminOverview as Overview, type AdminRunRow,
} from '../../lib/admin';
import { downloadCsv, toCsv } from '../../lib/csv';
import { RevenueChart } from './RevenueChart';
import { DataTable, SimpleTable } from './DataTable';
import { useCrmTable, type Column, type FilterField } from './TableView';
import { CallButton, EmptyRow, ExportButton, Field, MailButton, Panel, Pill, Tile } from './shared';
import { count, day, money, moneyExact, monthLabel, pct, stamp, usd } from './format';

type Page = 'overview' | 'brands' | 'creators' | 'campaigns' | 'finance';

const NAV: Array<{ id: Page; label: string; icon: typeof Users }> = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'brands', label: 'Brands', icon: Building2 },
  { id: 'creators', label: 'Creators', icon: Users },
  { id: 'campaigns', label: 'Campaigns', icon: Layers },
  { id: 'finance', label: 'Finance', icon: DollarSign },
];

/* ─────────────────────────────────────────────────────────────
   Small shared helpers
   ───────────────────────────────────────────────────────────── */

const distinct = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

const DAY_MS = 86_400_000;
const JOINED = ['Last 30 days', 'Last 90 days', 'Last 12 months'] as const;

const joinedWithin = (iso: string, label: string): boolean => {
  const days = label === 'Last 30 days' ? 30 : label === 'Last 90 days' ? 90 : 365;
  return Date.now() - new Date(iso).getTime() <= days * DAY_MS;
};

/** A static value list, for fields whose options are states rather than data. */
const fixed = (values: readonly string[]) => () => [...values];

/* ─────────────────────────────────────────────────────────────
   What each list can be narrowed by.

   Every option answers a question an admin actually has, phrased as the state
   it finds rather than as a column name: "Payouts held", not
   "payouts_ready = false". Values inside one field are OR'd and the fields
   themselves are AND'd, so "State: owes money" plus "Connections: Shopify
   missing" is one question, asked once.
   ───────────────────────────────────────────────────────────── */

const BRAND_STATES = [
  'Owes money', 'Cannot be charged', 'No agreement', 'No sales yet', 'Has sales',
] as const;

const BRAND_FIELDS: FilterField<AdminBrandRow>[] = [
  {
    id: 'state',
    label: 'State',
    values: fixed(BRAND_STATES),
    match: (b, v) =>
      v === 'Owes money' ? b.owedCents > 0
        : v === 'Cannot be charged' ? !b.billable
          : v === 'No agreement' ? !b.agreementSignedAt
            : v === 'No sales yet' ? b.attributedSalesCents === 0
              : b.attributedSalesCents > 0,
  },
  {
    id: 'billing',
    label: 'Billed through',
    values: fixed(['Stripe', 'Shopify']),
    match: (b, v) => (v === 'Shopify') === (b.billingOrigin === 'shopify_app_store'),
  },
  {
    id: 'connections',
    label: 'Connections',
    values: fixed(['Shopify connected', 'Shopify missing', 'Meta connected', 'Meta missing']),
    match: (b, v) =>
      v === 'Shopify connected' ? b.shopifyConnected
        : v === 'Shopify missing' ? !b.shopifyConnected
          : v === 'Meta connected' ? b.metaConnected
            : !b.metaConnected,
  },
  {
    id: 'businessType',
    label: 'Business type',
    values: (rows) => distinct(rows.map((b) => b.businessType)),
    match: (b, v) => b.businessType === v,
  },
  {
    id: 'joined',
    label: 'Joined',
    values: fixed(JOINED),
    match: (b, v) => joinedWithin(b.createdAt, v),
  },
];

const CREATOR_STATES = [
  'Payable', 'Payouts held', 'Stripe not set up', 'Tax incomplete', 'Earning', 'No videos yet',
] as const;

const CREATOR_FIELDS: FilterField<AdminCreatorRow>[] = [
  {
    id: 'state',
    label: 'State',
    values: fixed(CREATOR_STATES),
    match: (c, v) =>
      v === 'Payable' ? !c.heldReason
        : v === 'Payouts held' ? Boolean(c.heldReason)
          : v === 'Stripe not set up' ? !c.payoutsReady
            : v === 'Tax incomplete' ? !c.taxComplete
              : v === 'Earning' ? c.earnedCents > 0
                : c.submissions === 0,
  },
  {
    id: 'platform',
    label: 'Platform',
    values: (rows) => distinct(rows.flatMap((c) => c.socials.map((s) => s.network))),
    match: (c, v) => c.socials.some((s) => s.network === v),
  },
  {
    id: 'niche',
    label: 'Niche',
    values: (rows) => distinct(rows.flatMap((c) => c.niche)),
    match: (c, v) => c.niche.includes(v),
  },
  {
    id: 'location',
    label: 'Location',
    values: (rows) => distinct(rows.map((c) => c.location)),
    match: (c, v) => c.location === v,
  },
  {
    id: 'joined',
    label: 'Joined',
    values: fixed(JOINED),
    match: (c, v) => joinedWithin(c.createdAt, v),
  },
];

const CAMPAIGN_FIELDS: FilterField<AdminCampaignRow>[] = [
  {
    id: 'status',
    label: 'Status',
    values: (rows) => distinct(rows.map((c) => c.status)),
    match: (c, v) => c.status === v,
  },
  {
    id: 'brand',
    label: 'Brand',
    values: (rows) => distinct(rows.map((c) => c.brandName)),
    match: (c, v) => c.brandName === v,
  },
  {
    id: 'state',
    label: 'State',
    values: fixed(['Has sales', 'No sales yet', 'No videos yet']),
    match: (c, v) =>
      v === 'Has sales' ? c.attributedSalesCents > 0
        : v === 'No sales yet' ? c.attributedSalesCents === 0
          : c.submissions === 0,
  },
  {
    id: 'created',
    label: 'Created',
    values: fixed(JOINED),
    match: (c, v) => joinedWithin(c.createdAt, v),
  },
];

const RUN_FIELDS: FilterField<AdminRunRow>[] = [
  {
    id: 'status',
    label: 'Status',
    values: (rows) => distinct(rows.map((r) => r.status)),
    match: (r, v) => r.status === v,
  },
  {
    id: 'brand',
    label: 'Brand',
    values: (rows) => distinct(rows.map((r) => r.brandName)),
    match: (r, v) => r.brandName === v,
  },
  {
    id: 'method',
    label: 'Method',
    values: (rows) => distinct(rows.map((r) => r.method)),
    match: (r, v) => r.method === v,
  },
  {
    id: 'state',
    label: 'State',
    values: fixed(['In flight', 'Transfer problem']),
    match: (r, v) =>
      v === 'In flight'
        ? r.status === 'authorized' || r.status === 'processing'
        : r.payouts.some((p) => p.status === 'failed'),
  },
];

const PAYOUT_FIELDS: FilterField<AdminCreatorRow>[] = [
  {
    id: 'state',
    label: 'State',
    values: fixed(['Owed now', 'Still clearing', 'Payouts held', 'Payable', 'Nothing owed']),
    match: (c, v) =>
      v === 'Owed now' ? c.owedCents > 0
        : v === 'Still clearing' ? c.pendingCents > 0
          : v === 'Payouts held' ? Boolean(c.heldReason)
            : v === 'Payable' ? !c.heldReason
              : c.owedCents === 0 && c.pendingCents === 0,
  },
];

/* ─────────────────────────────────────────────────────────────
   Columns
   ───────────────────────────────────────────────────────────── */

const BRAND_COLUMNS: Column<AdminBrandRow>[] = [
  {
    id: 'name', label: 'Brand', sort: (b) => b.name,
    render: (b) => (
      <>
        <p className="font-semibold text-heading">{b.name}</p>
        <p className="text-xs text-faint">
          {b.agreementSignedAt ? `Agreed ${day(b.agreementSignedAt)}` : 'No agreement signed'}
        </p>
      </>
    ),
  },
  {
    id: 'owner', label: 'Owner', sort: (b) => b.ownerName ?? b.ownerEmail ?? '',
    render: (b) => <span className="text-body">{b.ownerName ?? b.ownerEmail ?? '—'}</span>,
  },
  {
    id: 'email', label: 'Email', off: true, sort: (b) => b.ownerEmail ?? '',
    render: (b) => <span className="text-body">{b.ownerEmail ?? '—'}</span>,
  },
  {
    id: 'phone', label: 'Phone', off: true, sort: (b) => b.contactPhone ?? '',
    render: (b) => <span className="text-body">{b.contactPhone ?? '—'}</span>,
  },
  {
    id: 'connections', label: 'Connections',
    csv: (b) => [b.shopifyConnected ? 'Shopify' : '', b.metaConnected ? 'Meta' : ''].filter(Boolean).join(' '),
    render: (b) => (
      <span className="space-x-1">
        <Pill tone={b.shopifyConnected ? 'good' : 'idle'}>Shopify</Pill>
        <Pill tone={b.metaConnected ? 'good' : 'idle'}>Meta</Pill>
      </span>
    ),
  },
  {
    id: 'billing', label: 'Billing',
    sort: (b) => (b.billingOrigin === 'shopify_app_store' ? 'Shopify' : b.paymentMethod ?? 'None'),
    render: (b) => (b.billingOrigin === 'shopify_app_store'
      ? <Pill tone={b.shopifyPlanStatus === 'ACTIVE' ? 'good' : 'warn'}>Shopify billing</Pill>
      : <Pill tone={b.paymentMethod ? 'good' : 'idle'}>{b.paymentMethod ?? 'No method'}</Pill>),
  },
  { id: 'campaigns', label: 'Campaigns', right: true, sort: (b) => b.campaigns, render: (b) => <span className="text-body">{b.campaigns}</span> },
  { id: 'creators', label: 'Creators', right: true, sort: (b) => b.creators, render: (b) => <span className="text-body">{b.creators}</span> },
  { id: 'orders', label: 'Orders', right: true, off: true, sort: (b) => b.orders, render: (b) => <span className="text-body">{count(b.orders)}</span> },
  {
    id: 'sales', label: 'Attributed', right: true,
    sort: (b) => b.attributedSalesCents, csv: (b) => usd(b.attributedSalesCents),
    render: (b) => <span className="text-heading font-semibold">{money(b.attributedSalesCents)}</span>,
  },
  {
    id: 'fee', label: 'KYRO fee', right: true,
    sort: (b) => b.feeCents, csv: (b) => usd(b.feeCents),
    render: (b) => <span className="text-body">{money(b.feeCents)}</span>,
  },
  {
    id: 'owed', label: 'Owed', right: true,
    sort: (b) => b.owedCents, csv: (b) => usd(b.owedCents),
    render: (b) => (b.owedCents > 0
      ? <span className={b.billable ? 'text-heading font-semibold' : 'text-bad font-semibold'}>{money(b.owedCents)}</span>
      : <span className="text-faint">—</span>),
  },
  {
    id: 'joined', label: 'Joined', off: true, right: true,
    sort: (b) => b.createdAt, csv: (b) => b.createdAt.slice(0, 10),
    render: (b) => <span className="text-body">{day(b.createdAt)}</span>,
  },
];

const CREATOR_COLUMNS: Column<AdminCreatorRow>[] = [
  {
    id: 'name', label: 'Creator', sort: (c) => c.name,
    render: (c) => (
      <>
        <p className="font-semibold text-heading">{c.name}</p>
        {c.handle && <p className="text-xs text-faint">@{c.handle}</p>}
      </>
    ),
  },
  {
    id: 'payout', label: 'Payout status', sort: (c) => c.heldReason ?? 'Payable',
    render: (c) => (c.heldReason ? <Pill tone="warn">{c.heldReason}</Pill> : <Pill tone="good">Payable</Pill>),
  },
  {
    id: 'email', label: 'Email', off: true, sort: (c) => c.email ?? '',
    render: (c) => <span className="text-body">{c.email ?? '—'}</span>,
  },
  {
    id: 'location', label: 'Location', off: true, sort: (c) => c.location ?? '',
    render: (c) => <span className="text-body">{c.location ?? '—'}</span>,
  },
  { id: 'campaigns', label: 'Campaigns', right: true, sort: (c) => c.campaigns, render: (c) => <span className="text-body">{c.campaigns}</span> },
  { id: 'videos', label: 'Videos', right: true, sort: (c) => c.submissions, render: (c) => <span className="text-body">{c.submissions}</span> },
  { id: 'used', label: 'Used', right: true, sort: (c) => c.used, render: (c) => <span className="text-body">{c.used}</span> },
  { id: 'orders', label: 'Orders', right: true, sort: (c) => c.orders, render: (c) => <span className="text-body">{c.orders}</span> },
  {
    id: 'earned', label: 'Earned', right: true,
    sort: (c) => c.earnedCents, csv: (c) => usd(c.earnedCents),
    render: (c) => <span className="text-heading font-semibold">{moneyExact(c.earnedCents)}</span>,
  },
  {
    id: 'owed', label: 'Owed now', right: true, off: true,
    sort: (c) => c.owedCents, csv: (c) => usd(c.owedCents),
    render: (c) => <span className="text-body">{moneyExact(c.owedCents)}</span>,
  },
  {
    id: 'paid', label: 'Paid', right: true,
    sort: (c) => c.paidCents, csv: (c) => usd(c.paidCents),
    render: (c) => <span className="text-body">{moneyExact(c.paidCents)}</span>,
  },
  {
    id: 'joined', label: 'Joined', off: true, right: true,
    sort: (c) => c.createdAt, csv: (c) => c.createdAt.slice(0, 10),
    render: (c) => <span className="text-body">{day(c.createdAt)}</span>,
  },
];

/** The payouts view asks a different question of the same rows: who is owed. */
const PAYOUT_COLUMNS: Column<AdminCreatorRow>[] = [
  CREATOR_COLUMNS[0],
  CREATOR_COLUMNS[1],
  {
    id: 'pending', label: 'Clearing', right: true,
    sort: (c) => c.pendingCents, csv: (c) => usd(c.pendingCents),
    render: (c) => <span className="text-body">{moneyExact(c.pendingCents)}</span>,
  },
  {
    id: 'owed', label: 'Owed now', right: true,
    sort: (c) => c.owedCents, csv: (c) => usd(c.owedCents),
    render: (c) => (c.owedCents > 0
      ? <span className="text-heading font-semibold">{moneyExact(c.owedCents)}</span>
      : <span className="text-faint">—</span>),
  },
  {
    id: 'paid', label: 'Paid to date', right: true,
    sort: (c) => c.paidCents, csv: (c) => usd(c.paidCents),
    render: (c) => <span className="text-body">{moneyExact(c.paidCents)}</span>,
  },
  {
    id: 'email', label: 'Email', off: true, sort: (c) => c.email ?? '',
    render: (c) => <span className="text-body">{c.email ?? '—'}</span>,
  },
];

const campaignColumns = (onBrand?: (id: string) => void): Column<AdminCampaignRow>[] => [
  {
    id: 'name', label: 'Campaign', sort: (c) => c.name,
    render: (c) => (
      <>
        <p className="font-semibold text-heading">{c.name}</p>
        {onBrand ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBrand(c.brandId); }}
            className="text-xs text-faint hover:text-heading hover:underline"
          >
            {c.brandName}
          </button>
        ) : <p className="text-xs text-faint">{c.brandName}</p>}
      </>
    ),
  },
  {
    id: 'brand', label: 'Brand', off: true, sort: (c) => c.brandName,
    render: (c) => <span className="text-body">{c.brandName}</span>,
  },
  {
    id: 'status', label: 'Status', sort: (c) => c.status,
    render: (c) => (
      <Pill tone={c.status === 'live' ? 'good' : c.status === 'draft' ? 'idle' : 'warn'}>
        {c.status === 'pending_fund' ? 'legacy' : c.status}
      </Pill>
    ),
  },
  {
    id: 'rate', label: 'Rate', right: true,
    sort: (c) => c.commissionBps ?? 0, csv: (c) => pct(c.commissionBps),
    render: (c) => <span className="text-body">{pct(c.commissionBps)}</span>,
  },
  { id: 'creators', label: 'Creators', right: true, sort: (c) => c.creators, render: (c) => <span className="text-body">{c.creators}</span> },
  { id: 'videos', label: 'Videos', right: true, sort: (c) => c.submissions, render: (c) => <span className="text-body">{c.submissions}</span> },
  { id: 'orders', label: 'Orders', right: true, sort: (c) => c.orders, render: (c) => <span className="text-body">{c.orders}</span> },
  {
    id: 'sales', label: 'Attributed', right: true,
    sort: (c) => c.attributedSalesCents, csv: (c) => usd(c.attributedSalesCents),
    render: (c) => <span className="text-heading font-semibold">{money(c.attributedSalesCents)}</span>,
  },
  {
    id: 'fee', label: 'KYRO fee', right: true,
    sort: (c) => c.feeCents, csv: (c) => usd(c.feeCents),
    render: (c) => <span className="text-body">{money(c.feeCents)}</span>,
  },
  {
    id: 'created', label: 'Created', off: true, right: true,
    sort: (c) => c.createdAt, csv: (c) => c.createdAt.slice(0, 10),
    render: (c) => <span className="text-body">{day(c.createdAt)}</span>,
  },
];

const RUN_COLUMNS: Column<AdminRunRow>[] = [
  {
    id: 'brand', label: 'Brand', sort: (r) => r.brandName,
    render: (r) => (
      <>
        <p className="font-semibold text-heading">{r.brandName}</p>
        <p className="text-xs text-faint">{day(r.authorizedAt)}</p>
      </>
    ),
  },
  {
    id: 'status', label: 'Status', sort: (r) => r.status,
    render: (r) => (
      <Pill tone={r.status === 'settled' ? 'good' : r.status === 'failed' || r.status === 'cancelled' ? 'bad' : 'warn'}>
        {r.status}
      </Pill>
    ),
  },
  {
    id: 'method', label: 'Method', sort: (r) => r.method ?? '',
    render: (r) => (
      <span className="text-body">
        {r.method ? (r.method === 'us_bank_account' ? 'bank debit' : r.method) : '—'}
      </span>
    ),
  },
  { id: 'orders', label: 'Orders', right: true, sort: (r) => r.orders, render: (r) => <span className="text-body">{r.orders}</span> },
  { id: 'creators', label: 'Creators', right: true, sort: (r) => r.creators, render: (r) => <span className="text-body">{r.creators}</span> },
  {
    id: 'commission', label: 'Commission', right: true,
    sort: (r) => r.commissionCents, csv: (r) => usd(r.commissionCents),
    render: (r) => <span className="text-body">{moneyExact(r.commissionCents)}</span>,
  },
  {
    id: 'fee', label: 'KYRO fee', right: true,
    sort: (r) => r.feeCents, csv: (r) => usd(r.feeCents),
    render: (r) => <span className="text-heading font-semibold">{moneyExact(r.feeCents)}</span>,
  },
  {
    id: 'processing', label: 'Processing', right: true, off: true,
    sort: (r) => r.processingCents, csv: (r) => usd(r.processingCents),
    render: (r) => <span className="text-body">{moneyExact(r.processingCents)}</span>,
  },
  {
    id: 'total', label: 'Charged', right: true,
    sort: (r) => r.totalCents, csv: (r) => usd(r.totalCents),
    render: (r) => <span className="text-heading font-semibold">{moneyExact(r.totalCents)}</span>,
  },
  {
    id: 'settled', label: 'Settled', right: true, off: true,
    sort: (r) => r.settledAt ?? '', csv: (r) => r.settledAt?.slice(0, 10) ?? '',
    render: (r) => <span className="text-body">{r.settledAt ? day(r.settledAt) : '—'}</span>,
  },
];

/* ─────────────────────────────────────────────────────────────
   The ledger

   Every movement of money, from the rows already loaded. Payment runs answer
   what a brand was charged; this answers where a given dollar went, which is
   the question a creator asking about a missing transfer actually has.

   Deliberately not a balance. KYRO charges a brand per run and transfers
   straight through to the creator, so there is no float to keep a running
   total of, and inventing one would be describing a product that does not
   exist.
   ───────────────────────────────────────────────────────────── */

interface LedgerRow {
  id: string;
  at: string;
  type: string;
  status: string;
  who: string;
  brandId: string;
  creatorId: string | null;
  direction: 'In' | 'Out';
  amountCents: number;
  detail: string;
}

function buildLedger(runs: AdminRunRow[]): LedgerRow[] {
  const rows: LedgerRow[] = [];

  for (const r of runs) {
    rows.push({
      id: `${r.id}-authorized`,
      at: r.authorizedAt,
      type: 'Brand charged',
      status: r.status,
      who: r.brandName,
      brandId: r.brandId,
      creatorId: null,
      direction: 'In',
      amountCents: r.totalCents,
      detail: `${r.orders} orders, KYRO fee ${moneyExact(r.feeCents)}`,
    });

    if (r.settledAt) {
      rows.push({
        id: `${r.id}-settled`,
        at: r.settledAt,
        type: 'Charge settled',
        status: 'settled',
        who: r.brandName,
        brandId: r.brandId,
        creatorId: null,
        direction: 'In',
        amountCents: r.feeCents,
        detail: 'KYRO fee collected',
      });
    }

    for (const p of r.payouts) {
      rows.push({
        id: `${r.id}-${p.creatorId}`,
        at: p.paidAt ?? r.authorizedAt,
        type: 'Creator transfer',
        status: p.status,
        who: p.creatorName,
        brandId: r.brandId,
        creatorId: p.creatorId,
        direction: 'Out',
        amountCents: p.amountCents,
        detail: p.failureReason ?? r.brandName,
      });
    }
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

const LEDGER_COLUMNS: Column<LedgerRow>[] = [
  {
    id: 'at', label: 'When', sort: (l) => l.at, csv: (l) => l.at,
    render: (l) => <span className="text-body">{day(l.at)}</span>,
  },
  { id: 'type', label: 'Type', sort: (l) => l.type, render: (l) => <span className="text-heading font-semibold">{l.type}</span> },
  {
    id: 'status', label: 'Status', sort: (l) => l.status,
    render: (l) => (
      <Pill tone={l.status === 'settled' || l.status === 'paid' ? 'good' : l.status === 'failed' || l.status === 'cancelled' ? 'bad' : 'warn'}>
        {l.status}
      </Pill>
    ),
  },
  { id: 'who', label: 'Who', sort: (l) => l.who, render: (l) => <span className="text-body">{l.who}</span> },
  {
    id: 'direction', label: 'Direction', off: true, sort: (l) => l.direction,
    render: (l) => <span className="text-body">{l.direction === 'In' ? 'Money in' : 'Money out'}</span>,
  },
  {
    id: 'amount', label: 'Amount', right: true,
    sort: (l) => l.amountCents, csv: (l) => usd(l.amountCents),
    render: (l) => (
      <span className={l.direction === 'In' ? 'text-heading font-semibold' : 'text-body'}>
        {l.direction === 'In' ? '' : '−'}{moneyExact(l.amountCents)}
      </span>
    ),
  },
  { id: 'detail', label: 'Detail', sort: (l) => l.detail, render: (l) => <span className="text-xs text-faint">{l.detail}</span> },
];

const LEDGER_FIELDS: FilterField<LedgerRow>[] = [
  {
    id: 'type', label: 'Type',
    values: (rows) => distinct(rows.map((l) => l.type)),
    match: (l, v) => l.type === v,
  },
  {
    id: 'status', label: 'Status',
    values: (rows) => distinct(rows.map((l) => l.status)),
    match: (l, v) => l.status === v,
  },
  {
    id: 'direction', label: 'Direction',
    values: fixed(['Money in', 'Money out']),
    match: (l, v) => (v === 'Money in') === (l.direction === 'In'),
  },
];

/* ─────────────────────────────────────────────────────────────
   Searchable text
   ───────────────────────────────────────────────────────────── */

const brandText = (b: AdminBrandRow) =>
  `${b.name} ${b.handle ?? ''} ${b.ownerName ?? ''} ${b.ownerEmail ?? ''} ${b.websiteUrl ?? ''} ${b.businessType ?? ''}`;
const creatorText = (c: AdminCreatorRow) =>
  `${c.name} ${c.handle ?? ''} ${c.email ?? ''} ${c.location ?? ''} ${c.niche.join(' ')} ${c.socials.map((s) => s.handle).join(' ')}`;
const campaignText = (c: AdminCampaignRow) => `${c.name} ${c.brandName} ${c.status}`;
const runText = (r: AdminRunRow) =>
  `${r.brandName} ${r.status} ${r.method ?? ''} ${r.payouts.map((p) => p.creatorName).join(' ')}`;
const ledgerText = (l: LedgerRow) => `${l.who} ${l.type} ${l.status} ${l.detail}`;

/* ─────────────────────────────────────────────────────────────
   Pieces
   ───────────────────────────────────────────────────────────── */

/**
 * One campaign's months. Same shape as the platform chart, smaller, and
 * always attributed sales: at campaign scale the 1% fee is a rounding error
 * and plotting it would waste the panel.
 */
function MiniMonths({ months }: { months: AdminCampaignRow['months'] }) {
  if (months.length === 0) {
    return <EmptyRow>No attributed sales on this campaign yet.</EmptyRow>;
  }
  const max = Math.max(...months.map((m) => m.attributedSalesCents), 1);
  return (
    <div className="p-5">
      <div className="flex items-end justify-between gap-1 h-32">
        {months.map((m) => (
          <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group relative">
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-heading opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tabular-nums">
              {moneyExact(m.attributedSalesCents)}
            </span>
            <div
              className="w-full max-w-[20px] bg-gradient-kyro rounded-t-sm group-hover:opacity-80 transition-opacity"
              style={{ height: `${Math.max((m.attributedSalesCents / max) * 100, 2)}%` }}
              title={`${monthLabel(m.month)}: ${moneyExact(m.attributedSalesCents)} across ${m.orders} orders`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-faint">{monthLabel(months[0].month)}</span>
        <span className="text-[11px] text-faint">{monthLabel(months[months.length - 1].month)}</span>
      </div>
    </div>
  );
}

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

/* ─────────────────────────────────────────────────────────────
   List sections

   Each is its own component because each owns a hook, and a hook cannot live
   inside the branch that chooses which section to render.
   ───────────────────────────────────────────────────────────── */

function BrandsSection({ rows, onOpen }: { rows: AdminBrandRow[]; onOpen: (id: string) => void }) {
  const view = useCrmTable({
    id: 'brands', rows, rowId: (b) => b.id, search: brandText,
    fields: BRAND_FIELDS, columns: BRAND_COLUMNS,
    email: (b) => b.ownerEmail, filename: 'kyro-brands',
  });

  return (
    <Panel
      title="Brands"
      note="Every brand on KYRO. Open one for its profile, campaigns and creators."
      right={<ExportButton onClick={view.exportCsv} disabled={view.matched === 0} />}
    >
      <div className="p-4 border-b border-line">{view.controls}</div>
      {view.bulkBar}
      <DataTable
        view={view}
        onOpen={onOpen}
        empty={rows.length === 0 ? 'No brands yet.' : 'No brand matches that.'}
      />
      {view.pager}
    </Panel>
  );
}

function CreatorsSection({ rows, onOpen }: { rows: AdminCreatorRow[]; onOpen: (id: string) => void }) {
  const view = useCrmTable({
    id: 'creators', rows, rowId: (c) => c.id, search: creatorText,
    fields: CREATOR_FIELDS, columns: CREATOR_COLUMNS,
    email: (c) => c.email, filename: 'kyro-creators',
  });

  return (
    <Panel
      title="Creators"
      note="Everyone on the platform. Open one for their profile and transfers."
      right={<ExportButton onClick={view.exportCsv} disabled={view.matched === 0} />}
    >
      <div className="p-4 border-b border-line">{view.controls}</div>
      {view.bulkBar}
      <DataTable
        view={view}
        onOpen={onOpen}
        empty={rows.length === 0 ? 'No creators yet.' : 'No creator matches that.'}
      />
      {view.pager}
    </Panel>
  );
}

function CampaignsSection({ rows, onBrand, onOpen }: {
  rows: AdminCampaignRow[]; onBrand: (id: string) => void; onOpen: (id: string) => void;
}) {
  const columns = useMemo(() => campaignColumns(onBrand), [onBrand]);
  const view = useCrmTable({
    id: 'campaigns', rows, rowId: (c) => c.id, search: campaignText,
    fields: CAMPAIGN_FIELDS, columns, filename: 'kyro-campaigns',
  });

  return (
    <Panel
      title="Campaigns"
      note="Every campaign, its rate, and what it has driven. Open one for its month by month performance."
      right={<ExportButton onClick={view.exportCsv} disabled={view.matched === 0} />}
    >
      <div className="p-4 border-b border-line">{view.controls}</div>
      {view.bulkBar}
      <DataTable
        view={view}
        onOpen={onOpen}
        empty={rows.length === 0 ? 'No campaigns yet.' : 'No campaign matches that.'}
      />
      {view.pager}
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────
   Finance

   Three questions, three pages. Who is owed, what brands were charged, and
   where every dollar went. The distinction that matters across all three is
   earned against collected: a fee on an order that cleared is earned, and it
   is collected only once the brand's run has settled.
   ───────────────────────────────────────────────────────────── */

type FinancePage = 'payouts' | 'runs' | 'activity';

const FINANCE_TABS: Array<{ id: FinancePage; label: string }> = [
  { id: 'payouts', label: 'Payouts' },
  { id: 'runs', label: 'Payment runs' },
  { id: 'activity', label: 'Activity' },
];

function FinanceSection({ data, onBrand, onCreator }: {
  data: Overview; onBrand: (id: string) => void; onCreator: (id: string) => void;
}) {
  const [tab, setTab] = useState<FinancePage>('payouts');
  const t = data.totals;
  const settled = data.runs.filter((r) => r.status === 'settled');
  const inFlight = data.runs.filter((r) => r.status === 'authorized' || r.status === 'processing');
  const collectedProcessing = settled.reduce((s, r) => s + r.processingCents, 0);
  const uncollected = t.feeCents - t.feeCollectedCents;

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

      <div className="flex flex-wrap items-center gap-1 p-1 bg-surface-2 border border-line rounded-xl w-fit">
        {FINANCE_TABS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTab(f.id)}
            className={`text-xs font-semibold px-3 py-2 rounded-lg transition ${
              tab === f.id ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tab === 'payouts' ? <PayoutsTab rows={data.creators} onOpen={onCreator} />
        : tab === 'runs' ? <RunsTab rows={data.runs} onBrand={onBrand} />
          : <ActivityTab runs={data.runs} onBrand={onBrand} onCreator={onCreator} />}

      {inFlight.length > 0 && (
        <p className="text-xs text-faint text-center">
          {inFlight.length} run{inFlight.length === 1 ? '' : 's'} in flight. A bank debit takes a few days to settle.
        </p>
      )}
    </div>
  );
}

function PayoutsTab({ rows, onOpen }: { rows: AdminCreatorRow[]; onOpen: (id: string) => void }) {
  const view = useCrmTable({
    id: 'payouts', rows, rowId: (c) => c.id, search: creatorText,
    fields: PAYOUT_FIELDS, columns: PAYOUT_COLUMNS,
    email: (c) => c.email, filename: 'kyro-payouts',
  });

  return (
    <Panel
      title="Payouts"
      note="What each creator is owed, what is still clearing, and what has reached them."
      right={<ExportButton onClick={view.exportCsv} disabled={view.matched === 0} />}
    >
      <div className="p-4 border-b border-line">{view.controls}</div>
      {view.bulkBar}
      <DataTable
        view={view}
        onOpen={onOpen}
        empty={rows.length === 0 ? 'No creators yet.' : 'No creator matches that.'}
      />
      {view.pager}
    </Panel>
  );
}

function RunsTab({ rows, onBrand }: { rows: AdminRunRow[]; onBrand: (id: string) => void }) {
  const view = useCrmTable({
    id: 'runs', rows, rowId: (r) => r.id, search: runText,
    fields: RUN_FIELDS, columns: RUN_COLUMNS, filename: 'kyro-payment-runs',
  });

  const openBrand = useCallback((runId: string) => {
    const run = rows.find((r) => r.id === runId);
    if (run) onBrand(run.brandId);
  }, [rows, onBrand]);

  return (
    <Panel
      title="Payment runs"
      note="Every run a brand authorized and what it was charged. Open one for the brand behind it."
      right={<ExportButton onClick={view.exportCsv} disabled={view.matched === 0} />}
    >
      <div className="p-4 border-b border-line">{view.controls}</div>
      {view.bulkBar}
      <DataTable
        view={view}
        onOpen={openBrand}
        empty={rows.length === 0 ? 'No payment runs yet. A run appears when a brand authorizes one.' : 'No run matches that.'}
      />
      {view.pager}
    </Panel>
  );
}

function ActivityTab({ runs, onBrand, onCreator }: {
  runs: AdminRunRow[]; onBrand: (id: string) => void; onCreator: (id: string) => void;
}) {
  const rows = useMemo(() => buildLedger(runs), [runs]);
  const view = useCrmTable({
    id: 'activity', rows, rowId: (l) => l.id, search: ledgerText,
    fields: LEDGER_FIELDS, columns: LEDGER_COLUMNS, filename: 'kyro-activity',
  });

  const open = useCallback((id: string) => {
    const row = rows.find((l) => l.id === id);
    if (!row) return;
    if (row.creatorId) onCreator(row.creatorId);
    else onBrand(row.brandId);
  }, [rows, onBrand, onCreator]);

  return (
    <Panel
      title="Activity"
      note="Every movement of money, newest first. Charges in, transfers out."
      right={<ExportButton onClick={view.exportCsv} disabled={view.matched === 0} />}
    >
      <div className="p-4 border-b border-line">{view.controls}</div>
      {view.bulkBar}
      <DataTable
        view={view}
        onOpen={open}
        empty={rows.length === 0 ? 'Nothing has moved yet.' : 'Nothing matches that.'}
      />
      {view.pager}
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────────────
   Detail panes
   ───────────────────────────────────────────────────────────── */

function BrandDetail({ brand, data, onBack, onCreator, onCampaign }: {
  brand: AdminBrandRow; data: Overview; onBack: () => void;
  onCreator: (id: string) => void; onCampaign: (id: string) => void;
}) {
  const campaigns = data.campaigns.filter((c) => c.brandId === brand.id);
  const creators = data.creators.filter((c) => c.brandIds.includes(brand.id));
  const runs = data.runs.filter((r) => r.brandId === brand.id);
  const columns = useMemo(() => campaignColumns(), []);

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

      <Panel title="Campaigns" note={`Everything ${brand.name} has run. Open one for its performance.`}>
        <SimpleTable
          rows={campaigns} columns={columns} rowId={(c) => c.id} onOpen={onCampaign}
          empty="This brand has not created a campaign yet."
        />
      </Panel>

      <Panel title="Creators" note={`Everyone who has submitted to ${brand.name}.`}>
        <SimpleTable
          rows={creators} columns={CREATOR_COLUMNS} rowId={(c) => c.id} onOpen={onCreator}
          empty="Nobody has submitted to this brand yet."
        />
      </Panel>

      <Panel title="Payment runs" note="What this brand has authorized.">
        <SimpleTable
          rows={runs} columns={RUN_COLUMNS} rowId={(r) => r.id}
          empty="This brand has not authorized a payment run yet."
        />
      </Panel>
    </div>
  );
}

function CreatorDetail({ creator, data, onBack, onBrand, onCampaign }: {
  creator: AdminCreatorRow; data: Overview; onBack: () => void;
  onBrand: (id: string) => void; onCampaign: (id: string) => void;
}) {
  const campaigns = data.campaigns.filter((c) => creator.campaignIds.includes(c.id));
  const brands = data.brands.filter((b) => creator.brandIds.includes(b.id));
  const columns = useMemo(() => campaignColumns(onBrand), [onBrand]);
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
        <Tile icon={Clock} label="Owed now" value={moneyExact(creator.owedCents)}
          sub={creator.pendingCents > 0 ? `${moneyExact(creator.pendingCents)} still clearing` : 'nothing clearing'} />
        <Tile icon={CheckCircle2} label="Paid" value={moneyExact(creator.paidCents)} sub="reached their Stripe account" />
        <Tile icon={Video} label="Videos" value={`${creator.submissions}`} sub={`${creator.used} used by brands`} />
      </div>

      <Panel title="Campaigns" note="Everything this creator has submitted to.">
        <SimpleTable
          rows={campaigns} columns={columns} rowId={(c) => c.id} onOpen={onCampaign}
          empty="This creator has not submitted to a campaign yet."
        />
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

/**
 * One campaign.
 *
 * The list answers how campaigns compare. This answers whether a single one
 * is going anywhere, which is a question about direction and therefore needs
 * months rather than a total: two campaigns at $4,000 attributed are not the
 * same campaign if one did it all in March and the other is still climbing.
 */
function CampaignDetail({ campaign, data, onBack, onBrand, onCreator }: {
  campaign: AdminCampaignRow;
  data: Overview;
  onBack: () => void;
  onBrand: (id: string) => void;
  onCreator: (id: string) => void;
}) {
  const creators = data.creators.filter((c) => c.campaignIds.includes(campaign.id));
  const aov = campaign.orders > 0 ? campaign.attributedSalesCents / campaign.orders : 0;
  const perVideo = campaign.submissions > 0 ? campaign.attributedSalesCents / campaign.submissions : 0;

  const exportMonths = () => {
    const header = ['Month', 'Attributed sales (USD)', 'Creator commission (USD)', 'KYRO fee (USD)', 'Orders'];
    const rows = campaign.months.map((m) => [
      m.month, usd(m.attributedSalesCents), usd(m.commissionCents), usd(m.feeCents), m.orders,
    ]);
    const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
    downloadCsv(`kyro-campaign-${slug}-${stamp()}.csv`, toCsv(header, rows));
  };

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-muted hover:text-heading">
        <ArrowLeft size={16} /> All campaigns
      </button>

      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-heading">{campaign.name}</h1>
            <p className="text-sm text-muted">
              <button type="button" onClick={() => onBrand(campaign.brandId)} className="text-kyro-500 hover:underline">
                {campaign.brandName}
              </button>
              {' · '}Created {day(campaign.createdAt)}
            </p>
          </div>
          <Pill tone={campaign.status === 'live' ? 'good' : campaign.status === 'draft' ? 'idle' : 'warn'}>
            {campaign.status === 'pending_fund' ? 'legacy' : campaign.status}
          </Pill>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Creator rate" value={pct(campaign.commissionBps)} />
          <Field label="KYRO rate" value={pct(campaign.feeBps)} />
          <Field label="Average order" value={campaign.orders > 0 ? moneyExact(aov) : null} />
          <Field label="Sales per video" value={campaign.submissions > 0 ? moneyExact(perVideo) : null} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={TrendingUp} label="Attributed sales" value={money(campaign.attributedSalesCents)} sub={`${count(campaign.orders)} orders`} />
        <Tile icon={Users} label="Creator commission" value={money(campaign.commissionCents)} sub="earned on this campaign" />
        <Tile icon={Wallet} label="KYRO fee" value={money(campaign.feeCents)} sub="earned on this campaign" />
        <Tile icon={Video} label="Videos" value={`${campaign.submissions}`} sub={`${campaign.creators} creators`} />
      </div>

      <Panel
        title="Performance by month"
        note="Attributed sales, by the month the order cleared. Reversed orders never counted."
        right={<ExportButton onClick={exportMonths} disabled={campaign.months.length === 0} />}
      >
        <MiniMonths months={campaign.months} />
      </Panel>

      <Panel title="Creators" note="Everyone who has submitted to this campaign.">
        <SimpleTable
          rows={creators} columns={CREATOR_COLUMNS} rowId={(c) => c.id} onOpen={onCreator}
          empty="No creator has submitted to this campaign yet."
        />
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
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadAdminOverview();
    setData(res.data);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Opening a record moves to that record's section and closes the other two,
     so Back always returns to the list the heading names. A stack of half
     open panes is how you end up not knowing where Back goes. */
  const openBrand = useCallback((id: string) => { setCreatorId(null); setCampaignId(null); setBrandId(id); setPage('brands'); }, []);
  const openCreator = useCallback((id: string) => { setBrandId(null); setCampaignId(null); setCreatorId(id); setPage('creators'); }, []);
  const openCampaign = useCallback((id: string) => { setBrandId(null); setCreatorId(null); setCampaignId(id); setPage('campaigns'); }, []);
  const go = (p: Page) => { setBrandId(null); setCreatorId(null); setCampaignId(null); setPage(p); };

  const brand = useMemo(() => data?.brands.find((b) => b.id === brandId) ?? null, [data, brandId]);
  const creator = useMemo(() => data?.creators.find((c) => c.id === creatorId) ?? null, [data, creatorId]);
  const campaign = useMemo(() => data?.campaigns.find((c) => c.id === campaignId) ?? null, [data, campaignId]);

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
    <BrandDetail
      brand={brand} data={data} onBack={() => setBrandId(null)}
      onCreator={openCreator} onCampaign={openCampaign}
    />
  ) : creator ? (
    <CreatorDetail
      creator={creator} data={data} onBack={() => setCreatorId(null)}
      onBrand={openBrand} onCampaign={openCampaign}
    />
  ) : campaign ? (
    <CampaignDetail
      campaign={campaign} data={data} onBack={() => setCampaignId(null)}
      onBrand={openBrand} onCreator={openCreator}
    />
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
    <BrandsSection rows={data.brands} onOpen={openBrand} />
  ) : page === 'creators' ? (
    <CreatorsSection rows={data.creators} onOpen={openCreator} />
  ) : page === 'campaigns' ? (
    <CampaignsSection rows={data.campaigns} onBrand={openBrand} onOpen={openCampaign} />
  ) : (
    <FinanceSection data={data} onBrand={openBrand} onCreator={openCreator} />
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
