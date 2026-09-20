-- ═══════════════════════════════════════════════════════════════
-- Give the six demo submissions a video frame.
--
-- Run only after the six files are in /public/submission-thumbs/ and pushed.
-- A thumbnail_url pointing at nothing is worse than a null one: null falls
-- straight through to the campaign's product image, a broken path gets there
-- only after a failed request.
--
-- Frames are assigned BY BRAND, not by date, so the product in the thumbnail
-- matches the campaign it sits under. Getting this wrong is the kind of
-- detail a partner notices in a demo: a creatine tub filed under a gut-health
-- campaign reads as fake data, because it is.
--
--   Bold Buns    6 in use  ·  3 not used    (Creatine Boost, Spanish)
--   Fuel         4 in use  ·  1 not used    (Multi Collagen Beauty)
--   Jaje Health  2 in use  ·  5 not used    (gummies)
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

with ranked as (
  select s.id,
         b.handle,
         -- 1 = the video the brand is running, 2 = the one they passed on.
         row_number() over (
           partition by b.handle
           order by case when s.status = 'live' then 0 else 1 end, s.submitted_at
         ) as slot
    from public.submissions s
    join public.brands b on b.id = s.brand_id
   where b.handle like 'demo-%'
),
assigned as (
  select r.id,
         case r.handle || ':' || r.slot
           when 'demo-bold-buns:1'   then '/submission-thumbs/6.jpg'
           when 'demo-bold-buns:2'   then '/submission-thumbs/3.jpg'
           when 'demo-fuel:1'        then '/submission-thumbs/4.jpg'
           when 'demo-fuel:2'        then '/submission-thumbs/1.jpg'
           when 'demo-jaje-health:1' then '/submission-thumbs/2.jpg'
           when 'demo-jaje-health:2' then '/submission-thumbs/5.jpg'
         end as url
    from ranked r
)
update public.submissions s
   set thumbnail_url = a.url
  from assigned a
 where a.id = s.id
   and a.url is not null;

-- ── What landed ──────────────────────────────────────────────
select b.name as brand,
       s.status,
       s.thumbnail_url
  from public.submissions s
  join public.brands b on b.id = s.brand_id
 where b.handle like 'demo-%'
 order by b.name, case when s.status = 'live' then 0 else 1 end;
