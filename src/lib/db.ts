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
  website_url: string | null;
  description: string | null;
  business_type: string | null;
  currency: string | null;
  setup_complete: boolean | null;
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
  tax_form_submitted_at?: string | null;
  tax_legal_name?: string | null;
  tax_entity_type?: 'individual' | 'business' | null;
  tax_country?: string | null;
  payout_method?: 'ach' | 'wire' | null;
  payout_bank_name?: string | null;
  payout_bank_last4?: string | null;
  payout_updated_at?: string | null;
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
    websiteUrl: row.website_url ?? undefined,
    description: row.description ?? undefined,
    businessType: row.business_type ?? undefined,
    currency: row.currency ?? 'USD',
    // Brands created before 0015 have no column value at all. Treating the
    // absence as "done" keeps an existing account out of the wizard.
    setupComplete: row.setup_complete ?? true,
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
    taxFormSubmittedAt: row.tax_form_submitted_at ?? undefined,
    taxLegalName: row.tax_legal_name ?? undefined,
    taxEntityType: row.tax_entity_type ?? undefined,
    taxCountry: row.tax_country ?? undefined,
    payoutMethod: row.payout_method ?? undefined,
    payoutBankName: row.payout_bank_name ?? undefined,
    payoutBankLast4: row.payout_bank_last4 ?? undefined,
    payoutUpdatedAt: row.payout_updated_at ?? undefined,
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
export async function getMyBrand(preferredId?: string | null): Promise<Result<Brand | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return ok(null);

    // Every brand the user owns, oldest first. Fetching the list rather than
    // one row is what lets the switcher honour a chosen brand without a
    // second round trip, and a preferred id that no longer exists (deleted,
    // or belonged to another login) falls back instead of erroring.
    const { data, error } = await sb
      .from('brands')
      .select('*')
      .eq('owner_user_id', uid)
      .order('created_at', { ascending: true });

    if (error) return fail(null, describeError(error, 'Could not load your brand.'));

    const rows = (data ?? []) as BrandRow[];
    if (rows.length === 0) return ok(null);

    const chosen = preferredId ? rows.find((r) => r.id === preferredId) : undefined;
    return ok(toBrand(chosen ?? rows[0]));
  } catch (e) {
    return fail(null, describeError(e, 'Could not load your brand.'));
  }
}

/** Every brand the signed-in user owns, for the switcher. */
export async function listMyBrands(): Promise<Result<Brand[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return ok([]);
    const { data, error } = await sb
      .from('brands')
      .select('*')
      .eq('owner_user_id', uid)
      .order('created_at', { ascending: true });
    if (error) return fail([], describeError(error, 'Could not load your brands.'));
    return ok((data ?? []).map((r) => toBrand(r as BrandRow)));
  } catch (e) {
    return fail([], describeError(e, 'Could not load your brands.'));
  }
}

/**
 * Start a second (or third) brand.
 *
 * Created deliberately incomplete: `setup_complete` stays false so the wizard
 * runs for it, which is where the name, logo and connections actually get
 * filled in.
 */
