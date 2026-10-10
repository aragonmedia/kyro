-- ─────────────────────────────────────────────────────────────
-- 0026 — Shopify managed pricing: which plan the store is on
--
-- App Store rule 1.2.1 requires app charges to run through Shopify. KYRO's
-- plan and its usage meter are configured in the Dev Dashboard, and the
-- merchant approves them on Shopify's own pricing page, so KYRO never creates
-- a charge. It only needs to know whether an approved subscription exists:
-- to send a merchant who has not chosen a plan to the page where they can,
-- and to avoid reporting usage for a store that is not subscribed.
--
-- Writes to public.brands are already revoked from anon and authenticated by
-- the earlier billing migrations, so these columns inherit that: the server
-- writes them, the brand owner reads them.
-- ─────────────────────────────────────────────────────────────

alter table public.brands
  add column if not exists shopify_app_handle      text,
  add column if not exists shopify_plan_name       text,
  add column if not exists shopify_plan_status     text,
  add column if not exists shopify_plan_test       boolean,
  add column if not exists shopify_trial_ends_at   timestamptz,
  add column if not exists shopify_plan_checked_at timestamptz;

comment on column public.brands.shopify_plan_status is
  'What Shopify reports for the store''s subscription to KYRO. ACTIVE once the merchant approves a plan. Null until first checked.';

comment on column public.brands.shopify_app_handle is
  'The app handle Shopify returns for this installation. The merchant-facing pricing page URL is built from it.';

-- Result: the six columns above, one row each.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'brands'
  and column_name like 'shopify_%'
order by column_name;
