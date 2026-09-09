/**
 * Kyro — Database Layer (Phase 1)
 *
 * The typed boundary between the UI and Postgres. Nothing in App.tsx should
 * ever touch `supabase.from(...)` directly — it goes through here so that:
 *
 *   1. snake_case DB rows are mapped to the camelCase shapes in `types.ts`,
 *      which stays the single source of truth for entity shape.
 *   2. Money crosses the boundary exactly once. Postgres stores integer cents
 *      (bigint); the UI thinks in dollars. Conversion happens here, nowhere else.
 *   3. Nothing throws. Every call returns `{ data, error }` where `error` is a
 *      human-readable string or null, so a failed query degrades the UI into an
 *      error state instead of a white screen.
 *
 * RLS note: these queries are written to satisfy the policies in
 * `supabase/migrations/0002_core_schema.sql`. In particular a brand user cannot
 * write a campaign until a `brands` row owned by their auth.uid() exists —
 * that is what `ensureMyBrand()` is for.
 */

import { getSupabase } from './supabase';
import type {
  Brand,
  Campaign,
  CampaignStatus,
  Cents,
  CommissionType,
  Creator,
  IntakePath,
} from './types';

/* ─────────────────────────────────────────────────────────────
   Result envelope — no-throw contract
   ───────────────────────────────────────────────────────────── */

export interface Result<T> {
  data: T;
  error: string | null;
}

const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(data: T, error: string): Result<T> => ({ data, error });

/** Postgres/PostgREST errors are cryptic. Translate the ones users can hit. */
function describeError(e: unknown, fallback = 'Something went wrong.'): string {
  const err = e as { code?: string; message?: string; details?: string } | null;
  if (!err) return fallback;
  switch (err.code) {
    case '23505':
      return 'That already exists. Try a different name.';
    case '23503':
      return 'A linked record is missing. Refresh and try again.';
    case '42501':
    case 'PGRST301':
      return "You don't have permission to do that.";
    case 'PGRST116':
      return 'Not found.';
    case '22P02':
      return 'One of the values was in an unexpected format.';
    default:
      return err.message || fallback;
  }
}

/** Guard for every call: no client means demo mode, not an error. */
function client() {
  return getSupabase();
}

/* ─────────────────────────────────────────────────────────────
   Money — dollars in the UI, integer cents in the DB
   ───────────────────────────────────────────────────────────── */

export const dollarsToCents = (dollars: number): Cents => Math.round(dollars * 100);
export const centsToDollars = (cents: Cents): number => cents / 100;

/**
 * Parse whatever a user typed into a money field ("25,000", "$25000.50", "25k")
 * into integer cents. Returns null when the input isn't a usable number.
 */
export function parseMoneyToCents(input: string): Cents | null {
  const raw = input.trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!raw) return null;
  const multiplier = raw.endsWith('k') ? 1000 : raw.endsWith('m') ? 1000000 : 1;
  const numeric = multiplier === 1 ? raw : raw.slice(0, -1);
  if (!/^\d*\.?\d*$/.test(numeric) || numeric === '' || numeric === '.') return null;
  const value = parseFloat(numeric) * multiplier;
  if (!isFinite(value) || value < 0) return null;
  return dollarsToCents(value);
}

/** Parse a percent field ("15", "15%", "0.15" is treated as 0.15%) into 0..1. */
export function parsePercentToFraction(input: string): number | null {
  const raw = input.trim().replace(/[%\s]/g, '');
  if (!raw || !/^\d*\.?\d*$/.test(raw) || raw === '.') return null;
  const value = parseFloat(raw);
  if (!isFinite(value) || value < 0 || value > 100) return null;
  return value / 100;
}

/* ─────────────────────────────────────────────────────────────
   Row types — mirror the Postgres tables exactly (snake_case)
   ───────────────────────────────────────────────────────────── */