export async function createAnotherBrand(name: string): Promise<Result<Brand | null>> {
  const sb = client();
  if (!sb) return ok(null);

  const clean = name.trim();
  if (!clean) return fail(null, 'Give the brand a name.');

  try {
    const { data: auth } = await sb.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return fail(null, 'No active session.');

    const base = slugify(clean);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const handle = attempt === 0 ? base : `${base}-${suffix()}`;
      const { data, error } = await sb
        .from('brands')
        .insert({
          owner_user_id: uid,
          name: clean,
          handle,
          approval_status: 'pending',
          setup_complete: false,
        })
        .select()
        .single();

      if (!error) return ok(toBrand(data as BrandRow));
      // Unique violation on handle: try again with a suffix.
      if ((error as { code?: string }).code !== '23505') {
        return fail(null, describeError(error, 'Could not create that brand.'));
      }
    }
    return fail(null, 'Could not find a free handle for that name. Try a different one.');
  } catch (e) {
    return fail(null, describeError(e, 'Could not create that brand.'));
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
  preferredId?: string | null;
}): Promise<Result<Brand | null>> {
  const existing = await getMyBrand(opts?.preferredId);
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

    const [submissionsRes, applicationsRes, earningsRes] = await Promise.all([
      sb
        .from('submissions')
        .select('campaign_id, creator_id, orders, impressions, spend_cents')
        .in('campaign_id', ids),
      sb
        .from('applications')
        .select('campaign_id, creator_id')
        .in('campaign_id', ids)
        .eq('status', 'accepted'),
      // Orders and commission come from `earnings`, not from the counters on
      // `submissions`. Those counters are only as current as whatever last
      // wrote them, and nothing does — which is how the dashboard could show
      // zero orders while eighteen earning rows existed.
      sb
        .from('earnings')
        .select('campaign_id, commission_cents')
        .in('campaign_id', ids)
        .neq('state', 'reversed'),
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
      // Impressions still come from here: they are Meta's number, and no
      // earning row carries them.
      stats.impressions += s.impressions ?? 0;
      byCampaign.set(s.campaign_id, stats);
      touchCreator(s.campaign_id, s.creator_id);
    }

    for (const e of (earningsRes.data ?? []) as Array<{ campaign_id: string; commission_cents: number }>) {
      const stats = byCampaign.get(e.campaign_id) ?? { ...EMPTY_STATS };
      stats.orders += 1;
      stats.spentCents += e.commission_cents;
      byCampaign.set(e.campaign_id, stats);
    }

    for (const a of applications) touchCreator(a.campaign_id, a.creator_id);

    return ok(
      rows.map((row) => {
        const stats = byCampaign.get(row.id) ?? { ...EMPTY_STATS };
        stats.creators = creatorsByCampaign.get(row.id)?.size ?? 0;
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

/* ─────────────────────────────────────────────────────────────
   Creator: campaigns, submissions, payout details
   ───────────────────────────────────────────────────────────── */

export interface OpenCampaign {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  status: string;
  coverUrl: string | null;
  deliverableSpec: string | null;
  /** What the brand wrote about the campaign. Shown before a creator applies. */
  brief: string | null;
  /** Commission the creator earns on an attributed order, in basis points. */
  commissionBps: number | null;
  /** Days an earning sits in `clearing` before it can be withdrawn. */
  clearingDays: number | null;
  /** What the video should feel like, as opposed to what format it is. */
  contentStyle: string | null;
  brandLogoUrl: string | null;
}

/**
 * Campaigns a creator may upload a video to.
 *
 * Deliberately NOT just `live`. Under the no-approval-gate model a creator
 * should be able to make work for a campaign a brand is still setting up;
 * the brand decides later what they actually run. Gating on `live` alone made
 * the picker permanently empty, because nothing sets a campaign live.
 *
 * Excluded: paused, complete and archived. Those are campaigns the brand has
 * stopped, and taking uploads for them would waste a creator's time.
 *
 * Narrowing this further to campaigns the creator has an accepted application
 * for is the right end state. Applications have no UI yet, so gating on them
 * today would reproduce the empty list this fixes.
 */
export async function listCampaignsOpenToCreators(): Promise<Result<OpenCampaign[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('campaigns')
      .select(
        'id, name, brand_id, status, cover_url, deliverable_spec, brief, content_style, commission_rate_bps, clearing_days, brands(name, logo_url)'
      )
      .in('status', ['live', 'pending_fund', 'draft'])
      .order('created_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load campaigns.'));

    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      brand_id: string;
      status: string;
      cover_url: string | null;
      deliverable_spec: string | null;
      brief: string | null;
      content_style: string | null;
      commission_rate_bps: number | null;
      clearing_days: number | null;
      brands: { name: string; logo_url: string | null } | { name: string; logo_url: string | null }[] | null;
    }>;

    return ok(
      rows
        .map((r) => {
          const brand = Array.isArray(r.brands) ? r.brands[0] : r.brands;
          return {
            id: r.id,
            name: r.name,
            brandId: r.brand_id,
            brandName: (brand?.name ?? '').trim(),
            status: r.status,
            coverUrl: r.cover_url,
            deliverableSpec: r.deliverable_spec,
            brief: r.brief,
            contentStyle: r.content_style,
            brandLogoUrl: brand?.logo_url ?? null,
            commissionBps: r.commission_rate_bps,
            clearingDays: r.clearing_days,
          };
        })
        // A campaign whose brand we cannot name is not something a creator can
        // make a decision about. It happens when the brand row is outside what
        // RLS lets this creator read, or when a campaign was created before its
        // brand existed. Either way, showing it as "Unknown brand" asks the
        // creator to gamble, so it does not go in the list at all.
        .filter((c) => c.brandName.length > 0)
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load campaigns.'));
  }
}

/**
 * What a creator cares about, which is not the raw status enum.
 *
 * Six database statuses collapse into three answers: has the brand used this,
 * have they passed on it, or have they not looked yet.
 */
export type UsageState = 'in_use' | 'not_used' | 'awaiting';

export function usageStateFor(status: string): UsageState {
  if (status === 'approved' || status === 'live') return 'in_use';
  if (status === 'rejected' || status === 'revision_requested') return 'not_used';
  return 'awaiting';
}

export interface MySubmission {
  id: string;
  campaignId: string;
  campaignName: string;
  brandName: string;
  status: string;
  usage: UsageState;
  brandNote: string | null;
  decidedAt: string | null;
  videoUrl: string | null;
  trackingToken: string | null;
  submittedAt: string;
  /** A frame from the video itself, when there is one. */
  thumbnailUrl: string | null;
  /** The campaign's product image. The fallback when there is no frame. */
  coverUrl: string | null;
}

export async function listMySubmissions(creatorId: string): Promise<Result<MySubmission[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('submissions')
      .select(
        'id, campaign_id, status, brand_note, decided_at, video_url, thumbnail_url, tracking_token, submitted_at, campaigns(name, cover_url, brands(name))'
      )
      .eq('creator_id', creatorId)
      .order('submitted_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load your submissions.'));

    const rows = (data ?? []) as Array<{
      id: string;
      campaign_id: string;
      status: string;
      brand_note: string | null;
      decided_at: string | null;
      video_url: string | null;
      thumbnail_url: string | null;
      tracking_token: string | null;
      submitted_at: string;
      campaigns:
        | { name: string; cover_url: string | null; brands: { name: string } | { name: string }[] | null }
        | Array<{ name: string; cover_url: string | null; brands: { name: string } | { name: string }[] | null }>
        | null;
    }>;

    return ok(
      rows.map((r) => {
        const campaign = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
        const brand = Array.isArray(campaign?.brands) ? campaign?.brands[0] : campaign?.brands;
        return {
          id: r.id,
          campaignId: r.campaign_id,
          campaignName: campaign?.name ?? 'Campaign',
          brandName: brand?.name ?? '',
          status: r.status,
          usage: usageStateFor(r.status),
          brandNote: r.brand_note,
          decidedAt: r.decided_at,
          videoUrl: r.video_url,
          trackingToken: r.tracking_token ?? null,
          submittedAt: r.submitted_at,
          thumbnailUrl: r.thumbnail_url,
          coverUrl: campaign?.cover_url ?? null,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your submissions.'));
  }
}

/**
 * Record a submitted video.
 *
 * Called after the file is already in storage. The row carries brand_id as
 * well as campaign_id because RLS and the attribution join both read it, and
 * deriving it later would mean a second query on every read.
 */
export async function createSubmission(input: {
  campaignId: string;
  creatorId: string;
  brandId: string;
  videoUrl: string;
}): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('submissions')
      .insert({
        campaign_id: input.campaignId,
        creator_id: input.creatorId,
        brand_id: input.brandId,
        video_url: input.videoUrl,
        status: 'submitted',
      })
      .select('id')
      .single();

    if (error) return fail(null, describeError(error, 'Could not save your submission.'));
    return ok((data as { id: string }).id);
  } catch (e) {
    return fail(null, describeError(e, 'Could not save your submission.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Brand: reviewing what creators submitted
   ───────────────────────────────────────────────────────────── */

export interface CampaignSubmission {
  id: string;
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorHandle: string;
  status: string;
  usage: UsageState;
  brandNote: string | null;
  decidedAt: string | null;
  videoUrl: string | null;
  submittedAt: string;
  /** A frame from the video, when there is one. */
  thumbnailUrl: string | null;
  /** The campaign's product image — the fallback when there is no frame. */
  coverUrl: string | null;
}

/** Every video submitted across this brand's campaigns, newest first. */
export async function listSubmissionsForBrand(brandId: string): Promise<Result<CampaignSubmission[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('submissions')
      .select('id, campaign_id, creator_id, status, brand_note, decided_at, video_url, thumbnail_url, submitted_at, campaigns(name, cover_url), creators(handle)')
      .eq('brand_id', brandId)
      .order('submitted_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load submissions.'));

    const rows = (data ?? []) as Array<{
      id: string;
      campaign_id: string;
      creator_id: string;
      status: string;
      brand_note: string | null;
      decided_at: string | null;
      video_url: string | null;
      thumbnail_url: string | null;
      submitted_at: string;
      campaigns: { name: string; cover_url: string | null } | { name: string; cover_url: string | null }[] | null;
      creators: { handle: string | null } | { handle: string | null }[] | null;
    }>;

    return ok(
      rows.map((r) => {
        const campaign = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
        const creator = Array.isArray(r.creators) ? r.creators[0] : r.creators;
        return {
          id: r.id,
          campaignId: r.campaign_id,
          campaignName: campaign?.name ?? 'Campaign',
          creatorId: r.creator_id,
          creatorHandle: creator?.handle ?? 'creator',
          status: r.status,
          usage: usageStateFor(r.status),
          brandNote: r.brand_note,
          decidedAt: r.decided_at,
          videoUrl: r.video_url,
          submittedAt: r.submitted_at,
          thumbnailUrl: r.thumbnail_url,
          coverUrl: campaign?.cover_url ?? null,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load submissions.'));
  }
}

/**
 * Record whether a brand is using a video.
 *
 * A pass REQUIRES a note. That is deliberate and enforced here rather than
 * only in the form: the entire reason creators tolerate uploading without an
 * approval gate is that they find out why something did not run and what to
 * make next. A silent rejection puts them back where they started.
 */
export async function setSubmissionUsage(
  submissionId: string,
  usage: 'in_use' | 'not_used',
  note?: string
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);

  const trimmed = (note ?? '').trim();
  if (usage === 'not_used' && trimmed.length < 10) {
    return fail(false, 'Tell the creator why, and what you want in the next video. At least a sentence.');
  }

  try {
    const { error } = await sb
      .from('submissions')
      .update({
        status: usage === 'in_use' ? 'live' : 'rejected',
        brand_note: trimmed || null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    if (error) return fail(false, describeError(error, 'Could not save that decision.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save that decision.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Applications — creators joining campaigns
   ───────────────────────────────────────────────────────────── */

export interface MyApplication {
  id: string;
  campaignId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
}

/** The creator's own applications, keyed by campaign for quick lookup. */
export async function listMyApplications(creatorId: string): Promise<Result<MyApplication[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('applications')
      .select('id, campaign_id, status, created_at')
      .eq('creator_id', creatorId);

    if (error) return fail([], describeError(error, 'Could not load your applications.'));
    return ok(
      (data ?? []).map((r) => {
        const row = r as { id: string; campaign_id: string; status: MyApplication['status']; created_at: string };
        return { id: row.id, campaignId: row.campaign_id, status: row.status, createdAt: row.created_at };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your applications.'));
  }
}

/**
 * Apply to a campaign.
 *
 * `applications` has a unique constraint on (campaign_id, creator_id), so a
 * double click or a second visit upserts rather than erroring. Re-applying
 * after a decline deliberately resets to pending: a creator who has since
 * changed their work should not be locked out by an old no.
 */
export async function applyToCampaign(
  campaignId: string,
  creatorId: string,
  message?: string
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb.from('applications').upsert(
      {
        campaign_id: campaignId,
        creator_id: creatorId,
        status: 'pending',
        intake_path: 'marketplace',
        message: (message ?? '').trim() || null,
      },
      { onConflict: 'campaign_id,creator_id' }
    );
    if (error) return fail(false, describeError(error, 'Could not send your application.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not send your application.'));
  }
}

export interface BrandApplication {
  id: string;
  campaignId: string;
  campaignName: string;
  creatorId: string;
  creatorHandle: string;
  creatorNiche: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  message: string | null;
  createdAt: string;
}

/** Applications across all of a brand's campaigns. */
export async function listApplicationsForBrand(brandId: string): Promise<Result<BrandApplication[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data: campaigns, error: campaignError } = await sb
      .from('campaigns')
      .select('id, name')
      .eq('brand_id', brandId);

    if (campaignError) return fail([], describeError(campaignError, 'Could not load your campaigns.'));

    const names = new Map((campaigns ?? []).map((c) => [(c as { id: string }).id, (c as { name: string }).name]));
    if (names.size === 0) return ok([]);

    const { data, error } = await sb
      .from('applications')
      .select('id, campaign_id, creator_id, status, message, created_at, creators(handle, niche)')
      .in('campaign_id', [...names.keys()])
      .order('created_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load applications.'));

    const rows = (data ?? []) as Array<{
      id: string;
      campaign_id: string;
      creator_id: string;
      status: BrandApplication['status'];
      message: string | null;
      created_at: string;
      creators: { handle: string | null; niche: string[] | null } | Array<{ handle: string | null; niche: string[] | null }> | null;
    }>;

    return ok(
      rows.map((r) => {
        const creator = Array.isArray(r.creators) ? r.creators[0] : r.creators;
        return {
          id: r.id,
          campaignId: r.campaign_id,
          campaignName: names.get(r.campaign_id) ?? 'Campaign',
          creatorId: r.creator_id,
          creatorHandle: creator?.handle ?? 'creator',
          creatorNiche: creator?.niche ?? [],
          status: r.status,
          message: r.message,
          createdAt: r.created_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load applications.'));
  }
}

/** Accept or decline a creator onto a campaign. */
export async function setApplicationStatus(
  applicationId: string,
  status: 'accepted' | 'rejected'
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb.from('applications').update({ status }).eq('id', applicationId);
    if (error) return fail(false, describeError(error, 'Could not save that decision.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save that decision.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Creator tax details
   ───────────────────────────────────────────────────────────── */

export interface TaxDetailsInput {
  legalName: string;
  entityType: 'individual' | 'business';
  address: string;
  country: string;
}

/**
 * Save the tax details KYRO is allowed to hold.
 *
 * Status moves to `pending`, never straight to `complete`. The form is not
 * finished until the payout provider has collected the SSN or EIN, which
 * happens outside KYRO, so calling it complete here would tell a creator they
 * can withdraw when they cannot.
 */
export async function saveTaxDetails(
  creatorId: string,
  input: TaxDetailsInput
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);

  if (!input.legalName.trim()) return fail(false, 'Enter your full legal name.');
  if (!input.address.trim()) return fail(false, 'Enter your address.');
  if (!input.country.trim()) return fail(false, 'Enter your country.');

  try {
    const { error } = await sb
      .from('creators')
      .update({
        tax_legal_name: input.legalName.trim(),
        tax_entity_type: input.entityType,
        tax_address: input.address.trim(),
        tax_country: input.country.trim(),
        tax_form_status: 'pending',
        tax_form_submitted_at: new Date().toISOString(),
      })
      .eq('id', creatorId);

    if (error) return fail(false, describeError(error, 'Could not save your tax details.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save your tax details.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Campaign roster — who is on a campaign
   ───────────────────────────────────────────────────────────── */

export interface RosterCreator {
  applicationId: string;
  creatorId: string;
  handle: string;
  niche: string[];
  instagramFollowers: number | null;
  tiktokFollowers: number | null;
  joinedAt: string;
  submissions: number;
}

/**
 * Accepted creators on a brand's campaigns, with how many videos each has
 * posted. Answers the question a brand actually asks, which is "who is
 * working on this and are they producing", not "who applied".
 */
export async function listRosterForBrand(brandId: string): Promise<Result<Record<string, RosterCreator[]>>> {
  const sb = client();
  if (!sb) return ok({});
  try {
    const { data: campaigns, error: cErr } = await sb
      .from('campaigns')
      .select('id, name')
      .eq('brand_id', brandId);
    if (cErr) return fail({}, describeError(cErr, 'Could not load your campaigns.'));

    const ids = (campaigns ?? []).map((c) => (c as { id: string }).id);
    if (ids.length === 0) return ok({});

    const [appsRes, subsRes] = await Promise.all([
      sb.from('applications')
        .select('id, campaign_id, creator_id, created_at, creators(handle, niche, instagram_followers, tiktok_followers)')
        .in('campaign_id', ids)
        .eq('status', 'accepted'),
      sb.from('submissions').select('campaign_id, creator_id').in('campaign_id', ids),
    ]);

    if (appsRes.error) return fail({}, describeError(appsRes.error, 'Could not load the roster.'));

    // Count submissions in memory rather than per creator, to keep this to
    // two queries no matter how large the roster gets.
    const counts = new Map<string, number>();
    for (const r of (subsRes.data ?? []) as Array<{ campaign_id: string; creator_id: string }>) {
      const key = `${r.campaign_id}:${r.creator_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const out: Record<string, RosterCreator[]> = {};
    for (const r of (appsRes.data ?? []) as Array<{
      id: string; campaign_id: string; creator_id: string; created_at: string;
      creators: { handle: string | null; niche: string[] | null; instagram_followers: number | null; tiktok_followers: number | null } | Array<{ handle: string | null; niche: string[] | null; instagram_followers: number | null; tiktok_followers: number | null }> | null;
    }>) {
      const c = Array.isArray(r.creators) ? r.creators[0] : r.creators;
      (out[r.campaign_id] ||= []).push({
        applicationId: r.id,
        creatorId: r.creator_id,
        handle: c?.handle ?? 'creator',
        niche: c?.niche ?? [],
        instagramFollowers: c?.instagram_followers ?? null,
        tiktokFollowers: c?.tiktok_followers ?? null,
        joinedAt: r.created_at,
        submissions: counts.get(`${r.campaign_id}:${r.creator_id}`) ?? 0,
      });
    }
    return ok(out);
  } catch (e) {
    return fail({}, describeError(e, 'Could not load the roster.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Creator earnings
   ───────────────────────────────────────────────────────────── */

export interface EarningsPoint {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  cents: Cents;
}

export interface CreatorEarnings {
  windowDays: number;
  /** Total earned inside the window. Not the lifetime total. */
  windowCents: Cents;
  /** One entry per day in the window, zero-filled. */
  series: EarningsPoint[];
  pendingCents: Cents;
  clearingCents: Cents;
  availableCents: Cents;
  paidCents: Cents;
  /**
   * The same four buckets, but counting only earnings created inside the
   * selected window. The lifetime figures above are what a payout is made
   * against; these are what answers "how did the last 30 days go", which is
   * the question the 7/30/90 selector is actually asking.
   */
  windowPendingCents: Cents;
  windowClearingCents: Cents;
  windowAvailableCents: Cents;
  windowPaidCents: Cents;
  /** Soonest available_at still in the future, or null. */
  nextClearsAt: string | null;
}

const emptyEarnings = (windowDays: number): CreatorEarnings => ({
  windowDays,
  windowCents: 0,
  series: [],
  pendingCents: 0,
  clearingCents: 0,
  availableCents: 0,
  paidCents: 0,
  windowPendingCents: 0,
  windowClearingCents: 0,
  windowAvailableCents: 0,
  windowPaidCents: 0,
  nextClearsAt: null,
});

/**
 * Daily earnings for the chart, plus the balance breakdown.
 *
 * Aggregated in memory rather than with a grouped query, matching how
 * listCampaignsWithStats works: two flat reads beat a round trip per day, and
 * a creator's earning rows inside a 90-day window are not numerous.
 *
 * The series is zero-filled across every day in the window. A bar chart that
 * silently omits empty days compresses the gaps and misstates the trend.
 */
export async function getCreatorEarnings(
  creatorId: string,
  windowDays = 30
): Promise<Result<CreatorEarnings>> {
  const sb = client();
  if (!sb) return ok(emptyEarnings(windowDays));

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));

  try {
    const [earningsRes, balanceRes] = await Promise.all([
      sb
        .from('earnings')
        .select('commission_cents, state, available_at, created_at')
        .eq('creator_id', creatorId)
        .neq('state', 'reversed')
        .gte('created_at', since.toISOString()),
      sb.from('creator_balances').select('*').eq('creator_id', creatorId).maybeSingle(),
    ]);

    if (earningsRes.error) {
      return fail(emptyEarnings(windowDays), describeError(earningsRes.error, 'Could not load your earnings.'));
    }

    const rows = (earningsRes.data ?? []) as Array<{
      commission_cents: number;
      state: string;
      available_at: string | null;
      created_at: string;
    }>;

    const byDay = new Map<string, number>();
    let windowCents = 0;
    let nextClearsAt: string | null = null;
    const now = Date.now();
    const inWindow = { pending: 0, clearing: 0, available: 0, paid: 0 };

    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.commission_cents);
      windowCents += r.commission_cents;
      if (r.state in inWindow) {
        inWindow[r.state as keyof typeof inWindow] += r.commission_cents;
      }
      if (r.available_at && Date.parse(r.available_at) > now) {
        if (!nextClearsAt || Date.parse(r.available_at) < Date.parse(nextClearsAt)) {
          nextClearsAt = r.available_at;
        }
      }
    }

    const series: EarningsPoint[] = [];
    for (let i = 0; i < windowDays; i += 1) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, cents: byDay.get(key) ?? 0 });
    }

    const bal = (balanceRes.data ?? {}) as Record<string, number>;

    return ok({
      windowDays,
      windowCents,
      series,
      pendingCents: bal.pending_cents ?? 0,
      clearingCents: bal.clearing_cents ?? 0,
      availableCents: bal.available_cents ?? 0,
      paidCents: bal.paid_cents ?? 0,
      windowPendingCents: inWindow.pending,
      windowClearingCents: inWindow.clearing,
      windowAvailableCents: inWindow.available,
      windowPaidCents: inWindow.paid,
      nextClearsAt,
    });
  } catch (e) {
    return fail(emptyEarnings(windowDays), describeError(e, 'Could not load your earnings.'));
  }
}

export interface CreatorOrderRow {
  earningId: string;
  orderNumber: string | null;
  campaignName: string;
  brandName: string;
  placedAt: string;
  /** Order value the commission was calculated on. */
  commissionableCents: Cents;
  commissionBps: number;
  commissionCents: Cents;
  state: string;
  availableAt: string | null;
}

/**
 * Every attributed order behind a creator's balance, newest first.
 *
 * Creators do not trust a single balance figure, and they are right not to.
 * This is the itemised version: which order, from which campaign, what it was
 * worth, what rate applied, and when it clears.
 */
export async function listCreatorOrders(
  creatorId: string,
  limit = 500
): Promise<Result<CreatorOrderRow[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('earnings')
      .select(
        'id, commissionable_cents, commission_bps, commission_cents, state, available_at, created_at, orders(external_number, placed_at), campaigns(name), brands(name)'
      )
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return fail([], describeError(error, 'Could not load your orders.'));

    const rows = (data ?? []) as Array<{
      id: string;
      commissionable_cents: number;
      commission_bps: number;
      commission_cents: number;
      state: string;
      available_at: string | null;
      created_at: string;
      orders: { external_number: string | null; placed_at: string } | Array<{ external_number: string | null; placed_at: string }> | null;
      campaigns: { name: string } | Array<{ name: string }> | null;
      brands: { name: string } | Array<{ name: string }> | null;
    }>;

    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

    return ok(
      rows.map((r) => {
        const order = one(r.orders);
        return {
          earningId: r.id,
          orderNumber: order?.external_number ?? null,
          campaignName: one(r.campaigns)?.name ?? 'Campaign',
          brandName: one(r.brands)?.name ?? '',
          placedAt: order?.placed_at ?? r.created_at,
          commissionableCents: r.commissionable_cents,
          commissionBps: r.commission_bps,
          commissionCents: r.commission_cents,
          state: r.state,
          availableAt: r.available_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your orders.'));
  }
}

/** Point a campaign at its cover image. */
export async function setCampaignCover(campaignId: string, coverUrl: string): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb.from('campaigns').update({ cover_url: coverUrl }).eq('id', campaignId);
    if (error) return fail(false, describeError(error, 'Could not save the cover image.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save the cover image.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Submission detail + payouts
   ───────────────────────────────────────────────────────────── */

export interface SubmissionDetail {
  orders: number;
  revenueCents: Cents;
  commissionCents: Cents;
  impressions: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

/**
 * Performance of a single video.
 *
 * Computed from `earnings`, not from the denormalised counters on
 * `submissions`. Those counters are only as fresh as whatever last wrote
 * them; the earnings rows are the thing the creator is actually paid on, so
 * they are the honest source.
 */
export async function getSubmissionDetail(submissionId: string): Promise<Result<SubmissionDetail>> {
  const empty: SubmissionDetail = {
    orders: 0, revenueCents: 0, commissionCents: 0,
    impressions: 0, firstOrderAt: null, lastOrderAt: null,
  };
  const sb = client();
  if (!sb) return ok(empty);

  try {
    const [earn, sub] = await Promise.all([
      sb.from('earnings')
        .select('commissionable_cents, commission_cents, created_at')
        .eq('submission_id', submissionId)
        .neq('state', 'reversed'),
      sb.from('submissions').select('impressions').eq('id', submissionId).maybeSingle(),
    ]);

    if (earn.error) return fail(empty, describeError(earn.error, 'Could not load that video.'));

    const rows = (earn.data ?? []) as Array<{
      commissionable_cents: number; commission_cents: number; created_at: string;
    }>;

    let revenue = 0, commission = 0;
    let first: string | null = null, last: string | null = null;
    for (const r of rows) {
      revenue += r.commissionable_cents;
      commission += r.commission_cents;
      if (!first || r.created_at < first) first = r.created_at;
      if (!last || r.created_at > last) last = r.created_at;
    }

    return ok({
      orders: rows.length,
      revenueCents: revenue,
      commissionCents: commission,
      impressions: ((sub.data as { impressions?: number } | null)?.impressions) ?? 0,
      firstOrderAt: first,
      lastOrderAt: last,
    });
  } catch (e) {
    return fail(empty, describeError(e, 'Could not load that video.'));
  }
}

export interface PayoutRow {
  id: string;
  amountCents: Cents;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function listPayouts(creatorId: string): Promise<Result<PayoutRow[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('payouts')
      .select('id, amount_cents, status, period_start, period_end, created_at, completed_at')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load your payouts.'));
    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string; amount_cents: number; status: string;
          period_start: string | null; period_end: string | null;
          created_at: string; completed_at: string | null;
        };
        return {
          id: row.id,
          amountCents: row.amount_cents,
          status: row.status,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your payouts.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Creator social handles + notification preference
   ───────────────────────────────────────────────────────────── */

/**
 * Save the creator's social handles.
 *
 * Instagram is required, and not as profile decoration. Meta partnership ads
 * publish under the creator's own handle, so without it the brand physically
 * cannot run the ad. TikTok is optional: KYRO is Meta plus Shopify, and
 * TikTok Shop is a different product.
 */
export async function saveCreatorSocials(
  creatorId: string,
  input: { instagram: string; tiktok?: string }
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);

  const clean = (v: string | undefined) => (v ?? '').trim().replace(/^@+/, '');
  const ig = clean(input.instagram);
  const tt = clean(input.tiktok);

  if (!ig) return fail(false, 'Instagram is required. Partnership ads run under your handle.');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) return fail(false, 'That Instagram handle does not look right.');
  if (tt && !/^[A-Za-z0-9._]{1,30}$/.test(tt)) return fail(false, 'That TikTok handle does not look right.');

  try {
    const { error } = await sb
      .from('creators')
      .update({
        instagram_handle: `@${ig}`,
        tiktok_handle: tt ? `@${tt}` : null,
      })
      .eq('id', creatorId);
    if (error) return fail(false, describeError(error, 'Could not save your accounts.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save your accounts.'));
  }
}

/** Turn activity email on or off for the signed-in account. */
export async function setEmailNotifications(userId: string, on: boolean): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb.from('profiles').update({ notify_email: on }).eq('id', userId);
    if (error) return fail(false, describeError(error, 'Could not save that preference.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save that preference.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Campaign products

   What a creator would actually be selling. Filled in by the brand today,
   shaped so a Shopify product sync can write the same rows later without the
   read path changing.
   ───────────────────────────────────────────────────────────── */

export interface CampaignProduct {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: Cents | null;
  externalUrl: string | null;
}

export async function listCampaignProducts(campaignId: string): Promise<Result<CampaignProduct[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('campaign_products')
      .select('id, campaign_id, name, description, image_url, price_cents, external_url')
      .eq('campaign_id', campaignId)
      .order('position', { ascending: true });

    if (error) return fail([], describeError(error, 'Could not load the products.'));

    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string;
          campaign_id: string;
          name: string;
          description: string | null;
          image_url: string | null;
          price_cents: number | null;
          external_url: string | null;
        };
        return {
          id: row.id,
          campaignId: row.campaign_id,
          name: row.name,
          description: row.description,
          imageUrl: row.image_url,
          priceCents: row.price_cents,
          externalUrl: row.external_url,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load the products.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Chat

   Two thread shapes, deliberately different:

     campaign   — the brand and every accepted creator, together
     submission — one creator and the brand, about one video

   Both are reached through database functions rather than direct inserts.
   Membership is checked server side, so a thread id guessed by a client is
   worth nothing.
   ───────────────────────────────────────────────────────────── */

export type ThreadKind = 'campaign' | 'submission';

export interface ThreadSummary {
  id: string;
  kind: ThreadKind;
  campaignId: string;
  campaignName: string;
  brandName: string;
  submissionId: string | null;
  lastBody: string | null;
  lastSender: string | null;
  lastAt: string | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  senderName: string;
  senderRole: string | null;
  body: string;
  createdAt: string;
}

/** Every thread the signed-in user can see, newest activity first. */
export async function listMyThreads(): Promise<Result<ThreadSummary[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb.rpc('my_threads');
    if (error) return fail([], describeError(error, 'Could not load your messages.'));

    return ok(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.thread_id as string,
        kind: r.kind as ThreadKind,
        campaignId: r.campaign_id as string,
        campaignName: (r.campaign_name as string) ?? 'Campaign',
        brandName: (r.brand_name as string) ?? '',
        submissionId: (r.submission_id as string | null) ?? null,
        lastBody: (r.last_body as string | null) ?? null,
        lastSender: (r.last_sender as string | null) ?? null,
        lastAt: (r.last_at as string | null) ?? null,
        unread: Number(r.unread ?? 0),
      }))
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your messages.'));
  }
}

/** The shared thread for a campaign, created on first open. */
export async function openCampaignThread(campaignId: string): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb.rpc('campaign_thread', { p_campaign_id: campaignId });
    if (error) return fail(null, describeError(error, 'Could not open that conversation.'));
    return ok((data as string) ?? null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not open that conversation.'));
  }
}

/** The private thread with the brand about one video. */
export async function openSubmissionThread(submissionId: string): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb.rpc('submission_thread', { p_submission_id: submissionId });
    if (error) return fail(null, describeError(error, 'Could not open that conversation.'));
    return ok((data as string) ?? null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not open that conversation.'));
  }
}

export async function listMessages(threadId: string, limit = 200): Promise<Result<ChatMessage[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('messages')
      .select('id, thread_id, sender_user_id, sender_name, sender_role, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return fail([], describeError(error, 'Could not load the conversation.'));

    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string;
          thread_id: string;
          sender_user_id: string;
          sender_name: string;
          sender_role: string | null;
          body: string;
          created_at: string;
        };
        return {
          id: row.id,
          threadId: row.thread_id,
          senderUserId: row.sender_user_id,
          senderName: row.sender_name,
          senderRole: row.sender_role,
          body: row.body,
          createdAt: row.created_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load the conversation.'));
  }
}

/**
 * Send a message.
 *
 * Only the thread and the body go over the wire. Who sent it, under what name
 * and in what role is stamped by a database trigger from the session, so a
 * creator cannot post as the brand by editing a payload.
 */
export async function sendMessage(threadId: string, body: string): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);

  const text = body.trim();
  if (!text) return fail(false, 'Write something first.');
  if (text.length > 4000) return fail(false, 'That message is too long.');

  try {
    const { error } = await sb.from('messages').insert({ thread_id: threadId, body: text });
    if (error) return fail(false, describeError(error, 'Could not send that message.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not send that message.'));
  }
}

/** Clear the unread badge for a thread. Best effort: never blocks reading. */
export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  const sb = client();
  if (!sb) return;
  try {
    await sb
      .from('thread_reads')
      .upsert(
        { thread_id: threadId, user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: 'thread_id,user_id' }
      );
  } catch {
    /* A stale badge is not worth interrupting the conversation over. */
  }
}

/* ─────────────────────────────────────────────────────────────
   Brand setup
   ───────────────────────────────────────────────────────────── */

export interface BrandSetupInput {
  name: string;
  websiteUrl?: string;
  businessType?: string;
  description?: string;
  currency?: string;
  logoUrl?: string | null;
}

/**
 * Save what the setup wizard collected and mark the brand as set up.
 *
 * `setup_complete` is written here rather than inferred from whether the
 * optional fields are filled: a brand who skipped the website step has still
 * finished setup and should not be asked again on every sign-in.
 */
export async function completeBrandSetup(
  brandId: string,
  input: BrandSetupInput
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);

  const name = input.name.trim();
  if (!name) return fail(false, 'Give the brand a name.');

  const site = (input.websiteUrl ?? '').trim();
  if (site && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(site)) {
    return fail(false, 'That website address does not look right. Include https://');
  }

  try {
    const { error } = await sb
      .from('brands')
      .update({
        name,
        website_url: site || null,
        business_type: input.businessType || null,
        description: (input.description ?? '').trim() || null,
        currency: input.currency || 'USD',
        ...(input.logoUrl ? { logo_url: input.logoUrl } : {}),
        setup_complete: true,
      })
      .eq('id', brandId);

    if (error) return fail(false, describeError(error, 'Could not save your brand.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not save your brand.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Brand performance
   ───────────────────────────────────────────────────────────── */

export interface BrandPerformance {
  windowDays: number;
  /** Commission earned by creators in the window — what the brand owes. */
  windowCents: Cents;
  series: EarningsPoint[];
  orders: number;
  revenueCents: Cents;
  /** Distinct creators who drove an order in the window. */
  creators: number;
  /** Distinct videos that drove an order in the window. */
  videos: number;
}

const emptyBrandPerformance = (windowDays: number): BrandPerformance => ({
  windowDays,
  windowCents: 0,
  series: [],
  orders: 0,
  revenueCents: 0,
  creators: 0,
  videos: 0,
});

/**
 * Daily commission across a brand's campaigns, shaped like the creator chart.
 *
 * Same source rows as the creator side reads — `earnings` — so a brand and a
 * creator looking at the same campaign are looking at the same numbers. The
 * series is zero-filled so an empty day is a gap rather than a compression.
 */
export async function getBrandPerformance(
  brandId: string,
  windowDays = 30,
  campaignId?: string | null
): Promise<Result<BrandPerformance>> {
  const sb = client();
  if (!sb) return ok(emptyBrandPerformance(windowDays));

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));

  try {
    let q = sb
      .from('earnings')
      .select('commission_cents, commissionable_cents, creator_id, submission_id, created_at')
      .eq('brand_id', brandId)
      .neq('state', 'reversed')
      .gte('created_at', since.toISOString());

    // Narrowing to one campaign answers "is this one working", which is a
    // different question from "is the account working".
    if (campaignId) q = q.eq('campaign_id', campaignId);

    const { data, error } = await q;

    if (error) {
      return fail(emptyBrandPerformance(windowDays), describeError(error, 'Could not load performance.'));
    }

    const rows = (data ?? []) as Array<{
      commission_cents: number;
      commissionable_cents: number;
      creator_id: string | null;
      submission_id: string | null;
      created_at: string;
    }>;

    const byDay = new Map<string, number>();
    const creators = new Set<string>();
    const videos = new Set<string>();
    let windowCents = 0;
    let revenueCents = 0;

    for (const r of rows) {
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + r.commission_cents);
      windowCents += r.commission_cents;
      revenueCents += r.commissionable_cents;
      if (r.creator_id) creators.add(r.creator_id);
      if (r.submission_id) videos.add(r.submission_id);
    }

    const series: EarningsPoint[] = [];
    for (let i = 0; i < windowDays; i += 1) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, cents: byDay.get(key) ?? 0 });
    }

    return ok({
      windowDays,
      windowCents,
      series,
      orders: rows.length,
      revenueCents,
      creators: creators.size,
      videos: videos.size,
    });
  } catch (e) {
    return fail(emptyBrandPerformance(windowDays), describeError(e, 'Could not load performance.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Campaign invites

   The off-platform path onto a campaign. A brand who already knows the
   creator sends a link; opening it creates an accepted application rather
   than joining the review queue, because the brand has already made that
   decision by sending the link at all.
   ───────────────────────────────────────────────────────────── */

export interface CampaignInvite {
  campaignId: string;
  campaignName: string;
  brandName: string;
  brandLogoUrl: string | null;
  coverUrl: string | null;
  brief: string | null;
  contentStyle: string | null;
  deliverableSpec: string | null;
  commissionBps: number | null;
  clearingDays: number | null;
  status: string;
}

/** Mint or fetch a campaign's invite token. Brand side. */
export async function getCampaignInviteToken(
  campaignId: string,
  rotate = false
): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb.rpc('campaign_invite_token', {
      p_campaign_id: campaignId,
      p_rotate: rotate,
    });
    if (error) return fail(null, describeError(error, 'Could not create an invite link.'));
    return ok((data as string) ?? null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not create an invite link.'));
  }
}

/** What the landing page shows. Works signed out. */
export async function getCampaignByInvite(token: string): Promise<Result<CampaignInvite | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb.rpc('campaign_by_invite', { p_token: token });
    if (error) return fail(null, describeError(error, 'Could not load that invite.'));

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row) return ok(null);

    return ok({
      campaignId: row.campaign_id as string,
      campaignName: (row.campaign_name as string) ?? 'Campaign',
      brandName: (row.brand_name as string) ?? '',
      brandLogoUrl: (row.brand_logo_url as string | null) ?? null,
      coverUrl: (row.cover_url as string | null) ?? null,
      brief: (row.brief as string | null) ?? null,
      contentStyle: (row.content_style as string | null) ?? null,
      deliverableSpec: (row.deliverable_spec as string | null) ?? null,
      commissionBps: (row.commission_bps as number | null) ?? null,
      clearingDays: (row.clearing_days as number | null) ?? null,
      status: (row.status as string) ?? 'draft',
    });
  } catch (e) {
    return fail(null, describeError(e, 'Could not load that invite.'));
  }
}

/** Take the invite. Creator side, requires a signed-in creator account. */
export async function acceptCampaignInvite(token: string): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb.rpc('accept_campaign_invite', { p_token: token });
    if (error) return fail(null, describeError(error, 'Could not join that campaign.'));
    return ok((data as string) ?? null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not join that campaign.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Creator leaderboard
   ───────────────────────────────────────────────────────────── */

export interface LeaderboardCreator {
  creatorId: string;
  handle: string;
  /** Videos this creator has sent this brand, all time. */
  submissions: number;
  /** Of those, how many the brand is running. */
  inUse: number;
  orders: number;
  revenueCents: Cents;
  commissionCents: Cents;
}

/**
 * A brand's creators, ranked by what they actually drove.
 *
 * Submissions come from `submissions` and money from `earnings`, joined in
 * memory. A creator who has sent videos but driven no orders still appears,
 * at the bottom — they are doing the work and the brand should see them,
 * which a query driven off earnings alone would hide.
 */
export async function listBrandLeaderboard(
  brandId: string,
  windowDays = 30
): Promise<Result<LeaderboardCreator[]>> {
  const sb = client();
  if (!sb) return ok([]);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));

  try {
    const [subRes, earnRes] = await Promise.all([
      sb
        .from('submissions')
        .select('id, creator_id, status, creators(handle)')
        .eq('brand_id', brandId),
      sb
        .from('earnings')
        .select('creator_id, commission_cents, commissionable_cents')
        .eq('brand_id', brandId)
        .neq('state', 'reversed')
        .gte('created_at', since.toISOString()),
    ]);

    if (subRes.error) return fail([], describeError(subRes.error, 'Could not load your creators.'));
    if (earnRes.error) return fail([], describeError(earnRes.error, 'Could not load your creators.'));

    const rows = new Map<string, LeaderboardCreator>();
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

    for (const r of (subRes.data ?? []) as Array<{
      id: string;
      creator_id: string;
      status: string;
      creators: { handle: string } | Array<{ handle: string }> | null;
    }>) {
      const entry = rows.get(r.creator_id) ?? {
        creatorId: r.creator_id,
        handle: one(r.creators)?.handle || 'Creator',
        submissions: 0,
        inUse: 0,
        orders: 0,
        revenueCents: 0,
        commissionCents: 0,
      };
      entry.submissions += 1;
      if (usageStateFor(r.status) === 'in_use') entry.inUse += 1;
      rows.set(r.creator_id, entry);
    }

    for (const r of (earnRes.data ?? []) as Array<{
      creator_id: string;
      commission_cents: number;
      commissionable_cents: number;
    }>) {
      const entry = rows.get(r.creator_id) ?? {
        creatorId: r.creator_id,
        handle: 'Creator',
        submissions: 0,
        inUse: 0,
        orders: 0,
        revenueCents: 0,
        commissionCents: 0,
      };
      entry.orders += 1;
      entry.commissionCents += r.commission_cents;
      entry.revenueCents += r.commissionable_cents;
      rows.set(r.creator_id, entry);
    }

    return ok(
      [...rows.values()].sort(
        (a, b) => b.revenueCents - a.revenueCents || b.submissions - a.submissions
      )
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your creators.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Brand drilldowns

   What sits behind each figure on the dashboard. A headline number a brand
   cannot open is a number they have to take on trust.
   ───────────────────────────────────────────────────────────── */

export interface BrandOrderRow {
  earningId: string;
  orderNumber: string | null;
  campaignName: string;
  creatorHandle: string;
  placedAt: string;
  orderValueCents: Cents;
  commissionCents: Cents;
  state: string;
}

/** Every attributed order, newest first. Optionally one campaign's worth. */
export async function listBrandOrders(
  brandId: string,
  campaignId?: string | null,
  limit = 300
): Promise<Result<BrandOrderRow[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    let q = sb
      .from('earnings')
      .select(
        'id, commissionable_cents, commission_cents, state, created_at, orders(external_number, placed_at), campaigns(name), creators(handle)'
      )
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (campaignId) q = q.eq('campaign_id', campaignId);

    const { data, error } = await q;
    if (error) return fail([], describeError(error, 'Could not load your orders.'));

    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string;
          commissionable_cents: number;
          commission_cents: number;
          state: string;
          created_at: string;
          orders: { external_number: string | null; placed_at: string } | Array<{ external_number: string | null; placed_at: string }> | null;
          campaigns: { name: string } | Array<{ name: string }> | null;
          creators: { handle: string } | Array<{ handle: string }> | null;
        };
        const order = one(row.orders);
        return {
          earningId: row.id,
          orderNumber: order?.external_number ?? null,
          campaignName: one(row.campaigns)?.name ?? 'Campaign',
          creatorHandle: one(row.creators)?.handle ?? 'Creator',
          placedAt: order?.placed_at ?? row.created_at,
          orderValueCents: row.commissionable_cents,
          commissionCents: row.commission_cents,
          state: row.state,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your orders.'));
  }
}

export interface CreatorSummary {
  id: string;
  handle: string;
  bio: string | null;
  location: string | null;
  niche: string[];
  instagramHandle: string | null;
  instagramFollowers: number | null;
  tiktokHandle: string | null;
  tiktokFollowers: number | null;
}

/**
 * A creator's profile, for a brand looking at someone already on a campaign.
 *
 * `creators` is readable by any signed-in user, so this needs no special
 * grant — but it deliberately returns nothing from `profiles`, which is
 * private. A brand sees the public creator identity, not the person's email.
 */
export async function getCreatorSummary(creatorId: string): Promise<Result<CreatorSummary | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb
      .from('creators')
      .select('id, handle, bio, location, niche, instagram_handle, instagram_followers, tiktok_handle, tiktok_followers')
      .eq('id', creatorId)
      .maybeSingle();

    if (error) return fail(null, describeError(error, 'Could not load that creator.'));
    if (!data) return ok(null);

    const row = data as {
      id: string;
      handle: string | null;
      bio: string | null;
      location: string | null;
      niche: string[] | null;
      instagram_handle: string | null;
      instagram_followers: number | null;
      tiktok_handle: string | null;
      tiktok_followers: number | null;
    };

    return ok({
      id: row.id,
      handle: row.handle ?? 'creator',
      bio: row.bio,
      location: row.location,
      niche: row.niche ?? [],
      instagramHandle: row.instagram_handle,
      instagramFollowers: row.instagram_followers,
      tiktokHandle: row.tiktok_handle,
      tiktokFollowers: row.tiktok_followers,
    });
  } catch (e) {
    return fail(null, describeError(e, 'Could not load that creator.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Paying creators

   Every figure here is summed from `earnings` rows. Nothing multiplies a
   total by a fee rate: `platform_fee_cents` is written per earning when the
   order lands, so a change to the fee rule later cannot retroactively rewrite
   what a brand was charged.
   ───────────────────────────────────────────────────────────── */

export interface BrandBalance {
  /** Cleared and payable now. */
  dueCommissionCents: Cents;
  dueFeeCents: Cents;
  dueOrders: number;
  dueCreators: number;
  /** Fulfilled but still inside the clearing window. */
  clearingCommissionCents: Cents;
  clearingOrders: number;
  /** Ordered but not fulfilled yet. */
  pendingCommissionCents: Cents;
  pendingOrders: number;
  /** Everything already paid out, all time. */
  paidCommissionCents: Cents;
  paidFeeCents: Cents;
  /** Soonest clearing earning, so the page can say when more is due. */
  nextDueAt: string | null;
}

const emptyBalance = (): BrandBalance => ({
  dueCommissionCents: 0, dueFeeCents: 0, dueOrders: 0, dueCreators: 0,
  clearingCommissionCents: 0, clearingOrders: 0,
  pendingCommissionCents: 0, pendingOrders: 0,
  paidCommissionCents: 0, paidFeeCents: 0,
  nextDueAt: null,
});

export async function getBrandBalance(brandId: string): Promise<Result<BrandBalance>> {
  const sb = client();
  if (!sb) return ok(emptyBalance());
  try {
    const { data, error } = await sb
      .from('earnings')
      .select('commission_cents, platform_fee_cents, state, available_at, creator_id')
      .eq('brand_id', brandId)
      .neq('state', 'reversed');

    if (error) return fail(emptyBalance(), describeError(error, 'Could not load your balance.'));

    const out = emptyBalance();
    const dueCreators = new Set<string>();
    const now = Date.now();

    for (const r of (data ?? []) as Array<{
      commission_cents: number;
      platform_fee_cents: number;
      state: string;
      available_at: string | null;
      creator_id: string | null;
    }>) {
      if (r.state === 'available') {
        out.dueCommissionCents += r.commission_cents;
        out.dueFeeCents += r.platform_fee_cents;
        out.dueOrders += 1;
        if (r.creator_id) dueCreators.add(r.creator_id);
      } else if (r.state === 'clearing') {
        out.clearingCommissionCents += r.commission_cents;
        out.clearingOrders += 1;
        if (r.available_at && Date.parse(r.available_at) > now) {
          if (!out.nextDueAt || Date.parse(r.available_at) < Date.parse(out.nextDueAt)) {
            out.nextDueAt = r.available_at;
          }
        }
      } else if (r.state === 'pending') {
        out.pendingCommissionCents += r.commission_cents;
        out.pendingOrders += 1;
      } else if (r.state === 'paid') {
        out.paidCommissionCents += r.commission_cents;
        out.paidFeeCents += r.platform_fee_cents;
      }
    }

    out.dueCreators = dueCreators.size;
    return ok(out);
  } catch (e) {
    return fail(emptyBalance(), describeError(e, 'Could not load your balance.'));
  }
}

export interface CommissionOrderRow {
  earningId: string;
  orderNumber: string | null;
  campaignId: string;
  campaignName: string;
  creatorHandle: string;
  placedAt: string;
  orderValueCents: Cents;
  commissionCents: Cents;
  feeCents: Cents;
  state: string;
  availableAt: string | null;
}

/** Every commission line, for the table a brand pays from. */
export async function listBrandCommissionOrders(
  brandId: string,
  limit = 400
): Promise<Result<CommissionOrderRow[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('earnings')
      .select(
        'id, campaign_id, commissionable_cents, commission_cents, platform_fee_cents, state, available_at, created_at, orders(external_number, placed_at), campaigns(name), creators(handle)'
      )
      .eq('brand_id', brandId)
      .neq('state', 'reversed')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return fail([], describeError(error, 'Could not load your commission.'));

    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string;
          campaign_id: string;
          commissionable_cents: number;
          commission_cents: number;
          platform_fee_cents: number;
          state: string;
          available_at: string | null;
          created_at: string;
          orders: { external_number: string | null; placed_at: string } | Array<{ external_number: string | null; placed_at: string }> | null;
          campaigns: { name: string } | Array<{ name: string }> | null;
          creators: { handle: string } | Array<{ handle: string }> | null;
        };
        const order = one(row.orders);
        return {
          earningId: row.id,
          orderNumber: order?.external_number ?? null,
          campaignId: row.campaign_id,
          campaignName: one(row.campaigns)?.name ?? 'Campaign',
          creatorHandle: one(row.creators)?.handle ?? 'Creator',
          placedAt: order?.placed_at ?? row.created_at,
          orderValueCents: row.commissionable_cents,
          commissionCents: row.commission_cents,
          feeCents: row.platform_fee_cents,
          state: row.state,
          availableAt: row.available_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your commission.'));
  }
}

export interface PaymentRun {
  id: string;
  status: string;
  commissionCents: Cents;
  platformFeeCents: Cents;
  totalCents: Cents;
  orderCount: number;
  creatorCount: number;
  method: string | null;
  authorizedAt: string;
  settledAt: string | null;
}

export async function listPaymentRuns(brandId: string): Promise<Result<PaymentRun[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('payment_runs')
      .select('id, status, commission_cents, platform_fee_cents, total_cents, order_count, creator_count, method, authorized_at, settled_at')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load your payments.'));

    return ok(
      (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          status: row.status as string,
          commissionCents: Number(row.commission_cents ?? 0),
          platformFeeCents: Number(row.platform_fee_cents ?? 0),
          totalCents: Number(row.total_cents ?? 0),
          orderCount: Number(row.order_count ?? 0),
          creatorCount: Number(row.creator_count ?? 0),
          method: (row.method as string | null) ?? null,
          authorizedAt: row.authorized_at as string,
          settledAt: (row.settled_at as string | null) ?? null,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your payments.'));
  }
}

/**
 * Authorise everything currently due.
 *
 * The amount is computed server side, inside the same transaction that marks
 * the earnings paid — a client cannot name its own total, and two clicks
 * cannot pay the same order twice.
 */
export async function authorizePaymentRun(
  brandId: string,
  method: string
): Promise<Result<string | null>> {
  const sb = client();
  if (!sb) return ok(null);
  try {
    const { data, error } = await sb.rpc('authorize_payment_run', {
      p_brand_id: brandId,
      p_method: method,
    });
    if (error) return fail(null, describeError(error, 'Could not authorise that payment.'));
    return ok((data as string) ?? null);
  } catch (e) {
    return fail(null, describeError(e, 'Could not authorise that payment.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   Brand teams

   Stores who has been invited and what they may do. It does not yet grant
   access to brand data — see migration 0020 — so nothing here should be read
   as "this person can now see the brand".
   ───────────────────────────────────────────────────────────── */

export type BrandRole = 'admin' | 'manager' | 'creator_manager' | 'viewer';

export type BrandPermission =
  | 'campaigns.manage'
  | 'creators.manage'
  | 'videos.feedback'
  | 'chat.manage'
  | 'finance.view'
  | 'finance.pay'
  | 'team.manage';

export const BRAND_PERMISSIONS: Array<{ id: BrandPermission; label: string; blurb: string }> = [
  { id: 'campaigns.manage', label: 'Campaigns', blurb: 'Create and edit campaigns' },
  { id: 'creators.manage', label: 'Creator outreach', blurb: 'Review applications and invite creators' },
  { id: 'videos.feedback', label: 'Video notes', blurb: 'Decide what runs and leave feedback' },
  { id: 'chat.manage', label: 'Chat', blurb: 'Message creators and manage rooms' },
  { id: 'finance.view', label: 'See finances', blurb: 'Balances and order history' },
  { id: 'finance.pay', label: 'Pay creators', blurb: 'Approve payment runs' },
  { id: 'team.manage', label: 'Team', blurb: 'Invite and manage teammates' },
];

/** What each role starts with. Individual permissions can still be changed. */
export const ROLE_DEFAULTS: Record<BrandRole, { label: string; blurb: string; permissions: BrandPermission[] }> = {
  admin: {
    label: 'Admin',
    blurb: 'Everything, including paying creators and managing the team',
    permissions: ['campaigns.manage', 'creators.manage', 'videos.feedback', 'chat.manage', 'finance.view', 'finance.pay', 'team.manage'],
  },
  manager: {
    label: 'Manager',
    blurb: 'Runs campaigns day to day, without moving money',
    permissions: ['campaigns.manage', 'creators.manage', 'videos.feedback', 'chat.manage', 'finance.view'],
  },
  creator_manager: {
    label: 'Creator manager',
    blurb: 'Outreach, video notes and chat',
    permissions: ['creators.manage', 'videos.feedback', 'chat.manage'],
  },
  viewer: {
    label: 'Viewer',
    blurb: 'Can look, cannot change anything',
    permissions: ['finance.view'],
  },
};

export interface BrandMember {
  id: string;
  email: string;
  role: BrandRole;
  permissions: BrandPermission[];
  status: 'invited' | 'active' | 'removed';
  createdAt: string;
  acceptedAt: string | null;
}

export async function listBrandMembers(brandId: string): Promise<Result<BrandMember[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('brand_members')
      .select('id, email, role, permissions, status, created_at, accepted_at')
      .eq('brand_id', brandId)
      .neq('status', 'removed')
      .order('created_at', { ascending: true });
    if (error) return fail([], describeError(error, 'Could not load your team.'));
    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string; email: string; role: BrandRole; permissions: BrandPermission[] | null;
          status: BrandMember['status']; created_at: string; accepted_at: string | null;
        };
        return {
          id: row.id,
          email: row.email,
          role: row.role,
          permissions: row.permissions ?? [],
          status: row.status,
          createdAt: row.created_at,
          acceptedAt: row.accepted_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load your team.'));
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteBrandMember(
  brandId: string,
  email: string,
  role: BrandRole,
  permissions: BrandPermission[]
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);

  const clean = email.trim().toLowerCase();
  if (!EMAIL.test(clean)) return fail(false, 'That email address does not look right.');

  try {
    const { data: auth } = await sb.auth.getUser();
    const { error } = await sb.from('brand_members').insert({
      brand_id: brandId,
      email: clean,
      role,
      permissions,
      status: 'invited',
      invited_by: auth.user?.id ?? null,
    });
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return fail(false, 'That person is already on the team or has a pending invite.');
      }
      return fail(false, describeError(error, 'Could not send that invite.'));
    }
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not send that invite.'));
  }
}

export async function updateBrandMember(
  memberId: string,
  patch: { role?: BrandRole; permissions?: BrandPermission[] }
): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb.from('brand_members').update(patch).eq('id', memberId);
    if (error) return fail(false, describeError(error, 'Could not update that teammate.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not update that teammate.'));
  }
}

/** Soft delete, so the history of who had access is kept. */
export async function removeBrandMember(memberId: string): Promise<Result<boolean>> {
  const sb = client();
  if (!sb) return ok(false);
  try {
    const { error } = await sb.from('brand_members').update({ status: 'removed' }).eq('id', memberId);
    if (error) return fail(false, describeError(error, 'Could not remove that teammate.'));
    return ok(true);
  } catch (e) {
    return fail(false, describeError(e, 'Could not remove that teammate.'));
  }
}

/* ─────────────────────────────────────────────────────────────
   A campaign's video library
   ───────────────────────────────────────────────────────────── */

export interface CampaignVideo {
  id: string;
  creatorId: string;
  creatorHandle: string;
  usage: UsageState;
  brandNote: string | null;
  thumbnailUrl: string | null;
  submittedAt: string;
}

/** Every video submitted to one campaign, newest first. */
export async function listCampaignVideos(campaignId: string): Promise<Result<CampaignVideo[]>> {
  const sb = client();
  if (!sb) return ok([]);
  try {
    const { data, error } = await sb
      .from('submissions')
      .select('id, creator_id, status, brand_note, thumbnail_url, submitted_at, creators(handle)')
      .eq('campaign_id', campaignId)
      .order('submitted_at', { ascending: false });

    if (error) return fail([], describeError(error, 'Could not load the videos.'));

    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

    return ok(
      (data ?? []).map((r) => {
        const row = r as {
          id: string;
          creator_id: string;
          status: string;
          brand_note: string | null;
          thumbnail_url: string | null;
          submitted_at: string;
          creators: { handle: string } | Array<{ handle: string }> | null;
        };
        return {
          id: row.id,
          creatorId: row.creator_id,
          creatorHandle: one(row.creators)?.handle ?? 'creator',
          usage: usageStateFor(row.status),
          brandNote: row.brand_note,
          thumbnailUrl: row.thumbnail_url,
          submittedAt: row.submitted_at,
        };
      })
    );
  } catch (e) {
    return fail([], describeError(e, 'Could not load the videos.'));
  }
}
