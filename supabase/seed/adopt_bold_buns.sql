-- ═══════════════════════════════════════════════════════════════
-- Make the brand test account BE Bold Buns.
--
-- The seed gave the demo brands owner_user_id = NULL on purpose, so they
-- never showed up on the brand dashboard. That kept the brand side clean but
-- also kept it empty: no submissions to review, no roster, no conversations.
--
-- This moves everything that hangs off the demo Bold Buns onto the brand row
-- the brand test account already owns, then deletes the now-empty demo row.
-- Moving rather than reassigning ownership matters because getMyBrand() takes
-- the OLDEST brand a user owns, and the auto-provisioned one predates the seed
-- — so simply setting owner_user_id on the demo row would have done nothing
-- visible.
--
-- Deliberately NOT touched: brand_connections. Shopify and Meta stay
-- unconnected so the live connect demo still works.
--
-- Safe to run more than once. Re-run it after re-seeding.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_user   uuid;
  v_own    uuid;   -- the brand row the test account already owns
  v_demo   uuid;   -- the seeded Bold Buns
  v_tbl    record;
  v_moved  int := 0;
begin
  -- The brand test account, resolved by role rather than a hardcoded email.
  select p.id into v_user
    from public.profiles p
   where p.role = 'brand'
   order by p.created_at
   limit 1;

  if v_user is null then
    raise exception 'No brand account found. Sign up as a brand first, then re-run.';
  end if;

  select b.id into v_own
    from public.brands b
   where b.owner_user_id = v_user
   order by b.created_at
   limit 1;

  if v_own is null then
    raise exception 'That brand account has no brand row yet. Sign in as the brand once, then re-run.';
  end if;

  select b.id into v_demo from public.brands b where b.handle = 'demo-bold-buns';

  -- ── Move every child row, whatever table it lives in ──────
  -- Driven off the catalog rather than a hand-written list, so a table added
  -- later with a brand_id is carried across without anyone remembering to
  -- edit this script.
  if v_demo is not null and v_demo <> v_own then
    for v_tbl in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public'
         and c.column_name = 'brand_id'
         and t.table_type = 'BASE TABLE'
    loop
      execute format('update public.%I set brand_id = %L where brand_id = %L', v_tbl.table_name, v_own, v_demo);
      get diagnostics v_moved = row_count;
      raise notice 'moved % row(s) in %', v_moved, v_tbl.table_name;
    end loop;
  end if;

  -- ── Make the owned row look like Bold Buns ───────────────
  update public.brands
     set name           = 'Bold Buns',
         handle         = 'bold-buns',
         tagline        = 'Daily wellness and performance support',
         category       = 'Wellness',
         description    = 'Creatine, collagen and daily performance support. Sold direct, shipped fast.',
         website_url    = 'https://boldbuns.com',
         business_type  = 'ecommerce',
         currency       = 'USD',
         logo_url       = '/brand-logos/bold-buns.png',
         approval_status = 'approved',
         setup_complete = true
   where id = v_own;

  -- ── Drop the emptied demo row ────────────────────────────
  if v_demo is not null and v_demo <> v_own then
    delete from public.brands where id = v_demo;
  end if;
end $$;

-- ── What the brand account now owns ──────────────────────────
select b.name,
       b.handle,
       b.setup_complete,
       (select count(*) from public.campaigns   c where c.brand_id = b.id) as campaigns,
       (select count(*) from public.submissions s where s.brand_id = b.id) as submissions,
       (select count(*) from public.orders      o where o.brand_id = b.id) as orders,
       (select count(*) from public.earnings    e where e.brand_id = b.id) as earnings
  from public.brands b
  join public.profiles p on p.id = b.owner_user_id
 where p.role = 'brand';