export interface BrandRow {
  id: string;
  owner_user_id: string | null;
  name: string;
  handle: string;
  logo_url: string | null;
  tagline: string | null;
  category: string | null;
  accent: string | null;
  meta_ad_account_id: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface CreatorRow {
  id: string;
  user_id: string | null;
  handle: string | null;
  bio: string | null;
  location: string | null;
  niche: string[] | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  tiktok_handle: string | null;
  tiktok_followers: number | null;
  youtube_handle: string | null;
  youtube_subscribers: number | null;
  trolley_recipient_id: string | null;
  tax_form_status: 'not_collected' | 'pending' | 'complete';
  stats: Record<string, unknown> | null;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  brand_id: string;
  name: string;
  brief: string | null;
  status: CampaignStatus;
  intake_paths: IntakePath[] | null;
  commission_type: CommissionType;
  commission_percent_spend: number | null;
  commission_per_conversion_cents: number | null;
  commission_retainer_cents: number | null;
  pool_target_cents: number;
  pool_balance_cents: number;
  spent_cents: number;
  start_date: string | null;
  end_date: string | null;
  deliverable_spec: string | null;
  cover_url: string | null;
  created_at: string;
}

export interface SubmissionCountsRow {
  campaign_id: string;
  creator_id: string;
  orders: number;
  impressions: number;
  spend_cents: number;
}

/* ─────────────────────────────────────────────────────────────
   Mappers — row → domain shape from types.ts
   ───────────────────────────────────────────────────────────── */

export function toBrand(row: BrandRow): Brand {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id ?? '',
    name: row.name,
    handle: row.handle,
    logoUrl: row.logo_url ?? '',
    tagline: row.tagline ?? '',
    category: row.category ?? '',
    metaAdAccountId: row.meta_ad_account_id ?? undefined,
    approvalStatus: row.approval_status,
    createdAt: row.created_at,
  };
}

export function toCreator(row: CreatorRow): Creator {
  const stats = (row.stats ?? {}) as Partial<Creator['stats']>;
  return {
    id: row.id,
    userId: row.user_id ?? '',
    handle: row.handle ?? '',
    bio: row.bio ?? '',
    location: row.location ?? undefined,
    niche: row.niche ?? [],
    social: {
      ...(row.instagram_handle
        ? { instagram: { handle: row.instagram_handle, followers: row.instagram_followers ?? 0 } }
        : {}),
      ...(row.tiktok_handle
        ? { tiktok: { handle: row.tiktok_handle, followers: row.tiktok_followers ?? 0 } }
        : {}),
      ...(row.youtube_handle
        ? { youtube: { handle: row.youtube_handle, subscribers: row.youtube_subscribers ?? 0 } }
        : {}),
    },
    trolleyRecipientId: row.trolley_recipient_id ?? undefined,
    taxFormStatus: row.tax_form_status,
    stats: {
      campaigns: stats.campaigns ?? 0,
      totalEarnedCents: stats.totalEarnedCents ?? 0,
      avgRoasForBrands: stats.avgRoasForBrands ?? 0,
      ordersDriven: stats.ordersDriven ?? 0,
    },
  };
}

export function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    brief: row.brief ?? '',
    status: row.status,
    intakePaths: row.intake_paths ?? ['marketplace'],
    commission: {
      type: row.commission_type,
      percentSpend: row.commission_percent_spend ?? undefined,
      perConversionCents: row.commission_per_conversion_cents ?? undefined,
      retainerCents: row.commission_retainer_cents ?? undefined,
    },
    poolTargetCents: row.pool_target_cents ?? 0,
    poolBalanceCents: row.pool_balance_cents ?? 0,
    spentCents: row.spent_cents ?? 0,
    startDate: row.start_date ?? row.created_at,
    endDate: row.end_date ?? undefined,
    deliverableSpec: row.deliverable_spec ?? '',
  };
}

/**
 * A campaign plus the rolled-up numbers the dashboard renders. These are
 * derived client-side from `submissions` and `applications` for now; once Meta
 * insights land (Phase 2) `roas` gets a real value instead of null.
 */
export interface CampaignStats {
  creators: number;
  submissions: number;
  impressions: number;
  orders: number;
  spentCents: Cents;
  roas: number | null;
}

export interface CampaignWithStats extends Campaign {
  coverUrl: string | null;
  stats: CampaignStats;
}

const EMPTY_STATS: CampaignStats = {
  creators: 0,
  submissions: 0,
  impressions: 0,
  orders: 0,
  spentCents: 0,
  roas: null,
};

