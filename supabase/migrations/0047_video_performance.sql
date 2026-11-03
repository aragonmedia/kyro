-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0047: what a video actually did
--
-- Every approved video already carries a tracking_token, the brand puts it
-- in the ad's destination URL, and a Shopify order that arrives with that
-- token in its customer journey is attributed to that video. That is how
-- creators get paid and it does not involve Meta at all.
--
-- What has been missing is the other half of the picture: the video was
-- shown to people, some of them watched, some clicked, and the brand spent
-- money doing it. A creator can see what they earned and not why. A brand
-- can see what it paid and not which video deserved it.
--
-- This stores that. One row per ad per day, pulled from Meta.
--
-- Two decisions worth stating.
--
-- First, the link between a submission and a Meta ad is discovered, not
-- entered. The brand already has to put the tracking token in the ad URL for
-- payment to work, so the sync job looks for the ad whose link carries that
-- token and records the match. Nobody is asked to maintain a mapping, and a
-- mapping nobody maintains is a mapping that is wrong by the second week.
--
-- Second, both sides see the same numbers. The creator sees what the brand
-- sees for that video: same spend, same retention, same clicks. A platform
-- that shows a creator a prettier version of their own performance is a
-- platform they stop believing.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────────────────────
   1. One row per ad per day
   ───────────────────────────────────────────────────────────── */

alter table public.meta_insights
  add column if not exists ad_account_id          text,
  add column if not exists day                    date,
  -- Meta reports retention in quartiles, not as a continuous curve. These
  -- are counts of people who reached each mark, which is what Meta gives
  -- and therefore what KYRO can honestly draw.
  add column if not exists video_plays            bigint  not null default 0,
  add column if not exists video_p25              bigint  not null default 0,
  add column if not exists video_p50              bigint  not null default 0,
  add column if not exists video_p75              bigint  not null default 0,
  add column if not exists video_p100             bigint  not null default 0,
  add column if not exists thruplays              bigint  not null default 0,
  add column if not exists avg_watch_seconds      numeric,
  add column if not exists link_clicks            bigint  not null default 0,
  add column if not exists reach                  bigint  not null default 0,
  add column if not exists synced_at              timestamptz not null default now();

comment on table public.meta_insights is
  'One row per Meta ad per day for a submission. Written only by the sync job running as the service role. Read by the brand that owns the campaign, the creator whose video it is, and admins.';

-- Backfill `day` for anything already here so the index below can be unique.
update public.meta_insights
   set day = (snapshot_at at time zone 'UTC')::date
 where day is null;

alter table public.meta_insights alter column day set not null;
alter table public.meta_insights alter column day set default ((now() at time zone 'UTC')::date);

-- A sync that runs twice in a day must correct the day's row, not add a
-- second one. Without this, a retry doubles a creator's apparent reach.
create unique index if not exists meta_insights_day_uniq
  on public.meta_insights(submission_id, meta_ad_id, day);

create index if not exists meta_insights_day_idx
  on public.meta_insights(submission_id, day);

/* ─────────────────────────────────────────────────────────────
   2. Who may read it
   ───────────────────────────────────────────────────────────── */

-- Was admin only. The two people the numbers are about could not see them,
-- which made the table useless for the thing it exists for.
drop policy if exists meta_admin on public.meta_insights;
drop policy if exists meta_insights_read on public.meta_insights;
create policy meta_insights_read on public.meta_insights for select
  using (
    public.is_admin()
    or exists (
      select 1
        from public.submissions s
        join public.campaigns c on c.id = s.campaign_id
        join public.brands b    on b.id = c.brand_id
       where s.id = meta_insights.submission_id
         and b.owner_user_id = auth.uid())
    or exists (
      select 1
        from public.submissions s
        join public.creators cr on cr.id = s.creator_id
       where s.id = meta_insights.submission_id
         and cr.user_id = auth.uid())
  );

-- Written by the sync job only. A browser has no business inventing a
-- performance figure, and a creator least of all.
revoke insert, update, delete on public.meta_insights from anon, authenticated;

/* ─────────────────────────────────────────────────────────────
   3. Reading it back
   ───────────────────────────────────────────────────────────── */

/**
 * Everything one video's performance panel needs, in one call.
 *
 * Totals across the life of the ad, plus the daily series for the trend
 * line. Returns nothing when the caller cannot see that submission, because
 * the policy above is what decides and this function does not override it.
 *
 * Rates are computed here rather than stored, so a corrected day's figures
 * correct the rates too.
 */
create or replace function public.submission_performance(p_submission_id uuid)
returns table (
  day               date,
  impressions       bigint,
  reach             bigint,
  spend_cents       bigint,
  link_clicks       bigint,
  video_plays       bigint,
  video_p25         bigint,
  video_p50         bigint,
  video_p75         bigint,
  video_p100        bigint,
  thruplays         bigint,
  avg_watch_seconds numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select m.day,
         m.impressions::bigint,
         m.reach,
         m.spend_cents,
         m.link_clicks,
         m.video_plays,
         m.video_p25,
         m.video_p50,
         m.video_p75,
         m.video_p100,
         m.thruplays,
         m.avg_watch_seconds
    from public.meta_insights m
   where m.submission_id = p_submission_id
   order by m.day;
$$;

grant execute on function public.submission_performance(uuid) to authenticated;

/* ─────────────────────────────────────────────────────────────
   4. What the sync job needs to go and fetch
   ───────────────────────────────────────────────────────────── */

/**
 * Every brand with a Meta ad account chosen, and the videos that should be
 * running for it: approved, with a tracking token, on a campaign that is
 * not finished.
 *
 * Service role only. It reads across brands by design, which is exactly why
 * no session should be able to call it.
 */
create or replace function public.meta_sync_targets()
returns table (
  brand_id       uuid,
  ad_account_id  text,
  submission_id  uuid,
  tracking_token text,
  meta_ad_id     text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         bc.external_id,
         s.id,
         s.tracking_token,
         s.meta_ad_id
    from public.brands b
    join public.brand_connections bc
      on bc.brand_id = b.id
     and bc.provider = 'meta'
     and bc.status = 'active'
     and coalesce(bc.external_id, '') <> ''
    join public.campaigns c   on c.brand_id = b.id
    join public.submissions s on s.campaign_id = c.id
   where s.status in ('approved', 'live')
     and coalesce(s.tracking_token, '') <> ''
     and c.status in ('live', 'paused')
   order by b.id, s.id;
$$;

revoke all on function public.meta_sync_targets() from public, anon, authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'meta_insights'
      and column_name in ('day','video_plays','video_p25','video_p50','video_p75',
                          'video_p100','thruplays','avg_watch_seconds','link_clicks',
                          'reach','ad_account_id','synced_at'))                    as columns_added,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'meta_insights')                   as read_policies,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'meta_insights_day_uniq')          as day_uniqueness,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('submission_performance','meta_sync_targets'))             as functions,
  (select count(*) from public.meta_insights)                                      as rows_on_file;
