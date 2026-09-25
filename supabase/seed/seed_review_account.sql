-- ═══════════════════════════════════════════════════════════════
-- Point demo data at the Shopify review account.
--
-- Shopify's reviewers need one login that shows a working brand portal:
-- campaigns, creators, videos, attributed orders, money owed and paid.
--
-- Before running: sign up at itskyro.com as a BRAND with the review email,
-- confirm the address, and sign in once so the account exists.
--
-- What this does:
--   1. Finds the review account by email.
--   2. Gives it the best-stocked demo brand that nobody owns (most earnings).
--      Your own Bold Buns account is never touched.
--   3. Releases the empty starter brand that sign-up created for it.
--   4. Marks the brand set up, so the reviewer lands on the portal rather
--      than the setup wizard.
--   5. Spreads that brand's earnings across every state, so Finance shows
--      money due now, money clearing, and a payment history.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_review uuid;
  v_brand  uuid;
  v_old    uuid;
  v_count  integer;
begin
  select id into v_review from public.profiles where lower(email) = 'review@itskyro.com';
  if v_review is null then
    raise exception 'No account for review@itskyro.com. Sign up as a brand with that email first.';
  end if;

  -- Already has a demo brand from a previous run?
  select b.id into v_brand
    from public.brands b
   where b.owner_user_id = v_review
     and exists (select 1 from public.campaigns c where c.brand_id = b.id)
   order by b.created_at
   limit 1;

  if v_brand is null then
    -- The unowned demo brand with the most earnings.
    select b.id into v_brand
      from public.brands b
     where b.owner_user_id is null
       and b.handle like 'demo-%'
     order by (select count(*) from public.earnings e where e.brand_id = b.id) desc,
              (select count(*) from public.submissions s where s.brand_id = b.id) desc
     limit 1;

    if v_brand is null then
      raise exception 'No unowned demo brand found. Run the demo seeds first.';
    end if;

    -- Step the empty starter brand aside so the review account owns one brand.
    select id into v_old
      from public.brands
     where owner_user_id = v_review and id <> v_brand
     order by created_at
     limit 1;
    if v_old is not null then
      update public.brands set owner_user_id = null where id = v_old;
    end if;

    update public.brands
       set owner_user_id = v_review,
           created_at = least(created_at, now() - interval '2 years')
     where id = v_brand;
  end if;

  -- Straight to the portal, not the setup wizard.
  update public.brands
     set setup_complete = true,
         approval_status = 'approved',
         website_url = coalesce(website_url, 'https://itskyro.com'),
         description = coalesce(description, 'Demo brand for App Store review.'),
         business_type = coalesce(business_type, 'dtc'),
         currency = coalesce(currency, 'USD')
   where id = v_brand;

  -- Live campaigns, so the reviewer sees an active account.
  update public.campaigns set status = 'live'
   where brand_id = v_brand and status::text in ('draft', 'pending_fund');

  select count(*) into v_count from public.earnings where brand_id = v_brand;
  if v_count > 0 then
    -- Oldest already paid, then due now, then clearing, newest still pending.
    with ranked as (
      select e.id,
             ntile(4) over (order by e.created_at) as bucket
        from public.earnings e
       where e.brand_id = v_brand
    )
    update public.earnings e
       set state = case r.bucket
                     when 1 then 'paid'::public.earning_state
                     when 2 then 'available'::public.earning_state
                     when 3 then 'clearing'::public.earning_state
                     else 'pending'::public.earning_state
                   end,
           available_at = case r.bucket
                            when 1 then now() - interval '20 days'
                            when 2 then now() - interval '2 days'
                            when 3 then now() + interval '9 days'
                            else null
                          end
      from ranked r
     where r.id = e.id;
  end if;
end $$;

-- ── What the reviewer will see ───────────────────────────────
select b.name as brand,
       b.handle,
       p.email as signs_in_as,
       (select count(*) from public.campaigns   c where c.brand_id = b.id) as campaigns,
       (select count(*) from public.submissions s where s.brand_id = b.id) as videos,
       (select count(*) from public.earnings    e where e.brand_id = b.id) as attributed_orders,
       (select count(*) from public.earnings    e where e.brand_id = b.id and e.state = 'available') as payable_now
  from public.brands b
  join public.profiles p on p.id = b.owner_user_id
 where lower(p.email) = 'review@itskyro.com';