/* ─────────────────────────────────────────────────────────────
   Handles — brands.handle and creators.handle are UNIQUE
   ───────────────────────────────────────────────────────────── */

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return slug || 'brand';
}

/** Short random suffix used to break handle collisions. */
function suffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

/* ─────────────────────────────────────────────────────────────
   Brands
   ───────────────────────────────────────────────────────────── */

/** The brand owned by the signed-in user, or null if they don't have one yet. */
export async function getMyBrand(): Promise<Result<Brand | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return ok(null);
    const { data, error } = await sb
      .from('brands')
      .select('*')
      .eq('owner_user_id', uid)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return fail(null, describeError(error, 'Could not load your brand.'));
    return ok(data ? toBrand(data as BrandRow) : null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not load your brand.'));
  }
}

/**
 * Get the signed-in user's brand, creating a starter row if they don't have
 * one. This has to run before a brand user can create a campaign — the RLS
 * policy on `campaigns` checks ownership through `brands`.
 */
export async function ensureMyBrand(opts?: {
  name?: string;
  email?: string | null;
}): Promise<Result<Brand | null>> {
  const existing = await getMyBrand();
  if (existing.error || existing.data) return existing;

  const sb = client();
  if (!sb) return ok(null);

  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return fail(null, 'No active session.');

    const email = opts?.email ?? auth.user?.email ?? '';
    const displayName = (opts?.name || email.split('@')[0] || 'My Brand').trim();
    const base = slugify(displayName);

    // handle is UNIQUE — retry with a random suffix on collision.
    for (let attempt = 0; attempt < 4; attempt++) {
      const handle = attempt === 0 ? base : `${base}-${suffix()}`;
      const { data, error } = await sb
        .from('brands')
        .insert({
          owner_user_id: uid,
          name: displayName,
          handle,
          approval_status: 'pending',
        })
        .select()
        .single();

      if (!error) return ok(toBrand(data as BrandRow));
      if ((error as { code?: string }).code !== '23505') {
        return fail(null, describeError(error, 'Could not set up your brand.'));
      }
      // Unique violation: another row took the handle (or a concurrent tab
      // created the brand). Re-check before trying a new handle.
      const recheck = await getMyBrand();
      if (recheck.data) return recheck;
    }
    return fail(null, 'Could not set up your brand. Please try again.');
  } catch (e) {
    return fail(null, describeError(e, 'Could not set up your brand.'));
  }
}

