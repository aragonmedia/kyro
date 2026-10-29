-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0040: retiring `pending_fund`
--
-- `pending_fund` meant "waiting for the brand to fund the campaign pool".
-- There is no pool. The deposit model was dropped: a brand is charged per
-- payment run against a saved payment method, and nothing is ever funded up
-- front. The status has been meaningless since then, and new campaigns were
-- still being created in it, which is why the admin portal has been quietly
-- relabelling it "legacy" rather than showing a state nobody can explain.
--
-- Every campaign in that state is really a draft: made, not launched. So
-- they become drafts, which is what the brand portal already treats them as,
-- and `createCampaign` now writes 'draft' directly.
--
-- The enum value itself stays. Removing a value from a Postgres enum means
-- rewriting the type and every column that uses it, which is a lot of risk
-- to retire a word. The check constraint below does the same job: nothing
-- can be written in that state again, and anything that tries fails loudly
-- here rather than silently creating another one.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

update public.campaigns
   set status = 'draft'
 where status = 'pending_fund';

do $$ begin
  alter table public.campaigns
    add constraint campaigns_no_pending_fund
    check (status <> 'pending_fund');
exception when duplicate_object then null; end $$;

comment on constraint campaigns_no_pending_fund on public.campaigns is
  'pending_fund belonged to the funded-pool model, which no longer exists. Retired by 0040; the enum value is kept only because removing one means rewriting the type.';

-- ── What landed ──────────────────────────────────────────────
-- Nothing should be left in the old state, and the constraint should be
-- there to keep it that way.
select
  (select count(*) from public.campaigns where status = 'pending_fund')  as still_pending_fund,
  (select count(*) from public.campaigns where status = 'draft')         as drafts,
  (select count(*) from pg_constraint
    where conname = 'campaigns_no_pending_fund')                         as constraint_installed;
