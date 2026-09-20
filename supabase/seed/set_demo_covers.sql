-- ═══════════════════════════════════════════════════════════════
-- Attach product images to the three demo campaigns already seeded.
--
-- The images live in /public, so these are root-relative paths served by
-- Vercel rather than Supabase Storage URLs. Push the repo first, otherwise
-- the paths resolve to nothing until the deploy lands.
--
-- Lebanta is intentionally left alone: no product shot yet, so it falls back
-- to the generated tile.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

update public.campaigns c
   set cover_url = case b.handle
                     when 'demo-bold-buns'   then '/campaign-covers/bold-buns.jpg'
                     when 'demo-jaje-health' then '/campaign-covers/jaje-health.jpg'
                     when 'demo-fuel'        then '/campaign-covers/fuel.jpg'
                   end
  from public.brands b
 where b.id = c.brand_id
   and b.handle in ('demo-bold-buns', 'demo-jaje-health', 'demo-fuel');

-- ── What landed ──────────────────────────────────────────────
select b.name as brand, c.name as campaign, c.cover_url
  from public.campaigns c
  join public.brands b on b.id = c.brand_id
 where b.handle like 'demo-%'
 order by b.name;

-- ── Taglines, so the words match the product ─────────────────
-- The seed originally described Bold Buns as a bakery and Fuel as a drink.
-- The real products are a creatine supplement and a beauty capsule, and a
-- brand card that contradicts its own product image is worse than a bare one.
update public.brands set tagline = 'Daily wellness and performance support', category = 'Wellness'
 where handle = 'demo-bold-buns';
update public.brands set tagline = 'Gut support that actually tastes good',  category = 'Wellness'
 where handle = 'demo-jaje-health';
update public.brands set tagline = 'Beauty from the inside out',             category = 'Beauty'
 where handle = 'demo-fuel';
