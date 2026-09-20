-- ═══════════════════════════════════════════════════════════════
-- Lebanta — real product, and the cover image that was missing.
--
-- Replaces the placeholder "Repair + Shine Treatment" that seed_products.sql
-- invented, rather than sitting beside it. One product, and it is the real
-- one.
--
-- Run after pushing, so /campaign-covers/lebanta.jpg resolves.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- ── The cover, so Lebanta stops rendering a gradient tile ────
update public.campaigns c
   set cover_url = '/campaign-covers/lebanta.jpg'
  from public.brands b
 where b.id = c.brand_id and b.handle = 'demo-lebanta';

-- ── The product ──────────────────────────────────────────────
delete from public.campaign_products p
 using public.brands b
 where b.id = p.brand_id and b.handle = 'demo-lebanta';

insert into public.campaign_products
  (campaign_id, brand_id, name, description, image_url, price_cents, position)
select c.id,
       b.id,
       'Wonder Growth Oil — 2 Pack',
       'Batana, coconut, castor, pumpkin seed and rosemary oils. 4 fl oz (120 ml) each, for all hair types, with applicator combs included. Buy one get one free, TikTok exclusive.',
       '/campaign-covers/lebanta.jpg',
       2999,
       0
  from public.brands b
  join public.campaigns c on c.brand_id = b.id
 where b.handle = 'demo-lebanta';

-- ── What landed ──────────────────────────────────────────────
select b.name as brand,
       c.cover_url,
       p.name as product,
       to_char(p.price_cents / 100.0, 'FM999,990.00') as price
  from public.brands b
  join public.campaigns c on c.brand_id = b.id
  left join public.campaign_products p on p.campaign_id = c.id
 where b.handle = 'demo-lebanta';
