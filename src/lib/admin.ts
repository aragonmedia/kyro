/**
 * What KYRO itself can see.
 *
 * The admin portal used to be seeded fiction, and worse, fiction about a
 * product that no longer exists: Square credits, Trolley debits, funded
 * campaign pools with "top up soon" warnings. None of that has been true
 * since the deposit model was dropped. This module replaces all of it with
 * what the database actually holds.
 *
 * Reads go straight through supabase-js rather than through RPCs, because
 * `public.is_admin()` is already in the row-level security policy on every
 * table this touches: brands, campaigns, creators, submissions, earnings,
 * orders, payment runs, payouts, connections, billing and agreements. An
 * admin session therefore sees across brands without any new grant, and
 * adding security-definer functions would widen the attack surface to buy
 * nothing.
 *
 * Aggregation happens here, in the browser, which is the right trade at this
 * size: tens of brands, hundreds of earnings. It will stop being the right
 * trade somewhere in the low tens of thousands of earnings rows, and the fix
 * then is to move these sums into SQL views. Until that day this is one round
 * trip per table and no server code to keep in sync.
 */

import { getSupabase } from './supabase';

export interface Result<T> {
  data: T;
  error: string | null;
}

const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(data: T, error: string): Result<T> => ({ data, error });

/** Earnings in this state never counted and never will. */
const REVERSED = 'reversed';

export interface AdminTotals {
  brands: number;
  brandsLive: number;
  creators: number;
  creatorsPayable: number;
  campaigns: number;
  campaignsOpen: number;
  orders: number;
  /** Sales KYRO attributed to creator content. The base KYRO's fee is charged on. */
  attributedSalesCents: number;
  /** What creators have earned, whether or not it has been paid. */
  commissionCents: number;
  /** KYRO's 1%, earned. Not the same as collected. */
  feeCents: number;
  /** KYRO's 1% actually collected through a settled payment run. */
  feeCollectedCents: number;
  /** Commission that has cleared and the brand has not yet paid. */
  owedToCreatorsCents: number;
  /** Commission that has reached a creator's Stripe account. */
  paidToCreatorsCents: number;
}

export interface AdminBrandRow {
  id: string;
  name: string;
  handle: string | null;
  logoUrl: string | null;
  /** 'direct' bills through Stripe; 'shopify_app_store' bills through Shopify. */
  billingOrigin: string;
  /** Null unless Shopify has reported a subscription for this store. */
  shopifyPlanStatus: string | null;
  shopifyConnected: boolean;
  metaConnected: boolean;
  /** What the brand pays with, e.g. "Visa ····4242". Null when nothing is on file. */
  paymentMethod: string | null;
  agreementSignedAt: string | null;
  /** The owner's registered address, for reaching them. Null if unclaimed. */
  ownerEmail: string | null;
  ownerName: string | null;
  /** Operational only. Never a marketing channel; see migration 0033. */
  contactPhone: string | null;
  websiteUrl: string | null;
  description: string | null;
  businessType: string | null;
  campaigns: number;
  creators: number;
  orders: number;
  attributedSalesCents: number;
  commissionCents: number;
  feeCents: number;
  owedCents: number;
  createdAt: string;
  /** True when this brand can actually be billed for what it owes. */
  billable: boolean;
}

export interface AdminCreatorRow {
  id: string;
  name: string;
  handle: string | null;
  /** Registered address, for reaching them about a held payout. */
  email: string | null;
  bio: string | null;
  location: string | null;
  niche: string[];
  socials: Array<{ network: string; handle: string; followers: number | null }>;
  taxFormStatus: string;
  /** Brands this creator has submitted to, so a brand page can list its own. */
  brandIds: string[];
  /** Campaign ids, for the same reason. */
  campaignIds: string[];
  campaigns: number;
  submissions: number;
  used: number;
  orders: number;
  earnedCents: number;
  paidCents: number;
  /** Stripe says transfers can land. Without this a payout is held. */
  payoutsReady: boolean;
  taxComplete: boolean;
  /** Why a payout to this creator would be held right now, or null. */
  heldReason: string | null;
  createdAt: string;
}

export interface AdminCampaignRow {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  status: string;
  /** Basis points the creator earns, e.g. 1500 for 15%. */
  commissionBps: number | null;
  feeBps: number;
  creators: number;
  submissions: number;
  orders: number;
  attributedSalesCents: number;
  commissionCents: number;
  feeCents: number;
  createdAt: string;
}

