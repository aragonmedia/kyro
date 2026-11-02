-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0041: how many of this product has already sold
--
-- A creator browsing open campaigns is making one judgement: is this worth
-- my time. Commission rate alone cannot answer it, because 20% of a product
-- nobody buys is worth less than 8% of one that moves. The brand knows the
-- number and the creator does not, and that asymmetry is the main reason a
-- good creator passes on a good campaign.
--
-- So the brand is asked for it per product when they create the campaign,
-- and it is shown on the browse card and used as a filter.
--
-- Null means not answered, which is different from zero. A brand launching
-- something new should be able to say nothing rather than be forced to type
-- a zero that reads as a failure, so the column is nullable and the UI
-- treats null as "not shared" rather than as none.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.campaign_products
  add column if not exists units_sold integer;

do $$ begin
  alter table public.campaign_products
    add constraint campaign_products_units_sold_chk
    check (units_sold is null or units_sold >= 0);
exception when duplicate_object then null; end $$;

comment on column public.campaign_products.units_sold is
  'Units this product has already sold, as stated by the brand when the campaign was created. Null means they did not say, which is not the same as zero.';

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'campaign_products'
      and column_name = 'units_sold')                          as column_added,
  (select count(*) from pg_constraint
    where conname = 'campaign_products_units_sold_chk')        as constraint_added,
  (select count(*) from public.campaign_products)              as products_on_file;
