-- ═══════════════════════════════════════════════════════════════
-- What's actually in the database right now.
--
-- Run this whenever something shows a placeholder and you can't tell whether
-- the SQL didn't run, or it ran and the image isn't deployed. Reads nothing,
-- writes nothing.
--
-- Read the `verdict` column. Every row should say OK.
-- ═══════════════════════════════════════════════════════════════

select 'migration 0014' as check,
       case when exists (
              select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'campaigns'
                 and column_name = 'content_style')
            and exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'campaign_products')
            and exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'messages')
            then 'OK' else 'NOT RUN — run 0014_products_and_chat.sql first' end as verdict,
       null as detail

union all
select 'campaign covers (step 2)',
       case when count(*) filter (where c.cover_url is not null) >= 3
            then 'OK' else 'NOT RUN — run set_demo_covers.sql' end,
       count(*) filter (where c.cover_url is not null)::text || ' of ' || count(*)::text || ' campaigns have a cover'
  from public.campaigns c join public.brands b on b.id = c.brand_id
 where b.handle like 'demo-%'

union all
select 'content style + products (step 3)',
       case when count(*) filter (where c.content_style is not null) = 4
            then 'OK' else 'NOT RUN — run seed_products.sql' end,
       count(*) filter (where c.content_style is not null)::text || ' of 4 campaigns have style direction'
  from public.campaigns c join public.brands b on b.id = c.brand_id
 where b.handle like 'demo-%'

union all
select 'products (step 3)',
       case when count(*) >= 7 then 'OK' else 'MISSING — run seed_products.sql' end,
       count(*)::text || ' product rows'
  from public.campaign_products p join public.brands b on b.id = p.brand_id
 where b.handle like 'demo-%'

union all
select 'brand logos (step 4)',
       case when count(*) filter (where logo_url is not null) = 4
            then 'OK' else 'NOT RUN — run set_brand_logos.sql' end,
       count(*) filter (where logo_url is not null)::text || ' of 4 brands have a logo_url'
  from public.brands where handle like 'demo-%'

union all
select 'submission thumbnails (step 5)',
       case when count(*) filter (where s.thumbnail_url is not null) = 6
            then 'OK' else 'NOT RUN — run set_submission_thumbs.sql' end,
       count(*) filter (where s.thumbnail_url is not null)::text || ' of ' || count(*)::text || ' submissions have a frame'
  from public.submissions s join public.brands b on b.id = s.brand_id
 where b.handle like 'demo-%';

-- ── The actual paths, to check against what's in /public ──────
-- If a row above says OK but the app still shows a placeholder, the database
-- is fine and the file is not deployed. Copy a path from here, stick it after
-- https://itskyro.com and open it. A 404 means the push hasn't landed.

select b.name as brand, b.logo_url, c.cover_url
  from public.brands b
  join public.campaigns c on c.brand_id = b.id
 where b.handle like 'demo-%'
 order by b.name;