/** One authorized payment run, with the transfers it produced. */
export interface AdminRunRow {
  id: string;
  brandId: string;
  brandName: string;
  status: string;
  /** What the creators were owed. */
  commissionCents: number;
  /** KYRO's share of this run. */
  feeCents: number;
  /** What the brand was actually charged, processing included. */
  totalCents: number;
  /** total minus commission and fee: what the processor took. */
  processingCents: number;
  orders: number;
  creators: number;
  method: string | null;
  authorizedAt: string;
  settledAt: string | null;
  payouts: Array<{
    creatorId: string;
    creatorName: string;
    amountCents: number;
    status: string;
    paidAt: string | null;
    failureReason: string | null;
  }>;
}

export interface AdminMonth {
  /** YYYY-MM, in UTC. */
  month: string;
  attributedSalesCents: number;
  commissionCents: number;
  feeCents: number;
  orders: number;
}

export interface AdminOverview {
  totals: AdminTotals;
  brands: AdminBrandRow[];
  creators: AdminCreatorRow[];
  campaigns: AdminCampaignRow[];
  runs: AdminRunRow[];
  months: AdminMonth[];
  loadedAt: string;
}

const EMPTY: AdminOverview = {
  totals: {
    brands: 0, brandsLive: 0, creators: 0, creatorsPayable: 0,
    campaigns: 0, campaignsOpen: 0, orders: 0,
    attributedSalesCents: 0, commissionCents: 0, feeCents: 0,
    feeCollectedCents: 0, owedToCreatorsCents: 0, paidToCreatorsCents: 0,
  },
  brands: [],
  creators: [],
  campaigns: [],
  runs: [],
  months: [],
  loadedAt: new Date(0).toISOString(),
};

/* Narrow shapes for what comes back. Only the columns actually used, so a
   schema change that drops something unused cannot break this file. */
interface BrandRaw {
  id: string; name: string; handle: string | null; logo_url: string | null;
  owner_user_id: string | null; contact_phone: string | null;
  website_url: string | null; description: string | null; business_type: string | null;
  billing_origin: string | null; shopify_plan_status: string | null; created_at: string;
}
interface ConnRaw { brand_id: string; provider: string; status: string }
interface BillingRaw {
  brand_id: string; stripe_method_type: string | null;
  stripe_method_brand: string | null; stripe_method_last4: string | null;
}
interface AgreementRaw { brand_id: string | null; signed_at: string }
interface CampaignRaw {
  id: string; brand_id: string; name: string; status: string;
  commission_rate_bps: number | null; platform_fee_bps: number; created_at: string;
}
interface CreatorRaw {
  id: string; user_id: string | null; handle: string | null;
  bio: string | null; location: string | null; niche: string[] | null;
  instagram_handle: string | null; instagram_followers: number | null;
  tiktok_handle: string | null; tiktok_followers: number | null;
  youtube_handle: string | null; youtube_subscribers: number | null;
  stripe_account_id: string | null; stripe_payouts_enabled: boolean;
  tax_form_status: string; created_at: string;
}
interface ProfileRaw { id: string; full_name: string | null; email: string | null }
interface SubmissionRaw {
  id: string; campaign_id: string; creator_id: string; brand_id: string | null; status: string;
}
interface EarningRaw {
  brand_id: string; campaign_id: string; creator_id: string; order_id: string;
  commissionable_cents: number; commission_cents: number; platform_fee_cents: number;
  state: string; created_at: string;
}
interface RunRaw {
  id: string; brand_id: string; status: string;
  commission_cents: number; platform_fee_cents: number; total_cents: number;
  order_count: number; creator_count: number; method: string | null;
  authorized_at: string; settled_at: string | null;
}
interface PayoutRaw {
  run_id: string; creator_id: string; amount_cents: number; status: string;
  paid_at: string | null; failure_reason: string | null;
}

/**
 * A submission the brand chose to run.
 *
 * The enum is submitted, in_review, approved, revision_requested, live,
 * rejected. Both `approved` and `live` mean the brand took the video: one is
 * the decision, the other is it running as an ad. Counting only `approved`
 * would under-report every video that has since gone live.
 */
const isUsed = (status: string) => status === 'approved' || status === 'live';

