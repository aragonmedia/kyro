-- ═══════════════════════════════════════════════════════════════
-- KYRO — creator-side demo data
--
-- Creates four demo brands with live campaigns, puts the test creator on
-- three of them, and generates 90 days of attributed orders with earnings in
-- every lifecycle state.
--
-- Two things make this safe to keep around:
--
--   1. Demo brands have owner_user_id = NULL. They belong to nobody, so they
--      never appear on Kevin's brand dashboard. That keeps the brand test
--      account clean for the live Shopify demo while the creator side stays
--      full. Campaigns are readable by any signed-in user under RLS, which is
--      why the creator can still see and work on them.
--
--   2. Everything hangs off brands whose handle starts with 'demo-'. The
--      script deletes those first, and every child row cascades, so re-running
--      it replaces the data rather than doubling it.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── Clean any previous run ───────────────────────────────────
delete from public.brands where handle like 'demo-%';

do $$
declare
  v_creator_id uuid;
  v_brand_id   uuid;
  v_campaign   uuid;
  v_submission uuid;
  v_order      uuid;
  v_attr       uuid;

  -- name, handle, tagline, category, commission rate (bps)
  brand_spec text[][] := array[
    array['Bold Buns',   'demo-bold-buns',   'Bakery-fresh, shipped cold',        'Food',     '1500'],
    array['Jaje Health', 'demo-jaje-health', 'Daily greens without the chalk',    'Wellness', '1200'],
    array['Fuel',        'demo-fuel',        'Clean energy, no crash',            'Beverage', '1000'],
    array['Lebanta',     'demo-lebanta',     'Skincare for people who forget to', 'Beauty',   '1800']
  ];

  spec         text[];
  i            int;
  j            int;
  n_orders     int;
  order_day    int;
  order_value  int;     -- cents
  rate_bps     int;
  commission   int;     -- cents
  fee          int;     -- cents
  placed       timestamptz;
  fulfilled    timestamptz;
  avail        timestamptz;
  v_state      public.earning_state;
  day_weight   numeric;
