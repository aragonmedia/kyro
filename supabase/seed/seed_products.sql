-- ═══════════════════════════════════════════════════════════════
-- KYRO — demo campaign content direction and product listings
--
-- Run AFTER 0014 and after seed_creator.sql. Idempotent: it clears the demo
-- brands' products before reinserting, so re-running replaces rather than
-- duplicates.
--
-- ⚠ Prices and the second product in each pair are DEMO VALUES. The product
--   names and the first image of each pair are real. Replace the figures with
--   the brands' actual listings before this is shown as live data, or point
--   external_url at the real product page and let Shopify fill the rest in
--   later.
-- ═══════════════════════════════════════════════════════════════

-- ── Content direction ────────────────────────────────────────
-- `brief` is what the campaign is. `content_style` is what the video should
-- feel like, which is the part creators actually get wrong. Keeping them in
-- separate columns means a creator browsing sees the direction without having
-- to read a wall of brief.

update public.campaigns c
   set brief = 'Always-on performance campaign. Post what works, we run what converts. Commission on every attributed order, no cap on how many videos you send.',
       content_style = 'Spanish-language gym content. Film in the gym or right after a session, real lifestyle energy, no studio setup. Show the scoop and the shake in frame. Hook inside the first two seconds, keep it under 25 seconds.',
       deliverable_spec = '9:16 vertical video, 15-25s, Spanish audio, product visible before the 3 second mark.'
  from public.brands b
 where b.id = c.brand_id and b.handle = 'demo-bold-buns';

update public.campaigns c
   set brief = 'Always-on performance campaign. Post what works, we run what converts. Commission on every attributed order, no cap on how many videos you send.',
       content_style = 'Top-of-funnel UGC that leads with the problem, not the product. Bloating, heaviness after meals, the 3pm crash. Hand-held, natural light, talking to camera. The gummy appears as the answer, not the opening line.',
       deliverable_spec = '9:16 vertical video, 20-30s, spoken hook, taste reaction on camera.'
  from public.brands b
 where b.id = c.brand_id and b.handle = 'demo-jaje-health';

update public.campaigns c
   set brief = 'Always-on performance campaign. Post what works, we run what converts. Commission on every attributed order, no cap on how many videos you send.',
       content_style = 'Wellness lifestyle. Morning routine, getting ready, the supplement as part of a life rather than the subject of an ad. Soft natural light, calm pacing, minimal text on screen.',
       deliverable_spec = '9:16 vertical video, 15-30s, routine or get-ready-with-me framing.'
  from public.brands b
 where b.id = c.brand_id and b.handle = 'demo-fuel';

update public.campaigns c
   set brief = 'Always-on performance campaign. Post what works, we run what converts. Commission on every attributed order, no cap on how many videos you send.',
       content_style = 'Haircare showcase. The result is the ad: well-lit hair, movement, before and after in the same take where you can. Shoot near a window or with a soft key light. No heavy filters, the texture has to read.',
       deliverable_spec = '9:16 vertical video, 15-30s, hair visible in good light throughout.'
  from public.brands b
 where b.id = c.brand_id and b.handle = 'demo-lebanta';

-- Lebanta was seeded as skincare. It is haircare.
update public.brands
   set tagline = 'Haircare that shows up on camera', category = 'Beauty'
 where handle = 'demo-lebanta';

-- ── Products ─────────────────────────────────────────────────

delete from public.campaign_products p
 using public.brands b
 where b.id = p.brand_id and b.handle like 'demo-%';

insert into public.campaign_products
  (campaign_id, brand_id, name, description, image_url, price_cents, position)
select c.id, b.id, x.name, x.description, x.image_url, x.price_cents, x.position
  from public.brands b
  join public.campaigns c on c.brand_id = b.id
  join (values
    ('demo-bold-buns', 'Creatine Boost',            'Daily wellness and performance support. 5g creatine, 2.5g collagen peptides, BCAA and L-glutamine. Unflavoured, 30 servings.', '/campaign-covers/bold-buns.jpg',   4999, 0),
    ('demo-bold-buns', 'Creatine Boost — 3 Pack',   '90 servings. The subscribe-and-save bundle most repeat customers land on.',                                                   '/campaign-covers/bold-buns.jpg',  11999, 1),
    ('demo-jaje-health', '10EX Gut Support Gummies','Berberine, apple cider vinegar and akkermansia in a 10x extract. 100 billion CFU, 20+ digestive enzymes, sugar-free, strawberry.', '/campaign-covers/jaje-health.jpg', 3499, 0),
    ('demo-jaje-health', '10EX Gummies — 2 Month',  'Two pouches. The pack size that matches the 60-day routine the brief talks about.',                                            '/campaign-covers/jaje-health.jpg', 5999, 1),
    ('demo-fuel', 'Beauty+ 24-in-One',              '60 capsules. Biotin, keratin, hyaluronic acid, MSM, saw palmetto, collagen support and vitamin complex in one daily capsule.',  '/campaign-covers/fuel.jpg',        3999, 0),
    ('demo-fuel', 'Beauty+ Buy 1 Get 1',            'The running offer: second bottle at 50% off, two in the cart.',                                                                '/campaign-covers/fuel.jpg',        5999, 1),
    ('demo-lebanta', 'Repair + Shine Treatment',    'Leave-in treatment. The hero product for the haircare showcase brief.',                                                        null,                               2800, 0)
  ) as x(handle, name, description, image_url, price_cents, position)
    on x.handle = b.handle
 where b.handle like 'demo-%';

-- ── What landed ──────────────────────────────────────────────
select b.name as brand,
       left(c.content_style, 60) || '…' as style,
       count(p.id) as products
  from public.brands b
  join public.campaigns c on c.brand_id = b.id
  left join public.campaign_products p on p.campaign_id = c.id
 where b.handle like 'demo-%'
 group by b.name, c.content_style
 order by b.name;
