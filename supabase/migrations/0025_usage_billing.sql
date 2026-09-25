-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0025: reporting the KYRO fee to Shopify
--
-- Brands that arrive through the App Store are billed by Shopify, never by
-- KYRO directly (App Store rule 1.2.1). The plan is configured in the Dev
-- Dashboard as Shopify App Pricing: $0 a month, a 30-day free trial, and one
-- usage meter, `attributed_sales_usd`, priced at $0.01 per unit. One unit is
-- one dollar of attributed sales, so the charge works out to KYRO's 1%.
--
-- This migration is the bookkeeping for that:
--
--   · brands.shopify_shop_gid caches the store's Shopify id, which every
--     usage event has to carry
--   · earnings.usage_reported_at marks a sale already reported, so the same
--     order can never be billed twice
--   · billing_usage_log keeps what was sent and what Shopify answered, which
--     is the only way to answer "why was I charged this" months later
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.brands
  add column if not exists shopify_shop_gid text;

comment on column public.brands.shopify_shop_gid is
  'gid://shopify/Shop/… for the connected store. Cached from the Admin API; required on every usage event.';

alter table public.earnings
  add column if not exists usage_reported_at timestamptz;

comment on column public.earnings.usage_reported_at is
  'When this sale was reported to Shopify as usage. Null means not yet reported. Set once, never cleared.';

-- The rows the reporter looks for: cleared, chargeable, not yet reported.
create index if not exists earnings_usage_pending_idx
  on public.earnings(brand_id)
  where usage_reported_at is null and platform_fee_cents > 0;

create table if not exists public.billing_usage_log (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands(id) on delete cascade,
  earning_id      uuid references public.earnings(id) on delete set null,
  shop            text not null,
  event_handle    text not null,
  -- What Shopify multiplies by the meter price. Dollars of attributed sales.
  value_usd       numeric(12, 2) not null,
  idempotency_key text not null,
  status          integer,
  error           text,
  created_at      timestamptz not null default now()
);

create unique index if not exists billing_usage_log_key_uniq
  on public.billing_usage_log(idempotency_key);

create index if not exists billing_usage_log_brand_idx
  on public.billing_usage_log(brand_id, created_at desc);

alter table public.billing_usage_log enable row level security;

-- The brand can read its own charges. Nobody writes from a browser.
drop policy if exists billing_usage_log_read on public.billing_usage_log;
create policy billing_usage_log_read on public.billing_usage_log for select
  using (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = billing_usage_log.brand_id and b.owner_user_id = auth.uid())
  );

revoke insert, update, delete on public.billing_usage_log from anon, authenticated;

/**
 * A payment run must not collect a fee Shopify is already collecting.
 *
 * For a brand billed through Shopify, the KYRO fee reaches us on their
 * Shopify bill. Charging it again in the payment run would bill them twice
 * for the same 1%, so the run covers creator commission only. The fee stays
 * recorded on each earning, which is what the usage report is calculated
 * from; it just is not collected here.
 */
create or replace function public.authorize_payment_run(p_brand_id uuid, p_method text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run        uuid;
  v_commission bigint;
  v_fee        bigint;
  v_orders     integer;
  v_creators   integer;
  v_shopify    boolean;
begin
  if not exists (
    select 1 from public.brands b where b.id = p_brand_id and b.owner_user_id = auth.uid()
  ) and not public.is_admin() then
    raise exception 'That brand is not yours.';
  end if;

  select b.billing_origin = 'shopify_app_store' into v_shopify
    from public.brands b where b.id = p_brand_id;

  -- Lock the rows we are about to pay so a second click cannot pay them twice.
  create temporary table if not exists _run_earnings (id uuid primary key) on commit drop;
  delete from _run_earnings;

  insert into _run_earnings (id)
  select e.id
    from public.earnings e
   where e.brand_id = p_brand_id
     and e.state = 'available'
   for update;

  select coalesce(sum(e.commission_cents), 0),
         coalesce(sum(e.platform_fee_cents), 0),
         count(*),
         count(distinct e.creator_id)
    into v_commission, v_fee, v_orders, v_creators
    from public.earnings e
    join _run_earnings r on r.id = e.id;

  if v_orders = 0 then
    raise exception 'Nothing is due right now.';
  end if;

  if coalesce(v_shopify, false) then
    v_fee := 0;
  end if;

  insert into public.payment_runs
    (brand_id, status, commission_cents, platform_fee_cents, total_cents,
     order_count, creator_count, method)
  values
    (p_brand_id, 'authorized', v_commission, v_fee, v_commission + v_fee,
     v_orders, v_creators, p_method)
  returning id into v_run;

  insert into public.payment_run_items (run_id, earning_id)
  select v_run, r.id from _run_earnings r;

  update public.earnings e
     set state = 'paid', state_changed_at = now()
    from _run_earnings r
   where e.id = r.id;

  return v_run;
end;
$$;

grant execute on function public.authorize_payment_run(uuid, text) to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'shopify_shop_gid') as shop_gid_column,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'earnings' and column_name = 'usage_reported_at') as usage_column,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'billing_usage_log') as usage_log_table;
