-- ═══════════════════════════════════════════════════════════════
-- Give Bold Buns a balance worth demoing.
--
-- The seed derives earning state from dates, so how much is payable depends
-- entirely on when you ran it. This reshapes the existing rows into a spread
-- that shows every state at once: money due now, money still clearing, orders
-- not fulfilled yet, and a history of what has already been paid.
--
-- It does NOT invent orders. Every row here already existed; only `state`,
-- `available_at` and the matching order dates move. The totals a brand sees
-- still reconcile to real attributed orders.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_brand uuid;
  v_total int;
begin
  select b.id into v_brand
    from public.brands b
    join public.profiles p on p.id = b.owner_user_id
   where p.role = 'brand'
   order by b.created_at
   limit 1;

  if v_brand is null then
    raise exception 'No brand account found.';
  end if;

  select count(*) into v_total from public.earnings where brand_id = v_brand;
  if v_total = 0 then
    raise exception 'That brand has no earnings. Run adopt_bold_buns.sql first.';
  end if;

  -- Spread by recency: oldest already paid, then due, then clearing, newest
  -- still unfulfilled. Mirrors how a real account ages.
  with ranked as (
    select e.id,
           row_number() over (order by e.created_at) as n,
           count(*) over () as total
      from public.earnings e
     where e.brand_id = v_brand
  )
  update public.earnings e
     set state = case
                   when r.n <= r.total * 0.25 then 'paid'
                   when r.n <= r.total * 0.70 then 'available'
                   when r.n <= r.total * 0.90 then 'clearing'
                   else 'pending'
                 end::public.earning_state,
         available_at = case
                          when r.n <= r.total * 0.70 then now() - interval '2 days'
                          when r.n <= r.total * 0.90 then now() + ((r.n % 18) + 3 || ' days')::interval
                          else null
                        end,
         state_changed_at = now()
    from ranked r
   where r.id = e.id;

  -- Orders have to agree with the earnings sitting on them: an earning that
  -- is "not fulfilled yet" cannot hang off a fulfilled order.
  update public.orders o
     set status = 'placed', fulfilled_at = null
    from public.earnings e
   where e.order_id = o.id and e.brand_id = v_brand and e.state = 'pending';

  update public.orders o
     set status = 'fulfilled',
         fulfilled_at = coalesce(o.fulfilled_at, o.placed_at + interval '2 days')
    from public.earnings e
   where e.order_id = o.id and e.brand_id = v_brand and e.state <> 'pending';
end $$;

-- ── What a brand now sees on Finance ─────────────────────────
select case e.state
         when 'available' then '1 · Due now'
         when 'clearing'  then '2 · Clearing'
         when 'pending'   then '3 · Not fulfilled'
         when 'paid'      then '4 · Paid'
         else e.state::text
       end as bucket,
       count(*) as orders,
       to_char(sum(e.commission_cents) / 100.0, 'FM999,990.00') as commission,
       to_char(sum(e.platform_fee_cents) / 100.0, 'FM999,990.00') as kyro_fee
  from public.earnings e
  join public.brands b on b.id = e.brand_id
  join public.profiles p on p.id = b.owner_user_id
 where p.role = 'brand'
 group by e.state
 order by 1;