/**
 * A campaign that is running.
 *
 * `live` is the active state. `pending_fund` is a leftover from the funded
 * pool model and should never be set again, but historical rows carry it.
 */
const isLive = (status: string) => status === 'live';

/** A payment run whose money has actually arrived. `processing` has not. */
const isSettled = (status: string) => status === 'settled';

/** How a creator's payment method reads to a human. */
function describeMethod(b: BillingRaw | undefined): string | null {
  if (!b || !b.stripe_method_type) return null;
  const last4 = b.stripe_method_last4 ? ` ····${b.stripe_method_last4}` : '';
  if (b.stripe_method_type === 'us_bank_account') return `Bank${last4}`;
  const brand = b.stripe_method_brand
    ? b.stripe_method_brand.charAt(0).toUpperCase() + b.stripe_method_brand.slice(1)
    : 'Card';
  return `${brand}${last4}`;
}

/**
 * Everything the admin overview shows, in one pass.
 *
 * Returns EMPTY with an error rather than throwing, because the caller is a
 * page that should render its own failure state rather than disappear.
 */
export async function loadAdminOverview(): Promise<Result<AdminOverview>> {
  const sb = getSupabase();
  if (!sb) return fail(EMPTY, 'Supabase is not configured.');

  try {
    const [
      brandsRes, connRes, billingRes, agreementRes,
      campaignRes, creatorRes, profileRes, submissionRes,
      earningRes, runRes, payoutRes, orderRes,
    ] = await Promise.all([
      sb.from('brands').select('id, name, handle, logo_url, owner_user_id, contact_phone, website_url, description, business_type, billing_origin, shopify_plan_status, created_at'),
      sb.from('brand_connections').select('brand_id, provider, status'),
      sb.from('brand_billing').select('brand_id, stripe_method_type, stripe_method_brand, stripe_method_last4'),
      sb.from('agreements').select('brand_id, signed_at').order('signed_at', { ascending: false }),
      sb.from('campaigns').select('id, brand_id, name, status, commission_rate_bps, platform_fee_bps, created_at'),
      sb.from('creators').select('id, user_id, handle, bio, location, niche, instagram_handle, instagram_followers, tiktok_handle, tiktok_followers, youtube_handle, youtube_subscribers, stripe_account_id, stripe_payouts_enabled, tax_form_status, created_at'),
      sb.from('profiles').select('id, full_name, email'),
      sb.from('submissions').select('id, campaign_id, creator_id, brand_id, status'),
      sb.from('earnings').select('brand_id, campaign_id, creator_id, order_id, commissionable_cents, commission_cents, platform_fee_cents, state, created_at'),
      sb.from('payment_runs').select('id, brand_id, status, commission_cents, platform_fee_cents, total_cents, order_count, creator_count, method, authorized_at, settled_at').order('authorized_at', { ascending: false }),
      sb.from('payment_run_payouts').select('run_id, creator_id, amount_cents, status, paid_at, failure_reason'),
      sb.from('orders').select('id, brand_id'),
    ]);

    const firstError =
      brandsRes.error || connRes.error || billingRes.error || agreementRes.error ||
      campaignRes.error || creatorRes.error || profileRes.error || submissionRes.error ||
      earningRes.error || runRes.error || payoutRes.error || orderRes.error;
    if (firstError) {
      return fail(EMPTY, firstError.message || 'Could not load the admin overview.');
    }

    const brands = (brandsRes.data ?? []) as BrandRaw[];
    const conns = (connRes.data ?? []) as ConnRaw[];
    const billing = (billingRes.data ?? []) as BillingRaw[];
    const agreements = (agreementRes.data ?? []) as AgreementRaw[];
    const campaigns = (campaignRes.data ?? []) as CampaignRaw[];
    const creators = (creatorRes.data ?? []) as CreatorRaw[];
    const profiles = (profileRes.data ?? []) as ProfileRaw[];
    const submissions = (submissionRes.data ?? []) as SubmissionRaw[];
    const runs = (runRes.data ?? []) as RunRaw[];
    const payouts = (payoutRes.data ?? []) as PayoutRaw[];
    const orders = (orderRes.data ?? []) as Array<{ id: string; brand_id: string }>;

    // Reversed earnings are excluded everywhere. They were refunded or charged
    // back, so counting them would overstate both a creator's earnings and
    // KYRO's revenue.
    const earnings = ((earningRes.data ?? []) as EarningRaw[]).filter((e) => e.state !== REVERSED);

    const billingByBrand = new Map(billing.map((b) => [b.brand_id, b]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    /* Most recent signature per brand. The query is already ordered newest
       first, so the first one seen wins. */
    const agreementByBrand = new Map<string, string>();
    for (const a of agreements) {
      if (a.brand_id && !agreementByBrand.has(a.brand_id)) agreementByBrand.set(a.brand_id, a.signed_at);
    }

    const connByBrand = new Map<string, { shopify: boolean; meta: boolean }>();
    for (const c of conns) {
      const entry = connByBrand.get(c.brand_id) ?? { shopify: false, meta: false };
      if (c.status === 'active') {
        if (c.provider === 'shopify') entry.shopify = true;
        if (c.provider === 'meta') entry.meta = true;
      }
      connByBrand.set(c.brand_id, entry);
    }

    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    // ── Per-brand rollups ────────────────────────────────────────────
    type Agg = { sales: number; commission: number; fee: number; owed: number; orders: Set<string> };
    const blank = (): Agg => ({ sales: 0, commission: 0, fee: 0, owed: 0, orders: new Set() });

    const byBrand = new Map<string, Agg>();
    const byCampaign = new Map<string, Agg>();
    const byCreator = new Map<string, Agg>();
    const byMonth = new Map<string, Agg>();

    for (const e of earnings) {
      const bump = (m: Map<string, Agg>, key: string) => {
        const a = m.get(key) ?? blank();
        a.sales += e.commissionable_cents;
        a.commission += e.commission_cents;
        a.fee += e.platform_fee_cents;
        // Available means cleared and payable, and not yet paid for.
        if (e.state === 'available') a.owed += e.commission_cents;
        a.orders.add(e.order_id);
        m.set(key, a);
      };
      bump(byBrand, e.brand_id);
      bump(byCampaign, e.campaign_id);
      bump(byCreator, e.creator_id);
      bump(byMonth, e.created_at.slice(0, 7));
    }

    const brandsPerCreator = new Map<string, Set<string>>();
    const creatorsPerBrand = new Map<string, Set<string>>();
    const creatorsPerCampaign = new Map<string, Set<string>>();
    const subsPerCampaign = new Map<string, number>();
    const subsPerCreator = new Map<string, number>();
    const usedPerCreator = new Map<string, number>();
    const campaignsPerCreator = new Map<string, Set<string>>();

    for (const s of submissions) {
      const campaign = campaignById.get(s.campaign_id);
      const brandId = s.brand_id ?? campaign?.brand_id ?? null;

      if (brandId) {
        const set = creatorsPerBrand.get(brandId) ?? new Set();
        set.add(s.creator_id);
        creatorsPerBrand.set(brandId, set);

        const brands = brandsPerCreator.get(s.creator_id) ?? new Set();
        brands.add(brandId);
        brandsPerCreator.set(s.creator_id, brands);
      }

      const campSet = creatorsPerCampaign.get(s.campaign_id) ?? new Set();
      campSet.add(s.creator_id);
      creatorsPerCampaign.set(s.campaign_id, campSet);

      const onCampaigns = campaignsPerCreator.get(s.creator_id) ?? new Set();
      onCampaigns.add(s.campaign_id);
      campaignsPerCreator.set(s.creator_id, onCampaigns);

      subsPerCampaign.set(s.campaign_id, (subsPerCampaign.get(s.campaign_id) ?? 0) + 1);
      subsPerCreator.set(s.creator_id, (subsPerCreator.get(s.creator_id) ?? 0) + 1);
      if (isUsed(s.status)) usedPerCreator.set(s.creator_id, (usedPerCreator.get(s.creator_id) ?? 0) + 1);
    }

    const campaignsPerBrand = new Map<string, number>();
    for (const c of campaigns) {
      campaignsPerBrand.set(c.brand_id, (campaignsPerBrand.get(c.brand_id) ?? 0) + 1);
    }

    const ordersPerBrand = new Map<string, number>();
    for (const o of orders) ordersPerBrand.set(o.brand_id, (ordersPerBrand.get(o.brand_id) ?? 0) + 1);

    const paidPerCreator = new Map<string, number>();
    let paidToCreatorsCents = 0;
    for (const p of payouts) {
      if (p.status !== 'paid') continue;
      paidPerCreator.set(p.creator_id, (paidPerCreator.get(p.creator_id) ?? 0) + p.amount_cents);
      paidToCreatorsCents += p.amount_cents;
    }

    // KYRO's fee is collected when the brand's run settles, not when it is
    // authorized. A run sitting in `processing` on a bank debit has been
    // charged but the money is not here yet.
    let feeCollectedCents = 0;
    for (const r of runs) {
      if (isSettled(r.status)) feeCollectedCents += r.platform_fee_cents;
    }

    const brandRows: AdminBrandRow[] = brands.map((b) => {
      const agg = byBrand.get(b.id) ?? blank();
      const conn = connByBrand.get(b.id) ?? { shopify: false, meta: false };
      const method = describeMethod(billingByBrand.get(b.id));
      const origin = b.billing_origin ?? 'direct';
      const owner = b.owner_user_id ? profileById.get(b.owner_user_id) : undefined;

      /* Can this brand actually be charged for what it owes? A direct brand
         needs a payment method on file. An App Store brand is billed by
         Shopify, which needs an approved subscription. A brand that owes
         money and satisfies neither is the row that matters most on this
         page, because nobody is collecting from it. */
      const billable = origin === 'shopify_app_store'
        ? b.shopify_plan_status === 'ACTIVE'
        : Boolean(method);

      return {
        id: b.id,
        name: b.name,
        handle: b.handle,
        logoUrl: b.logo_url,
        billingOrigin: origin,
        shopifyPlanStatus: b.shopify_plan_status,
        shopifyConnected: conn.shopify,
        metaConnected: conn.meta,
        paymentMethod: method,
        agreementSignedAt: agreementByBrand.get(b.id) ?? null,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.full_name ?? null,
        contactPhone: b.contact_phone,
        websiteUrl: b.website_url,
        description: b.description,
        businessType: b.business_type,
        campaigns: campaignsPerBrand.get(b.id) ?? 0,
        creators: creatorsPerBrand.get(b.id)?.size ?? 0,
        orders: ordersPerBrand.get(b.id) ?? 0,
        attributedSalesCents: agg.sales,
        commissionCents: agg.commission,
        feeCents: agg.fee,
        owedCents: agg.owed,
        createdAt: b.created_at,
        billable,
      };
    });

    const creatorRows: AdminCreatorRow[] = creators.map((c) => {
      const agg = byCreator.get(c.id) ?? blank();
      const profile = c.user_id ? profileById.get(c.user_id) : undefined;
      const payoutsReady = Boolean(c.stripe_account_id) && c.stripe_payouts_enabled;
      const taxComplete = c.tax_form_status === 'complete';

      /* Migration 0032 holds a share unless both are true. Saying which one
         is missing turns "why has this creator not been paid" from a support
         conversation into a glance. */
      const heldReason = payoutsReady && taxComplete
        ? null
        : !payoutsReady
          ? 'Stripe payouts not enabled'
          : 'Tax details incomplete';

      return {
        id: c.id,
        name: profile?.full_name || profile?.email || c.handle || 'Unnamed creator',
        handle: c.handle,
        email: profile?.email ?? null,
        bio: c.bio,
        location: c.location,
        niche: c.niche ?? [],
        socials: [
          { network: 'Instagram', handle: c.instagram_handle, followers: c.instagram_followers },
          { network: 'TikTok', handle: c.tiktok_handle, followers: c.tiktok_followers },
          { network: 'YouTube', handle: c.youtube_handle, followers: c.youtube_subscribers },
        ].filter((x): x is { network: string; handle: string; followers: number | null } => Boolean(x.handle)),
        taxFormStatus: c.tax_form_status,
        brandIds: [...(brandsPerCreator.get(c.id) ?? new Set<string>())],
        campaignIds: [...(campaignsPerCreator.get(c.id) ?? new Set<string>())],
        campaigns: campaignsPerCreator.get(c.id)?.size ?? 0,
        submissions: subsPerCreator.get(c.id) ?? 0,
        used: usedPerCreator.get(c.id) ?? 0,
        orders: agg.orders.size,
        earnedCents: agg.commission,
        paidCents: paidPerCreator.get(c.id) ?? 0,
        payoutsReady,
        taxComplete,
        heldReason,
        createdAt: c.created_at,
      };
    });

    const brandNameById = new Map(brands.map((b) => [b.id, b.name]));
    const campaignRows: AdminCampaignRow[] = campaigns.map((c) => {
      const agg = byCampaign.get(c.id) ?? blank();
      return {
        id: c.id,
        name: c.name,
        brandId: c.brand_id,
        brandName: brandNameById.get(c.brand_id) ?? 'Unknown brand',
        status: c.status,
        commissionBps: c.commission_rate_bps,
        feeBps: c.platform_fee_bps,
        creators: creatorsPerCampaign.get(c.id)?.size ?? 0,
        submissions: subsPerCampaign.get(c.id) ?? 0,
        orders: agg.orders.size,
        attributedSalesCents: agg.sales,
        commissionCents: agg.commission,
        feeCents: agg.fee,
        createdAt: c.created_at,
      };
    });

    /* Runs, newest first, each carrying the transfers it produced. The
       processing cost is derived rather than stored: it is whatever the brand
       paid above the commission and the fee, which is exactly what the
       processor took. */
    const payoutsByRun = new Map<string, PayoutRaw[]>();
    for (const p of payouts) {
      const list = payoutsByRun.get(p.run_id) ?? [];
      list.push(p);
      payoutsByRun.set(p.run_id, list);
    }
    const creatorNameById = new Map(
      creators.map((c) => {
        const prof = c.user_id ? profileById.get(c.user_id) : undefined;
        return [c.id, prof?.full_name || prof?.email || c.handle || 'Unnamed creator'];
      })
    );

    const runRows: AdminRunRow[] = runs.map((r) => ({
      id: r.id,
      brandId: r.brand_id,
      brandName: brandNameById.get(r.brand_id) ?? 'Unknown brand',
      status: r.status,
      commissionCents: r.commission_cents,
      feeCents: r.platform_fee_cents,
      totalCents: r.total_cents,
      processingCents: Math.max(r.total_cents - r.commission_cents - r.platform_fee_cents, 0),
      orders: r.order_count,
      creators: r.creator_count,
      method: r.method,
      authorizedAt: r.authorized_at,
      settledAt: r.settled_at,
      payouts: (payoutsByRun.get(r.id) ?? []).map((p) => ({
        creatorId: p.creator_id,
        creatorName: creatorNameById.get(p.creator_id) ?? 'Unknown creator',
        amountCents: p.amount_cents,
        status: p.status,
        paidAt: p.paid_at,
        failureReason: p.failure_reason,
      })),
    }));

    const months: AdminMonth[] = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, a]) => ({
        month,
        attributedSalesCents: a.sales,
        commissionCents: a.commission,
        feeCents: a.fee,
        orders: a.orders.size,
      }));

    const totals: AdminTotals = {
      brands: brands.length,
      // A brand counts as live once it has driven an attributed sale. Anything
      // less is a signup, and counting signups as brands flatters the number.
      brandsLive: brandRows.filter((b) => b.attributedSalesCents > 0).length,
      creators: creators.length,
      creatorsPayable: creatorRows.filter((c) => c.heldReason === null).length,
      campaigns: campaigns.length,
      campaignsOpen: campaigns.filter((c) => isLive(c.status)).length,
      orders: orders.length,
      attributedSalesCents: earnings.reduce((s, e) => s + e.commissionable_cents, 0),
      commissionCents: earnings.reduce((s, e) => s + e.commission_cents, 0),
      feeCents: earnings.reduce((s, e) => s + e.platform_fee_cents, 0),
      feeCollectedCents,
      owedToCreatorsCents: earnings
        .filter((e) => e.state === 'available')
        .reduce((s, e) => s + e.commission_cents, 0),
      paidToCreatorsCents,
    };

    return ok({
      totals,
      brands: brandRows.sort((a, b) => b.attributedSalesCents - a.attributedSalesCents),
      creators: creatorRows.sort((a, b) => b.earnedCents - a.earnedCents),
      campaigns: campaignRows.sort((a, b) => b.attributedSalesCents - a.attributedSalesCents),
      runs: runRows,
      months,
      loadedAt: new Date().toISOString(),
    });
  } catch (e) {
    return fail(EMPTY, e instanceof Error ? e.message : 'Could not load the admin overview.');
  }
}
