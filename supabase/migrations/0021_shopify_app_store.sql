-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0021: installing from the Shopify App Store
--
-- Two things the App Store review requires, and that the existing
-- "brand connects its store from inside KYRO" flow cannot provide.
--
-- 1. OAuth before anything else (requirement 2.3.2).
--    A merchant who installs from Shopify must be authenticated before they
--    see any KYRO screen, including sign-up. At that moment there is no KYRO
--    account and no brand to attach the store to. So the token is parked here,
--    keyed by shop, and moved onto the brand once the merchant has signed up.
--    Service role only: no browser can read or write this table.
--
-- 2. No off-platform billing for App Store merchants (requirement 1.2.1).
--    The listing launches free. A brand that arrived through the App Store is
--    marked billing_origin = 'shopify_app_store' and its KYRO fee is zero,
--    enforced by a trigger so no code path can charge it by accident.
--    When Shopify usage billing is added, that is where the fee comes back.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Tokens waiting for a brand ────────────────────────────
create table if not exists public.shopify_pending_installs (
  shop                     text primary key,
  access_token_ct          text not null,
  access_token_iv          text not null,
  access_token_tag         text not null,
  refresh_token_ct         text,
  refresh_token_iv         text,
  refresh_token_tag        text,
  expires_at               timestamptz,
  refresh_token_expires_at timestamptz,
  scopes                   text[] not null default '{}',
  created_at               timestamptz not null default now()
);

alter table public.shopify_pending_installs enable row level security;
-- No policies on purpose. RLS with no policy denies everyone but the
-- service role, and the grants below remove even the attempt.
revoke all on public.shopify_pending_installs from anon, authenticated;

comment on table public.shopify_pending_installs is
  'Shopify tokens from an App Store install, held until the merchant creates a KYRO brand. Service role only. Removed on claim or on shop/redact.';

-- ── 2. Where a brand came from, for billing ──────────────────
alter table public.brands
  add column if not exists billing_origin text not null default 'direct';

do $$ begin
  alter table public.brands
    add constraint brands_billing_origin_valid
    check (billing_origin in ('direct', 'shopify_app_store'));
exception when duplicate_object then null; end $$;

comment on column public.brands.billing_origin is
  'direct: signed up with KYRO and billed by KYRO. shopify_app_store: discovered KYRO on the Shopify App Store, so KYRO may only bill through Shopify. Until Shopify billing exists, that means no KYRO fee.';

-- Brands cannot set this themselves. A column-level revoke would not hold
-- while the table-level update grant exists, so a trigger keeps it: from a
-- browser session the value is pinned, whatever the request says.
create or replace function public.brands_pin_billing_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.billing_origin := 'direct';
    else
      new.billing_origin := old.billing_origin;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists brands_pin_billing_origin on public.brands;
create trigger brands_pin_billing_origin
  before insert or update on public.brands
  for each row execute function public.brands_pin_billing_origin();

-- ── 3. No KYRO fee for App Store brands, enforced ────────────
create or replace function public.campaigns_fee_for_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.brands b
              where b.id = new.brand_id and b.billing_origin = 'shopify_app_store') then
    new.platform_fee_bps := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_fee_for_origin on public.campaigns;
create trigger campaigns_fee_for_origin
  before insert or update of platform_fee_bps, brand_id on public.campaigns
  for each row execute function public.campaigns_fee_for_origin();

create or replace function public.earnings_fee_for_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.brands b
              where b.id = new.brand_id and b.billing_origin = 'shopify_app_store') then
    new.platform_fee_bps := 0;
    new.platform_fee_cents := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists earnings_fee_for_origin on public.earnings;
create trigger earnings_fee_for_origin
  before insert or update of platform_fee_bps, platform_fee_cents on public.earnings
  for each row execute function public.earnings_fee_for_origin();

/**
 * Mark a brand as having arrived through the App Store and zero its fee.
 *
 * Called by /api/shopify/claim with the service role. Not granted to
 * browsers: a brand choosing its own billing origin would be choosing
 * whether it pays.
 */
create or replace function public.apply_app_store_billing(p_brand_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.brands set billing_origin = 'shopify_app_store' where id = p_brand_id;
  update public.campaigns set platform_fee_bps = 0 where brand_id = p_brand_id;
  -- Already-paid rows stay as charged, the same rule as 0019.
  update public.earnings
     set platform_fee_bps = 0, platform_fee_cents = 0
   where brand_id = p_brand_id and state::text <> 'paid';
end;
$$;

revoke all on function public.apply_app_store_billing(uuid) from public, anon, authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'shopify_pending_installs') as pending_installs_table,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'billing_origin') as billing_origin_column,
  (select count(*) from pg_trigger where tgname in ('campaigns_fee_for_origin', 'earnings_fee_for_origin')) as fee_triggers;
