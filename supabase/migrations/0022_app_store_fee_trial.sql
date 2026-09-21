-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0022: App Store brands get a 30-day free trial, not 0% forever
--
-- 0021 set brands that arrive from the Shopify App Store to no KYRO fee,
-- permanently. That undercuts KYRO's pricing, so this replaces it:
--
--   · the fee is waived on orders that land in the brand's first 30 days
--   · after that, the normal 1% of attributed sales applies
--
-- The waiver is decided per order, when the order lands, and stored on the
-- earnings row. So a row that was free stays free, and a row that was
-- charged stays charged, whatever is recalculated later.
--
-- Run in the Supabase SQL editor after 0021. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.brands
  add column if not exists fee_waived_until timestamptz;

comment on column public.brands.fee_waived_until is
  'Orders landing before this time carry no KYRO fee. Set to 30 days after an App Store install is claimed. Null means no trial.';

-- Browsers cannot set their own trial, same as billing_origin.
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
      new.fee_waived_until := null;
    else
      new.billing_origin := old.billing_origin;
      new.fee_waived_until := old.fee_waived_until;
    end if;
  end if;
  return new;
end;
$$;

-- Campaigns keep their normal rate. The trial lives on the order, not the campaign.
drop trigger if exists campaigns_fee_for_origin on public.campaigns;
drop function if exists public.campaigns_fee_for_origin();

-- Any campaign 0021 zeroed goes back to the standard 1%.
update public.campaigns c
   set platform_fee_bps = 100
  from public.brands b
 where b.id = c.brand_id
   and b.billing_origin = 'shopify_app_store'
   and c.platform_fee_bps = 0;

-- Waive the fee only on orders that land inside the trial.
create or replace function public.earnings_fee_for_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.brands b
              where b.id = new.brand_id
                and b.fee_waived_until is not null
                and coalesce(new.created_at, now()) < b.fee_waived_until) then
    new.platform_fee_bps := 0;
    new.platform_fee_cents := 0;
  end if;
  return new;
end;
$$;

-- Called by /api/shopify/claim when an App Store install lands on a new brand.
create or replace function public.apply_app_store_billing(p_brand_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.brands
     set billing_origin = 'shopify_app_store',
         fee_waived_until = coalesce(fee_waived_until, now() + interval '30 days')
   where id = p_brand_id;
end;
$$;

revoke all on function public.apply_app_store_billing(uuid) from public, anon, authenticated;

-- Brands 0021 already marked: trial counted from when the brand was created.
update public.brands
   set fee_waived_until = coalesce(fee_waived_until, created_at + interval '30 days')
 where billing_origin = 'shopify_app_store';

-- Their unpaid orders after the trial get the fee back.
update public.earnings e
   set platform_fee_bps = c.platform_fee_bps,
       platform_fee_cents = floor(e.commissionable_cents * c.platform_fee_bps / 10000.0)::bigint
  from public.brands b, public.campaigns c
 where b.id = e.brand_id
   and c.id = e.campaign_id
   and b.billing_origin = 'shopify_app_store'
   and e.state::text <> 'paid'
   and e.created_at >= b.fee_waived_until;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'fee_waived_until') as trial_column,
  (select count(*) from pg_trigger where tgname = 'campaigns_fee_for_origin') as campaign_trigger_gone,
  (select count(*) from public.brands where billing_origin = 'shopify_app_store') as app_store_brands;