export async function updateBrand(
  brandId: string,
  patch: Partial<Pick<Brand, 'name' | 'tagline' | 'category' | 'logoUrl'>>
): Promise<Result<Brand | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('brands')
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.logoUrl !== undefined ? { logo_url: patch.logoUrl } : {}),
      })
      .eq('id', brandId)
      .select()
      .single();
    if (error) return fail(null, describeError(error, 'Could not save your brand.'));
    return ok(toBrand(data as BrandRow));
  } catch (e) {
    return fail(null, describeError(e, 'Could not save your brand.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Creators
   ───────────────────────────────────────────────────────────── */

export async function getMyCreator(): Promise<Result<Creator | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return ok(null);
    const { data, error } = await sb
      .from('creators')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) return fail(null, describeError(error, 'Could not load your creator profile.'));
    return ok(data ? toCreator(data as CreatorRow) : null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not load your creator profile.'));
  }
}

/** Creator equivalent of ensureMyBrand — needed before applying or submitting. */
export async function ensureMyCreator(opts?: {
  handle?: string;
  email?: string | null;
}): Promise<Result<Creator | null>> {
  const existing = await getMyCreator();
  if (existing.error || existing.data) return existing;

  const sb = client();
  if (!sb) return ok(null);

  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return fail(null, 'No active session.');

    const email = opts?.email ?? auth.user?.email ?? '';
    const base = slugify(opts?.handle || email.split('@')[0] || 'creator');

    for (let attempt = 0; attempt < 4; attempt++) {
      const handle = attempt === 0 ? base : `${base}-${suffix()}`;
      const { data, error } = await sb
        .from('creators')
        .insert({ user_id: uid, handle })
        .select()
        .single();

      if (!error) return ok(toCreator(data as CreatorRow));
      if ((error as { code?: string }).code !== '23505') {
        return fail(null, describeError(error, 'Could not set up your creator profile.'));
      }
      const recheck = await getMyCreator();
      if (recheck.data) return recheck;
    }
    return fail(null, 'Could not set up your creator profile. Please try again.');
  } catch (e) {
    return fail(null, describeError(e, 'Could not set up your creator profile.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Campaigns
   ───────────────────────────────────────────────────────────── */

export interface NewCampaignInput {
  name: string;
  brief?: string;
  poolTargetCents: Cents;
  commissionType: CommissionType;
  commissionPercentSpend?: number | null;
  commissionPerConversionCents?: Cents | null;
  deliverableSpec?: string;
  intakePaths?: IntakePath[];
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Create a campaign for a brand the signed-in user owns.
 *
 * New campaigns start as `pending_fund` with a zero balance: the pool target is
 * what the brand intends to spend, the balance is what has actually been paid
 * in. Square funding (Phase 2) is what credits the balance and flips it to
 * `live`, so nothing here should pretend money has arrived.
 */
export async function createCampaign(
  brandId: string,
  input: NewCampaignInput
): Promise<Result<Campaign | null>> {
  const sb = client();
  if (!sb) return ok(null);

  const name = input.name.trim();
  if (!name) return fail(null, 'Give the campaign a name.');
  if (input.poolTargetCents < 0) return fail(null, 'Pool budget must be zero or more.');

  try {
    const { data, error } = await sb
      .from('campaigns')
      .insert({
        brand_id: brandId,
        name,
        brief: input.brief?.trim() || null,
        status: 'pending_fund' as CampaignStatus,
        intake_paths: input.intakePaths ?? ['marketplace'],
        commission_type: input.commissionType,
        commission_percent_spend: input.commissionPercentSpend ?? null,
        commission_per_conversion_cents: input.commissionPerConversionCents ?? null,
        pool_target_cents: input.poolTargetCents,
        pool_balance_cents: 0,
        spent_cents: 0,
        deliverable_spec: input.deliverableSpec?.trim() || null,
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
      })
      .select()
      .single();

    if (error) return fail(null, describeError(error, 'Could not create the campaign.'));
    return ok(toCampaign(data as CampaignRow));
  } catch (e) {
    return fail(null, describeError(e, 'Could not create the campaign.'));
  }
}

export async function listCampaigns(brandId?: string): Promise<Result<Campaign[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    let q = sb.from('campaigns').select('*').order('created_at', { ascending: false });
    if (brandId) q = q.eq('brand_id', brandId);
    const { data, error } = await q;
    if (error) return fail([], describeError(error, 'Could not load campaigns.'));
    return ok((data ?? []).map((r) => toCampaign(r as CampaignRow)));
  } catch (e) {
    return fail([], describeError(e, 'Could not load campaigns.'));
  }
}

/**
 * Campaigns for a brand with their rolled-up performance numbers.
 *
 * Deliberately three flat queries rather than a per-campaign fan-out: one for
 * campaigns, one for every submission across them, one for accepted
 * applications. The joins happen in memory, so adding a campaign never adds a
 * round trip.
 */
export async function listCampaignsWithStats(
  brandId: string
): Promise<Result<CampaignWithStats[]>> {
  const sb = client();
  if (!sb) return ok([]);

  try {
    const { data: campaignRows, error: campaignError } = await sb
      .from('campaigns')
      .select('*')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (campaignError) return fail([], describeError(campaignError, 'Could not load campaigns.'));

    const rows = (campaignRows ?? []) as CampaignRow[];
    if (rows.length === 0) return ok([]);

    const ids = rows.map((r) => r.id);

    const [submissionsRes, applicationsRes] = await Promise.all([
      sb
        .from('submissions')
        .select('campaign_id, creator_id, orders, impressions, spend_cents')
        .in('campaign_id', ids),
      sb
        .from('applications')
        .select('campaign_id, creator_id')
        .in('campaign_id', ids)
        .eq('status', 'accepted'),
    ]);

    // Stats are additive detail. If they fail (or RLS hides them) we still show
    // the campaigns rather than blanking the dashboard.
    const submissions = (submissionsRes.data ?? []) as SubmissionCountsRow[];
    const applications = (applicationsRes.data ?? []) as {
      campaign_id: string;
      creator_id: string;
    }[];

    const byCampaign = new Map<string, CampaignStats>();
    const creatorsByCampaign = new Map<string, Set<string>>();

    const touchCreator = (campaignId: string, creatorId: string) => {
      if (!creatorId) return;
      const set = creatorsByCampaign.get(campaignId) ?? new Set<string>();
      set.add(creatorId);
      creatorsByCampaign.set(campaignId, set);
    };

    for (const s of submissions) {
      const stats = byCampaign.get(s.campaign_id) ?? { ...EMPTY_STATS };
      stats.submissions += 1;
      stats.orders += s.orders ?? 0;
      stats.impressions += s.impressions ?? 0;
      stats.spentCents += s.spend_cents ?? 0;
      byCampaign.set(s.campaign_id, stats);
      touchCreator(s.campaign_id, s.creator_id);
    }

    for (const a of applications) touchCreator(a.campaign_id, a.creator_id);

    return ok(
      rows.map((row) => {
        const stats = byCampaign.get(row.id) ?? { ...EMPTY_STATS };
        stats.creators = creatorsByCampaign.get(row.id)?.size ?? 0;
        // Prefer the campaign's own spend column when it has been reconciled.
        if ((row.spent_cents ?? 0) > 0) stats.spentCents = row.spent_cents;
        return { ...toCampaign(row), coverUrl: row.cover_url, stats };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load campaigns.'));
  }
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<Result<Campaign | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('campaigns')
      .update({ status })
      .eq('id', campaignId)
      .select()
      .single();
    if (error) return fail(null, describeError(error, 'Could not update the campaign.'));
    return ok(toCampaign(data as CampaignRow));
  } catch (e) {
    return fail(null, describeError(e, 'Could not update the campaign.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Brand-level rollup for the dashboard KPI cards
   ───────────────────────────────────────────────────────────── */

export interface BrandTotals {
  poolTargetCents: Cents;
  poolBalanceCents: Cents;
  spentCents: Cents;
  orders: number;
  impressions: number;
  campaigns: number;
  liveCampaigns: number;
}

export function totalsFor(campaigns: CampaignWithStats[]): BrandTotals {
  return campaigns.reduce<BrandTotals>(
    (acc, c) => ({
      poolTargetCents: acc.poolTargetCents + c.poolTargetCents,
      poolBalanceCents: acc.poolBalanceCents + c.poolBalanceCents,
      spentCents: acc.spentCents + c.stats.spentCents,
      orders: acc.orders + c.stats.orders,
      impressions: acc.impressions + c.stats.impressions,
      campaigns: acc.campaigns + 1,
      liveCampaigns: acc.liveCampaigns + (c.status === 'live' ? 1 : 0),
    }),
    {
      poolTargetCents: 0,
      poolBalanceCents: 0,
      spentCents: 0,
      orders: 0,
      impressions: 0,
      campaigns: 0,
      liveCampaigns: 0,
    }
  );
}

/* ─────────────────────────────────────────────────────────────
   Brand onboarding — connections, billing, agreement
   A brand cannot launch a campaign until the gates in
   docs/KYRO_MODEL.md §4 are satisfied. This is where that is enforced
   in data rather than in the UI, so the check can't be skipped by
   navigating around the wizard.
   ───────────────────────────────────────────────────────────── */

export type ConnectionProvider = 'meta' | 'shopify';

export interface BrandConnection {
  id: string;
  provider: ConnectionProvider;
  externalId: string;
  displayName: string | null;
  status: 'active' | 'disconnected' | 'error';
  connectedAt: string;
}

export interface BrandBilling {
  brandId: string;
  depositCents: Cents;
  depositStatus: 'none' | 'held' | 'released';
  achMandateRef: string | null;
  billingTriggerBps: number;
  accrualCapCents: Cents;
  completedCampaigns: number;
  state: 'active' | 'paused' | 'suspended';
}

export interface BrandUnbilled {
  commissionCents: Cents;
  feeCents: Cents;
  totalCents: Cents;
}

export interface OnboardingStatus {
  meta: BrandConnection | null;
  shopify: BrandConnection | null;
  paymentReady: boolean;
  agreementSignedAt: string | null;
  /** True when a campaign may be launched. */
  complete: boolean;
}

/** The Campaign Agreement version a signature is recorded against. */
export const CAMPAIGN_AGREEMENT_VERSION = '2026-08-31';

function toConnection(row: {
  id: string;
  provider: ConnectionProvider;
  external_id: string;
  display_name: string | null;
  status: 'active' | 'disconnected' | 'error';
  connected_at: string;
}): BrandConnection {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    displayName: row.display_name,
    status: row.status,
    connectedAt: row.connected_at,
  };
}

/** Meta ad accounts are conventionally written `act_<digits>`. */
export function normalizeMetaAdAccount(input: string): string | null {
  const raw = input.trim().replace(/\s+/g, '');
  if (!raw) return null;
  const digits = raw.replace(/^act_/i, '');
  if (!/^\d{6,20}$/.test(digits)) return null;
  return `act_${digits}`;
}

/** Accept `store`, `store.myshopify.com`, or a pasted admin URL. */
export function normalizeShopifyDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw.includes('.')) raw = `${raw}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(raw)) return null;
  return raw;
}

export async function listConnections(brandId: string): Promise<Result<BrandConnection[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('brand_connections')
      .select('id, provider, external_id, display_name, status, connected_at')
      .eq('brand_id', brandId);
    if (error) return fail([], describeError(error, 'Could not load your connections.'));
    return ok((data ?? []).map((r) => toConnection(r as Parameters<typeof toConnection>[0])));
  } catch (e) {
    return fail([], describeError(e, 'Could not load your connections.'));
  }
}

/**
 * Record a platform connection. Until the Meta and Shopify OAuth apps are
 * approved there is no token exchange to perform, so this stores the account
 * identifier the brand supplies. The row shape is already what OAuth will
 * write, so switching over later is a change of caller, not of schema.
 */
export async function connectProvider(
  brandId: string,
  provider: ConnectionProvider,
  externalId: string,
  displayName?: string
): Promise<Result<BrandConnection | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('brand_connections')
      .upsert(
        {
          brand_id: brandId,
          provider,
          external_id: externalId,
          display_name: displayName?.trim() || null,
          status: 'active',
          disconnected_at: null,
          last_error: null,
        },
        { onConflict: 'brand_id,provider' }
      )
      .select('id, provider, external_id, display_name, status, connected_at')
      .single();
    if (error) return fail(null, describeError(error, 'Could not save that connection.'));
    return ok(toConnection(data as Parameters<typeof toConnection>[0]));
  } catch (e) {
    return fail(null, describeError(e, 'Could not save that connection.'));
  }
}

/**
 * Disconnecting is not a neutral act: per the Terms it pauses campaigns and
 * suspends every licence granted to this brand. The row is marked rather than
 * deleted so that history survives.
 */
export async function disconnectProvider(
  brandId: string,
  provider: ConnectionProvider
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb
      .from('brand_connections')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
      .eq('brand_id', brandId)
      .eq('provider', provider);
    if (error) return fail(false, describeError(error, 'Could not disconnect.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not disconnect.'));
  }
}

/** Read the brand's billing profile, creating the default row if missing. */
export async function ensureBrandBilling(brandId: string): Promise<Result<BrandBilling | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('brand_billing')
      .select('*')
      .eq('brand_id', brandId)
      .maybeSingle();
    if (error) return fail(null, describeError(error, 'Could not load billing.'));

    let row = data;
    if (!row) {
      const created = await sb
        .from('brand_billing')
        .insert({ brand_id: brandId })
        .select()
        .single();
      // A concurrent tab may have created it first; re-read rather than fail.
      if (created.error) {
        const retry = await sb.from('brand_billing').select('*').eq('brand_id', brandId).maybeSingle();
        if (retry.error || !retry.data) {
          return fail(null, describeError(created.error, 'Could not set up billing.'));
        }
        row = retry.data;
      } else {
        row = created.data;
      }
    }

    const r = row as Record<string, unknown>;
    return ok({
      brandId: r.brand_id as string,
      depositCents: (r.deposit_cents as number) ?? 0,
      depositStatus: (r.deposit_status as BrandBilling['depositStatus']) ?? 'none',
      achMandateRef: (r.ach_mandate_ref as string | null) ?? null,
      billingTriggerBps: (r.billing_trigger_bps as number) ?? 3000,
      accrualCapCents: (r.accrual_cap_cents as number) ?? 0,
      completedCampaigns: (r.completed_campaigns as number) ?? 0,
      state: (r.state as BrandBilling['state']) ?? 'active',
    });
  } catch (e) {
    return fail(null, describeError(e, 'Could not load billing.'));
  }
}

/** What the brand has accrued but not yet been charged for. */
export async function getBrandUnbilled(brandId: string): Promise<Result<BrandUnbilled>> {
  const zero: BrandUnbilled = { commissionCents: 0, feeCents: 0, totalCents: 0 };
  const sb = client();
  if (!sb) return ok(zero);
  try {
    const { data, error } = await sb
      .from('brand_unbilled')
      .select('unbilled_commission_cents, unbilled_fee_cents, unbilled_total_cents')
      .eq('brand_id', brandId)
      .maybeSingle();
    if (error) return fail(zero, describeError(error, 'Could not load your balance.'));
    if (!data) return ok(zero);
    const r = data as Record<string, number>;
    return ok({
      commissionCents: r.unbilled_commission_cents ?? 0,
      feeCents: r.unbilled_fee_cents ?? 0,
      totalCents: r.unbilled_total_cents ?? 0,
    });
  } catch (e) {
    return fail(zero, describeError(e, 'Could not load your balance.'));
  }
}

export async function getLatestAgreement(
  brandId: string,
  docType = 'campaign_agreement'
): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('agreements')
      .select('signed_at')
      .eq('brand_id', brandId)
      .eq('doc_type', docType)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return fail(null, describeError(error, 'Could not check the agreement.'));
    return ok((data as { signed_at?: string } | null)?.signed_at ?? null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not check the agreement.'));
  }
}

export async function signCampaignAgreement(brandId: string): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return fail(null, 'No active session.');
    const { data, error } = await sb
      .from('agreements')
      .insert({
        brand_id: brandId,
        user_id: uid,
        doc_type: 'campaign_agreement',
        version: CAMPAIGN_AGREEMENT_VERSION,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
      })
      .select('signed_at')
      .single();
    if (error) return fail(null, describeError(error, 'Could not record your signature.'));
    return ok((data as { signed_at: string }).signed_at);
  } catch (e) {
    return fail(null, describeError(e, 'Could not record your signature.'));
  }
}

/**
 * One round of queries, one answer: may this brand launch a campaign?
 *
 * `paymentReady` is false for now by design — card and ACH setup needs a
 * payment processor and server-side endpoints that don't exist yet. It is
 * deliberately NOT part of `complete`, so testing isn't blocked on it, but it
 * is surfaced in the UI so nobody forgets it is missing.
 */
export async function getOnboardingStatus(brandId: string): Promise<Result<OnboardingStatus>> {
  const empty: OnboardingStatus = {
    meta: null,
    shopify: null,
    paymentReady: false,
    agreementSignedAt: null,
    complete: false,
  };
  const sb = client();
  if (!sb) return ok(empty);

  const [connections, agreement, billing] = await Promise.all([
    listConnections(brandId),
    getLatestAgreement(brandId),
    ensureBrandBilling(brandId),
  ]);

  const error = connections.error || agreement.error || billing.error;
  const active = connections.data.filter((c) => c.status === 'active');
  const meta = active.find((c) => c.provider === 'meta') ?? null;
  const shopify = active.find((c) => c.provider === 'shopify') ?? null;
  const paymentReady = Boolean(billing.data?.achMandateRef);

  const status: OnboardingStatus = {
    meta,
    shopify,
    paymentReady,
    agreementSignedAt: agreement.data,
    complete: Boolean(meta && shopify && agreement.data),
  };
  return error ? fail(status, error) : ok(status);
}
