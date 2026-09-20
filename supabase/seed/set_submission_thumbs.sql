-- ═══════════════════════════════════════════════════════════════
-- Give the six demo submissions a thumbnail.
--
-- Run only after the six files are in /public/submission-thumbs/ and pushed.
-- A thumbnail_url pointing at nothing is worse than a null one: null falls
-- straight through to the campaign's product image, a broken path gets there
-- only after a failed request.
--
-- Numbering follows submitted_at, oldest first, so the three "in use" videos
-- take 1-3 and the three "not used" ones take 4-6. That matches how the seed
-- creates them — a live one and a rejected one per campaign, with the live
-- ones dated earlier.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

with ordered as (
  select s.id,
         row_number() over (
           order by case when s.status = 'live' then 0 else 1 end, s.submitted_at
         ) as n
    from public.submissions s
    join public.brands b on b.id = s.brand_id
   where b.handle like 'demo-%'
)
update public.submissions s
   set thumbnail_url = '/submission-thumbs/' || o.n || '.jpg'
  from ordered o
 where o.id = s.id
   and o.n <= 6;

-- ── What landed ──────────────────────────────────────────────
select b.name as brand,
       c.name as campaign,
       s.status,
       s.thumbnail_url
  from public.submissions s
  join public.brands b    on b.id = s.brand_id
  join public.campaigns c on c.id = s.campaign_id
 where b.handle like 'demo-%'
 order by case when s.status = 'live' then 0 else 1 end, s.submitted_at;