begin
  -- The test creator. Resolved by role so this does not hardcode an email.
  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.user_id
  where p.role = 'creator'
  limit 1;

  if v_creator_id is null then
    raise exception 'No creator account found. Sign up a creator first, then re-run.';
  end if;

  -- Give the creator a profile worth showing.
  update public.creators
     set handle              = coalesce(nullif(handle, ''), 'kevincreates'),
         bio                 = 'Short-form performance creator. Food, wellness and beauty.',
         location            = 'Seattle, WA',
         niche               = array['Food','Wellness','Beauty'],
         instagram_handle    = coalesce(instagram_handle, '@kevincreates'),
         instagram_followers = coalesce(instagram_followers, 48200),
         tiktok_handle       = coalesce(tiktok_handle, '@kevincreates'),
         tiktok_followers    = coalesce(tiktok_followers, 126400)
   where id = v_creator_id;

  for i in 1..array_length(brand_spec, 1) loop
    spec     := brand_spec[i:i][1:5];
    rate_bps := (brand_spec[i][5])::int;

    insert into public.brands (owner_user_id, name, handle, tagline, category, approval_status)
    values (null, brand_spec[i][1], brand_spec[i][2], brand_spec[i][3], brand_spec[i][4], 'approved')
    returning id into v_brand_id;

    insert into public.campaigns (
      brand_id, name, brief, status, deliverable_spec,
      commission_type, commission_percent_spend, commission_rate_bps,
      platform_fee_bps, clearing_days, activated_at, created_at
    )
    values (
      v_brand_id,
      brand_spec[i][1] || ' — Always On',
      'Ongoing performance campaign. Post what works, we run what converts.',
      'live',
      '9:16 video, 15-30s, hook in the first 2 seconds, show the product in use.',
      'percent_spend', rate_bps / 10000.0, rate_bps,
      100, 30,
      now() - ((60 + i * 5) || ' days')::interval,
      now() - ((70 + i * 5) || ' days')::interval
    )
    returning id into v_campaign;

    -- The creator is on the first three. The fourth stays open so the
    -- Browse tab has something to actually apply to during a demo.
    if i <= 3 then
      insert into public.applications (campaign_id, creator_id, status, intake_path, created_at)
      values (v_campaign, v_creator_id, 'accepted', 'marketplace', now() - ((55 + i * 5) || ' days')::interval);

      -- Two videos per campaign: one the brand is running, one they passed on
      -- with a reason. The pass is the whole point of the feedback loop, so
      -- the demo should show one.
      insert into public.submissions (campaign_id, creator_id, brand_id, video_url, status, submitted_at, decided_at)
      values (v_campaign, v_creator_id, v_brand_id, 'demo/placeholder.mp4', 'live',
              now() - ((50 + i * 4) || ' days')::interval,
              now() - ((48 + i * 4) || ' days')::interval)
      returning id into v_submission;

      insert into public.submissions (campaign_id, creator_id, brand_id, video_url, status, submitted_at, decided_at, brand_note)
      values (v_campaign, v_creator_id, v_brand_id, 'demo/placeholder-2.mp4', 'rejected',
              now() - ((22 + i * 3) || ' days')::interval,
              now() - ((20 + i * 3) || ' days')::interval,
              case i
                when 1 then 'Pacing drags after the second beat and we lost viewers there. Same hook, but cut it to 18 seconds and get the product on screen before the 2 second mark.'
                when 2 then 'Lighting is too warm against our packaging, the green reads brown. Shoot near a window or use a neutral bulb and we will run it.'
                else 'Great energy, wrong claim. We cannot say "clinically proven" in an ad. Reshoot the same script with "dermatologist tested" and it goes live.'
              end);

      -- Orders against the running video. Volume ramps over the window so the
      -- chart shows growth rather than a flat wall of identical bars.
      n_orders := 14 + i * 4;

      for j in 1..n_orders loop
        -- Weight recent days more heavily: a squared random skews late.
        day_weight  := power(random(), 0.55);
        order_day   := greatest(0, least(89, floor(89 - day_weight * 89)::int));
        order_value := 3200 + floor(random() * 14500)::int;
        commission  := floor(order_value * rate_bps / 10000.0)::int;
        fee         := floor(commission * 0.01)::int;

        placed    := date_trunc('day', now()) - (order_day || ' days')::interval
                     + (floor(random() * 14 + 8) || ' hours')::interval;
        fulfilled := placed + ((1 + floor(random() * 3)) || ' days')::interval;
        avail     := fulfilled + interval '30 days';

        -- State follows the real lifecycle, driven by dates rather than set
        -- arbitrarily, so the balance columns add up to something coherent.
        if fulfilled > now() then
          v_state := 'pending';
        elsif avail > now() then
          v_state := 'clearing';
        elsif order_day > 75 then
          v_state := 'paid';
        else
          v_state := 'available';
        end if;

        insert into public.orders (
          brand_id, external_id, external_number, currency,
          subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
          commissionable_cents, status, placed_at, fulfilled_at, created_at
        )
        values (
          v_brand_id,
          'demo-' || gen_random_uuid()::text,
          '#' || (10250 + i * 400 + j)::text,
          'USD',
          order_value, 0, 695, floor(order_value * 0.086)::int,
          order_value + 695 + floor(order_value * 0.086)::int,
          order_value,
          -- A CASE returns text, and text does not implicitly cast to an
          -- enum the way a bare literal does. Cast explicitly.
          (case when fulfilled > now() then 'placed' else 'fulfilled' end)::public.order_status,
          placed,
          case when fulfilled > now() then null else fulfilled end,
          placed
        )
        returning id into v_order;

        insert into public.order_attributions (
          order_id, submission_id, campaign_id, creator_id,
          method, weight, commissionable_cents, attributed_at
        )
        values (v_order, v_submission, v_campaign, v_creator_id,
                'utm', 1, order_value, placed)
        returning id into v_attr;

        insert into public.earnings (
          creator_id, brand_id, campaign_id, submission_id, order_id, attribution_id,
          commissionable_cents, commission_bps, commission_cents,
          platform_fee_bps, platform_fee_cents,
          state, available_at, state_changed_at, created_at
        )
        values (
          v_creator_id, v_brand_id, v_campaign, v_submission, v_order, v_attr,
          order_value, rate_bps, commission,
          100, fee,
          v_state, avail, placed, placed
        );
      end loop;
    end if;
  end loop;
end $$;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from public.brands      where handle like 'demo-%')            as demo_brands,
  (select count(*) from public.campaigns   where status = 'live')                 as live_campaigns,
  (select count(*) from public.applications where status = 'accepted')            as accepted_apps,
  (select count(*) from public.submissions)                                       as submissions,
  (select count(*) from public.orders)                                            as orders,
  (select count(*) from public.earnings)                                          as earnings;

select state, count(*) as rows, to_char(sum(commission_cents)/100.0, 'FM999,999.00') as dollars
from public.earnings group by state order by state;

select to_char(sum(commission_cents)/100.0, 'FM999,999.00') as earned_last_30_days
from public.earnings where created_at >= now() - interval '30 days';
