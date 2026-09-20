-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0015 — brand setup
--
-- A brand row is created the moment someone picks the brand role, with
-- nothing in it but a name. That is why a new brand lands on an empty
-- dashboard with no logo, no description and no idea what to do next.
--
-- These columns are what the setup wizard collects, plus the flag that says
-- it finished. The flag is explicit rather than inferred from "are the fields
-- filled in", because a brand who deliberately skips the optional steps has
-- still finished, and should not be asked again every time they sign in.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.brands add column if not exists website_url   text;
alter table public.brands add column if not exists description   text;
alter table public.brands add column if not exists business_type text;
alter table public.brands add column if not exists currency      text not null default 'USD';
alter table public.brands add column if not exists setup_complete boolean not null default false;

comment on column public.brands.business_type is
  'ecommerce | mobile_app | saas | other. Shapes nothing yet; collected so the marketplace can segment later.';
comment on column public.brands.currency is
  'ISO 4217. Display only today — money is stored in cents and settled in USD.';
comment on column public.brands.setup_complete is
  'True once the brand has been through the setup wizard. Set explicitly, not inferred, so skipping an optional step still counts as done.';

-- Brands that already exist predate the wizard. Treat them as set up rather
-- than throwing an existing account back into onboarding on next sign-in.
update public.brands set setup_complete = true where setup_complete = false;

-- ── What landed ──────────────────────────────────────────────
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'brands'
   and column_name in ('website_url','description','business_type','currency','setup_complete')
 order by column_name;
