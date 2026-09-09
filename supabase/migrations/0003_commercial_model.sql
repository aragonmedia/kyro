-- ─────────────────────────────────────────────────────────────
-- KYRO — 0003: commercial model
--
-- Moves the schema off the original prefunded-escrow design onto the model
-- settled in docs/KYRO_MODEL.md:
--
--   • brands connect a Meta ad account and a Shopify store (both required)
--   • brands post-pay: $2,500 deposit as collateral, ACH billing when accrued
--     balance hits 30% of it, campaign auto-pauses past the accrual cap
--   • KYRO fee is 1%, on exactly one base per payout type
--   • orders come from Shopify and are attributed to a submission's Meta ad
--   • creator earnings move pending → clearing → available (fulfilled + 30d)
--     with reversals on refunds
--   • each approved video carries its own licence, scoped to the connected
--     ad account and conditioned on payment
--
-- Run AFTER 0002_core_schema.sql. Money is integer cents (bigint) throughout.
-- Rates are integer basis points (bps): 1% = 100, 20% = 2000. No floats.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────
do $$ begin create type public.connection_provider as enum ('meta','shopify');                                     exception when duplicate_object then null; end $$;
do $$ begin create type public.connection_status   as enum ('active','disconnected','error');                      exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status        as enum ('placed','fulfilled','cancelled','refunded','partially_refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.earning_state       as enum ('pending','clearing','available','reversed','paid');   exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_run_status  as enum ('draft','processing','paid','failed');                 exception when duplicate_object then null; end $$;
do $$ begin create type public.license_status      as enum ('active','suspended','terminated','expired');          exception when duplicate_object then null; end $$;
do $$ begin create type public.attribution_method  as enum ('meta_ad','utm','discount_code','manual');             exception when duplicate_object then null; end $$;
do $$ begin create type public.deposit_status      as enum ('none','held','released');                             exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_state       as enum ('active','paused','suspended');                        exception when duplicate_object then null; end $$;

-- ── Helper: does the current user own this brand? ────────────
create or replace function public.owns_brand(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.brands where id = b and owner_user_id = auth.uid());
$$;

-- ── Helper: is the current user this creator? ────────────────
create or replace function public.is_creator(c uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.creators where id = c and user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────
-- Campaign additions
-- ─────────────────────────────────────────────────────────────
alter table public.campaigns
  add column if not exists commission_rate_bps integer,                       -- creator rate, set by the brand
  add column if not exists platform_fee_bps    integer not null default 100,  -- KYRO's 1%
  add column if not exists clearing_days       integer not null default 30,
  add column if not exists attribution_rule    text    not null default 'last_click_shopify',
  add column if not exists activated_at        timestamptz;

comment on column public.campaigns.commission_rate_bps is
  'Creator commission in basis points, set by the brand. 2000 = 20%.';
comment on column public.campaigns.platform_fee_bps is
  'KYRO fee in basis points. 100 = 1%. Applied to one base per payout type; never stacked.';
comment on column public.campaigns.clearing_days is
  'Days after order fulfilment before a creator can withdraw. Default 30.';
comment on column public.campaigns.pool_target_cents is
  'DEPRECATED (0003): the prefunded-escrow model was replaced by post-pay with a deposit. Kept for historical rows.';
comment on column public.campaigns.pool_balance_cents is
  'DEPRECATED (0003): see brand_billing.deposit_cents instead.';

-- ─────────────────────────────────────────────────────────────
-- Brand platform connections (Meta ad account + Shopify store)
-- Both are required before a campaign may go live, and disconnecting
-- either one suspends the campaign and its licences.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.brand_connections (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands(id) on delete cascade,
  provider        public.connection_provider not null,
  external_id     text not null,               -- ad account id / myshopify domain
  display_name    text,
  status          public.connection_status not null default 'active',
  scopes          text[] not null default '{}',
  connected_at    timestamptz not null default now(),
  disconnected_at timestamptz,
  last_error      text,
  unique (brand_id, provider)
);
create index if not exists brand_connections_brand_idx on public.brand_connections(brand_id);

-- ─────────────────────────────────────────────────────────────
-- Brand billing profile — deposit, ACH mandate, accrual cap
-- No token, PAN or bank number is ever stored here; only processor refs.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.brand_billing (
  brand_id            uuid primary key references public.brands(id) on delete cascade,
  deposit_cents       bigint  not null default 250000,   -- $2,500
  deposit_status      public.deposit_status not null default 'none',
  deposit_ref         text,                              -- card charge ref at the processor
  ach_mandate_ref     text,                              -- ACH authorization ref
  billing_trigger_bps integer not null default 3000,     -- bill at 30% of deposit
  accrual_cap_cents   bigint  not null default 250000,   -- pause past this unbilled
  completed_campaigns integer not null default 0,        -- graduation counter
  state               public.billing_state not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.brand_billing is
  'One row per brand. Deposit is collateral, not prepayment. Billing fires when unbilled accrual reaches billing_trigger_bps of deposit_cents, or monthly, whichever is first.';

drop trigger if exists brand_billing_touch on public.brand_billing;
create trigger brand_billing_touch before update on public.brand_billing
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Signed agreements (Campaign Agreement, ToS, Privacy)
-- The licence in content_licenses points at the agreement it was granted under.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.agreements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  brand_id   uuid references public.brands(id) on delete cascade,
  doc_type   text not null,                    -- 'campaign_agreement' | 'tos' | 'privacy'
  version    text not null,
  signed_at  timestamptz not null default now(),
  ip         inet,
  user_agent text
);
create index if not exists agreements_brand_idx on public.agreements(brand_id);
create index if not exists agreements_user_idx  on public.agreements(user_id);

-- ─────────────────────────────────────────────────────────────
-- Content licences — one per approved video, per brand
-- Scope is deliberately narrow: the CONNECTED Meta ad account only.
-- Anything wider is a separate paid licence.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.content_licenses (
  id                 uuid primary key default gen_random_uuid(),
  submission_id      uuid not null references public.submissions(id) on delete cascade,
  brand_id           uuid not null references public.brands(id) on delete cascade,
  creator_id         uuid not null references public.creators(id) on delete cascade,
  campaign_id        uuid not null references public.campaigns(id) on delete cascade,
  agreement_id       uuid references public.agreements(id) on delete set null,
  scope              text not null default 'connected_meta_ads',
  status             public.license_status not null default 'active',
  granted_at         timestamptz not null default now(),
  expires_at         timestamptz,              -- campaign end + tail (default 30d)
  suspended_at       timestamptz,
  terminated_at      timestamptz,
  termination_reason text,
  unique (submission_id, brand_id)
);
create index if not exists content_licenses_brand_idx  on public.content_licenses(brand_id);
create index if not exists content_licenses_status_idx on public.content_licenses(status);

-- ─────────────────────────────────────────────────────────────
-- Orders, from the connected Shopify store
--
-- PRIVACY: no customer name, email or address is stored. Only a salted hash of
-- the email, used to flag creator self-purchasing. The privacy policy promises
-- creators never see who bought; not storing it is the cheapest way to keep that.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands(id) on delete cascade,
  external_id         text not null,                    -- Shopify order id
  external_number     text,                             -- human order number
  currency            text not null default 'USD',
  subtotal_cents      bigint not null default 0,        -- product subtotal, pre-discount
  discount_cents      bigint not null default 0,
  shipping_cents      bigint not null default 0,        -- excluded from commission
  tax_cents           bigint not null default 0,        -- excluded from commission
  total_cents         bigint not null default 0,
  refunded_cents      bigint not null default 0,
  commissionable_cents bigint not null default 0,       -- see comment below
  status              public.order_status not null default 'placed',
  placed_at           timestamptz not null default now(),
  fulfilled_at        timestamptz,
  cancelled_at        timestamptz,
  last_refund_at      timestamptz,
  customer_email_hash text,                             -- fraud matching only
  created_at          timestamptz not null default now(),
  unique (brand_id, external_id)
);
comment on column public.orders.commissionable_cents is
  'Product subtotal, after discounts, EXCLUDING shipping, taxes and duties, NET of refunds and chargebacks. The single definition used everywhere. Never bill on total_cents.';
create index if not exists orders_brand_idx     on public.orders(brand_id);
create index if not exists orders_placed_idx    on public.orders(placed_at);
create index if not exists orders_fulfilled_idx on public.orders(fulfilled_at);

-- ─────────────────────────────────────────────────────────────
-- Attribution — which submission earned which order
-- The join KYRO owns: submission → meta ad id → order.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.order_attributions (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  submission_id        uuid not null references public.submissions(id) on delete cascade,
  campaign_id          uuid not null references public.campaigns(id) on delete cascade,
  creator_id           uuid not null references public.creators(id) on delete cascade,
  method               public.attribution_method not null default 'meta_ad',
  meta_ad_id           text,
  weight               numeric not null default 1,      -- <1 when an order is split
  commissionable_cents bigint  not null default 0,      -- this submission's share
  attributed_at        timestamptz not null default now(),
  unique (order_id, submission_id)
);
create index if not exists order_attr_order_idx      on public.order_attributions(order_id);
create index if not exists order_attr_submission_idx on public.order_attributions(submission_id);
create index if not exists order_attr_creator_idx    on public.order_attributions(creator_id);

-- ─────────────────────────────────────────────────────────────
-- Billing runs — what the brand is actually charged
-- ─────────────────────────────────────────────────────────────
create table if not exists public.billing_runs (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.brands(id) on delete cascade,
  period_start       timestamptz,
  period_end         timestamptz,
  commission_cents   bigint not null default 0,
  platform_fee_cents bigint not null default 0,
  total_cents        bigint not null default 0,
  status             public.billing_run_status not null default 'draft',
  processor_ref      text,
  charged_at         timestamptz,
  failed_reason      text,
  created_at         timestamptz not null default now()
);
create index if not exists billing_runs_brand_idx on public.billing_runs(brand_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Earnings — the four-state machine creators watch
--
-- pending    order placed
-- clearing   order fulfilled
-- available  fulfilled + campaigns.clearing_days   → withdrawable
-- reversed   order refunded or charged back
-- paid       included in a completed payout
--
-- Rates are snapshotted at accrual so a later rate change never rewrites history.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.earnings (
  id                   uuid primary key default gen_random_uuid(),
  creator_id           uuid not null references public.creators(id) on delete cascade,
  brand_id             uuid not null references public.brands(id) on delete cascade,
  campaign_id          uuid not null references public.campaigns(id) on delete cascade,
  submission_id        uuid not null references public.submissions(id) on delete cascade,
  order_id             uuid not null references public.orders(id) on delete cascade,
  attribution_id       uuid references public.order_attributions(id) on delete set null,

  commissionable_cents bigint  not null default 0,
  commission_bps       integer not null,                 -- snapshot of the campaign rate
  commission_cents     bigint  not null default 0,       -- creator's share
  platform_fee_bps     integer not null default 100,     -- snapshot of KYRO's 1%
  platform_fee_cents   bigint  not null default 0,       -- KYRO's share

  state                public.earning_state not null default 'pending',
  available_at         timestamptz,                      -- fulfilled_at + clearing_days
  state_changed_at     timestamptz not null default now(),
  reversed_at          timestamptz,
  reversal_reason      text,

  billing_run_id       uuid references public.billing_runs(id) on delete set null,
  payout_id            uuid references public.payouts(id) on delete set null,
  created_at           timestamptz not null default now(),
  unique (order_id, submission_id)
);
create index if not exists earnings_creator_state_idx on public.earnings(creator_id, state);
create index if not exists earnings_brand_idx         on public.earnings(brand_id, state);
create index if not exists earnings_campaign_idx      on public.earnings(campaign_id);
create index if not exists earnings_unbilled_idx      on public.earnings(brand_id) where billing_run_id is null;
create index if not exists earnings_available_idx     on public.earnings(available_at) where state = 'clearing';

-- Keep state_changed_at honest without the app having to remember.
create or replace function public.touch_earning_state()
returns trigger language plpgsql as $$
begin
  if new.state is distinct from old.state then
    new.state_changed_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists earnings_touch_state on public.earnings;
create trigger earnings_touch_state before update on public.earnings
  for each row execute function public.touch_earning_state();

-- ─────────────────────────────────────────────────────────────
-- Creator balance view — exactly what the withdraw screen needs
-- ─────────────────────────────────────────────────────────────
create or replace view public.creator_balances as
select
  creator_id,
  coalesce(sum(commission_cents) filter (where state = 'pending'),   0)::bigint as pending_cents,
  coalesce(sum(commission_cents) filter (where state = 'clearing'),  0)::bigint as clearing_cents,
  coalesce(sum(commission_cents) filter (where state = 'available'), 0)::bigint as available_cents,
  coalesce(sum(commission_cents) filter (where state = 'paid'),      0)::bigint as paid_cents,
  coalesce(sum(commission_cents) filter (where state = 'reversed'),  0)::bigint as reversed_cents,
  count(*) filter (where state <> 'reversed')                                   as earning_count
from public.earnings
group by creator_id;

-- Brand exposure view — drives the deposit usage progress bar
create or replace view public.brand_unbilled as
select
  e.brand_id,
  coalesce(sum(e.commission_cents), 0)::bigint   as unbilled_commission_cents,
  coalesce(sum(e.platform_fee_cents), 0)::bigint as unbilled_fee_cents,
  coalesce(sum(e.commission_cents + e.platform_fee_cents), 0)::bigint as unbilled_total_cents
from public.earnings e
where e.billing_run_id is null
  and e.state <> 'reversed'
group by e.brand_id;

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.brand_connections  enable row level security;
alter table public.brand_billing      enable row level security;
alter table public.agreements         enable row level security;
alter table public.content_licenses   enable row level security;
alter table public.orders             enable row level security;
alter table public.order_attributions enable row level security;
alter table public.billing_runs       enable row level security;
alter table public.earnings           enable row level security;

-- Brand-owned, brand-visible.
drop policy if exists brand_connections_access on public.brand_connections;
create policy brand_connections_access on public.brand_connections for all
  using (public.is_admin() or public.owns_brand(brand_id))
  with check (public.is_admin() or public.owns_brand(brand_id));

drop policy if exists brand_billing_access on public.brand_billing;
create policy brand_billing_access on public.brand_billing for all
  using (public.is_admin() or public.owns_brand(brand_id))
  with check (public.is_admin() or public.owns_brand(brand_id));

drop policy if exists agreements_access on public.agreements;
create policy agreements_access on public.agreements for all
  using (public.is_admin() or user_id = auth.uid() or (brand_id is not null and public.owns_brand(brand_id)))
  with check (public.is_admin() or user_id = auth.uid() or (brand_id is not null and public.owns_brand(brand_id)));

-- Orders contain commercial data. Brand owner and admin only.
-- Creators never see orders; they see their own earnings rows instead.
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select
  using (public.is_admin() or public.owns_brand(brand_id));
drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists order_attr_read on public.order_attributions;
create policy order_attr_read on public.order_attributions for select
  using (
    public.is_admin()
    or public.is_creator(creator_id)
    or exists (select 1 from public.orders o where o.id = order_attributions.order_id and public.owns_brand(o.brand_id))
  );
drop policy if exists order_attr_write on public.order_attributions;
create policy order_attr_write on public.order_attributions for all
  using (public.is_admin()) with check (public.is_admin());

-- Licences: the brand holding it, the creator who made it, and admins.
drop policy if exists content_licenses_read on public.content_licenses;
create policy content_licenses_read on public.content_licenses for select
  using (public.is_admin() or public.owns_brand(brand_id) or public.is_creator(creator_id));
drop policy if exists content_licenses_write on public.content_licenses;
create policy content_licenses_write on public.content_licenses for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists billing_runs_read on public.billing_runs;
create policy billing_runs_read on public.billing_runs for select
  using (public.is_admin() or public.owns_brand(brand_id));
drop policy if exists billing_runs_write on public.billing_runs;
create policy billing_runs_write on public.billing_runs for all
  using (public.is_admin()) with check (public.is_admin());

-- Earnings: creators see their own, brands see what they owe, admins see all.
-- Writes are service-role only — an earning is derived from an order, never
-- something a user may assert.
drop policy if exists earnings_read on public.earnings;
create policy earnings_read on public.earnings for select
  using (public.is_admin() or public.is_creator(creator_id) or public.owns_brand(brand_id));
drop policy if exists earnings_write on public.earnings;
create policy earnings_write on public.earnings for all
  using (public.is_admin()) with check (public.is_admin());

-- Views inherit RLS from the underlying tables via security_invoker.
alter view public.creator_balances set (security_invoker = on);
alter view public.brand_unbilled   set (security_invoker = on);

-- ─────────────────────────────────────────────────────────────
-- Backfill: every existing brand gets a billing profile
-- ─────────────────────────────────────────────────────────────
insert into public.brand_billing (brand_id)
select b.id from public.brands b
where not exists (select 1 from public.brand_billing bb where bb.brand_id = b.id);
