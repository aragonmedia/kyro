-- ─────────────────────────────────────────────────────────────
-- KYRO — Core schema (Pillar 3)
-- brands · creators · campaigns · applications · submissions ·
-- ledger_entries · payouts · meta_insights · notifications
-- Run AFTER 0001_profiles.sql. Money is always integer cents (bigint).
-- ─────────────────────────────────────────────────────────────

-- ── Enums ────────────────────────────────────────────────────
do $$ begin create type public.campaign_status  as enum ('draft','pending_fund','live','paused','complete','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.submission_status as enum ('submitted','in_review','approved','revision_requested','live','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payout_status     as enum ('pending','processing','paid','failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.application_status as enum ('pending','accepted','rejected','withdrawn'); exception when duplicate_object then null; end $$;
do $$ begin create type public.intake_path       as enum ('marketplace','curated','invite'); exception when duplicate_object then null; end $$;
do $$ begin create type public.commission_type   as enum ('percent_spend','per_conversion','hybrid','retainer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.brand_approval    as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.tax_form_status   as enum ('not_collected','pending','complete'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_type       as enum ('pool_credit','earnings_accrual','payout_debit','refund','adjustment'); exception when duplicate_object then null; end $$;

-- ── Admin helper (used across RLS) ───────────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ── Brands ───────────────────────────────────────────────────
create table if not exists public.brands (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid references public.profiles(id) on delete set null,
  name               text not null,
  handle             text unique not null,
  logo_url           text,
  tagline            text,
  category           text,
  accent             text,
  meta_ad_account_id text,
  approval_status    public.brand_approval not null default 'pending',
  created_at         timestamptz not null default now()
);
create index if not exists brands_owner_idx on public.brands(owner_user_id);

-- ── Creators (extended creator profile) ──────────────────────
create table if not exists public.creators (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid unique references public.profiles(id) on delete cascade,
  handle               text unique,
  bio                  text,
  location             text,
  niche                text[] not null default '{}',
  instagram_handle     text,
  instagram_followers  integer,
  tiktok_handle        text,
  tiktok_followers     integer,
  youtube_handle       text,
  youtube_subscribers  integer,
  trolley_recipient_id text,
  tax_form_status      public.tax_form_status not null default 'not_collected',
  stats                jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

-- ── Campaigns ────────────────────────────────────────────────
create table if not exists public.campaigns (
  id                              uuid primary key default gen_random_uuid(),
  brand_id                        uuid not null references public.brands(id) on delete cascade,
  name                            text not null,
  brief                           text,
  status                          public.campaign_status not null default 'draft',
  intake_paths                    public.intake_path[] not null default '{marketplace}',
  commission_type                 public.commission_type not null default 'percent_spend',
  commission_percent_spend        numeric,          -- 0..1
  commission_per_conversion_cents bigint,
  commission_retainer_cents       bigint,
  pool_target_cents               bigint not null default 0,
  pool_balance_cents              bigint not null default 0,
  spent_cents                     bigint not null default 0,
  start_date                      date,
  end_date                        date,
  deliverable_spec                text,
  cover_url                       text,
  created_at                      timestamptz not null default now()
);
create index if not exists campaigns_brand_idx  on public.campaigns(brand_id);
create index if not exists campaigns_status_idx on public.campaigns(status);

-- ── Applications ─────────────────────────────────────────────
create table if not exists public.applications (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creator_id  uuid not null references public.creators(id) on delete cascade,
  status      public.application_status not null default 'pending',
  intake_path public.intake_path not null default 'marketplace',
  message     text,
  created_at  timestamptz not null default now(),
  unique (campaign_id, creator_id)
);
create index if not exists applications_campaign_idx on public.applications(campaign_id);
create index if not exists applications_creator_idx  on public.applications(creator_id);

-- ── Submissions ──────────────────────────────────────────────
create table if not exists public.submissions (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  creator_id       uuid not null references public.creators(id) on delete cascade,
  brand_id         uuid references public.brands(id) on delete cascade,
  video_url        text,
  thumbnail_url    text,
  status           public.submission_status not null default 'submitted',
  meta_ad_id       text,
  meta_creative_id text,
  ai_tags          text[] not null default '{}',
  orders           integer not null default 0,
  impressions      integer not null default 0,
  spend_cents      bigint  not null default 0,
  earnings_cents   bigint  not null default 0,
  pending_cents    bigint  not null default 0,
  submitted_at     timestamptz not null default now(),
  approved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists submissions_campaign_idx on public.submissions(campaign_id);
create index if not exists submissions_creator_idx  on public.submissions(creator_id);

-- ── Ledger ───────────────────────────────────────────────────
create table if not exists public.ledger_entries (
  id                 uuid primary key default gen_random_uuid(),
  type               public.ledger_type not null,
  creator_id         uuid references public.creators(id) on delete set null,
  brand_id           uuid references public.brands(id) on delete set null,
  campaign_id        uuid references public.campaigns(id) on delete set null,
  submission_id      uuid references public.submissions(id) on delete set null,
  amount_cents       bigint not null,     -- + credit / - debit
  balance_after_cents bigint,
  ref_external_id    text,                -- Square invoice / Trolley batch id
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists ledger_campaign_idx on public.ledger_entries(campaign_id);

-- ── Payouts ──────────────────────────────────────────────────
create table if not exists public.payouts (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references public.creators(id) on delete cascade,
  trolley_batch_id text,
  amount_cents     bigint not null,
  status           public.payout_status not null default 'pending',
  period_start     date,
  period_end       date,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index if not exists payouts_creator_idx on public.payouts(creator_id);

-- ── Meta insights (one row per submission snapshot) ──────────
create table if not exists public.meta_insights (
  id                     uuid primary key default gen_random_uuid(),
  submission_id          uuid not null references public.submissions(id) on delete cascade,
  meta_ad_id             text,
  snapshot_at            timestamptz not null default now(),
  impressions            integer not null default 0,
  clicks                 integer not null default 0,
  spend_cents            bigint  not null default 0,
  conversions            integer not null default 0,
  conversion_value_cents bigint  not null default 0,
  roas                   numeric,
  cpa                    numeric
);
create index if not exists meta_insights_submission_idx on public.meta_insights(submission_id);

-- ── Notifications ────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  cta_url    text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id);

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────
alter table public.brands         enable row level security;
alter table public.creators       enable row level security;
alter table public.campaigns      enable row level security;
alter table public.applications   enable row level security;
alter table public.submissions    enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payouts        enable row level security;
alter table public.meta_insights  enable row level security;
alter table public.notifications  enable row level security;

-- Brands: public can read approved; owner/admin manage.
drop policy if exists brands_read on public.brands;
create policy brands_read on public.brands for select
  using (approval_status = 'approved' or owner_user_id = auth.uid() or public.is_admin());
drop policy if exists brands_insert on public.brands;
create policy brands_insert on public.brands for insert
  with check (owner_user_id = auth.uid());
drop policy if exists brands_update on public.brands;
create policy brands_update on public.brands for update
  using (owner_user_id = auth.uid() or public.is_admin())
  with check (owner_user_id = auth.uid() or public.is_admin());

-- Creators: any signed-in user can read; owner/admin manage.
drop policy if exists creators_read on public.creators;
create policy creators_read on public.creators for select
  using (auth.uid() is not null);
drop policy if exists creators_write on public.creators;
create policy creators_write on public.creators for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- Campaigns: signed-in users can browse; brand owner/admin manage.
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select
  using (auth.uid() is not null);
drop policy if exists campaigns_write on public.campaigns;
create policy campaigns_write on public.campaigns for all
  using (public.is_admin() or exists (select 1 from public.brands b where b.id = campaigns.brand_id and b.owner_user_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.brands b where b.id = campaigns.brand_id and b.owner_user_id = auth.uid()));

-- Applications: creator owner + brand owner of campaign + admin.
drop policy if exists applications_access on public.applications;
create policy applications_access on public.applications for all
  using (
    public.is_admin()
    or exists (select 1 from public.creators c where c.id = applications.creator_id and c.user_id = auth.uid())
    or exists (select 1 from public.campaigns ca join public.brands b on b.id = ca.brand_id
               where ca.id = applications.campaign_id and b.owner_user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.creators c where c.id = applications.creator_id and c.user_id = auth.uid())
  );

-- Submissions: creator owner + brand owner of campaign + admin.
drop policy if exists submissions_access on public.submissions;
create policy submissions_access on public.submissions for all
  using (
    public.is_admin()
    or exists (select 1 from public.creators c where c.id = submissions.creator_id and c.user_id = auth.uid())
    or exists (select 1 from public.campaigns ca join public.brands b on b.id = ca.brand_id
               where ca.id = submissions.campaign_id and b.owner_user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.creators c where c.id = submissions.creator_id and c.user_id = auth.uid())
  );

-- Payouts: creator sees own; admin all.
drop policy if exists payouts_read on public.payouts;
create policy payouts_read on public.payouts for select
  using (public.is_admin() or exists (select 1 from public.creators c where c.id = payouts.creator_id and c.user_id = auth.uid()));

-- Ledger + meta insights: admin only for now (sensitive).
drop policy if exists ledger_admin on public.ledger_entries;
create policy ledger_admin on public.ledger_entries for select using (public.is_admin());
drop policy if exists meta_admin on public.meta_insights;
create policy meta_admin on public.meta_insights for select using (public.is_admin());

-- Notifications: user sees/updates own.
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
