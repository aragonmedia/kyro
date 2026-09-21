-- ═══════════════════════════════════════════════════════════════
-- Give the creator test account one pending and one declined application.
--
-- The test creator is already on every demo brand's "Always On" campaign,
-- so this first adds a second campaign to Fuel and to Jaje Health (copied
-- from their existing one, products included) and applies there:
--
--   Fuel · Summer Push          → pending, waiting on the brand
--   Jaje Health · Gut Reset     → declined, with the brand's note
--
-- Never touches an accepted application. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_creator  uuid;
  spec       text[][] := array[
    -- brand handle,      new campaign name,           outcome
    array['demo-fuel',        'Fuel - Summer Push',      'pending'],
    array['demo-jaje-health', 'Jaje Health - Gut Reset', 'rejected']
  ];
  v_source   uuid;
  v_campaign uuid;
  i          int;
begin
  select c.id into v_creator
    from public.creators c
    join public.profiles p on p.id = c.user_id
   where p.role = 'creator'
   order by p.created_at
   limit 1;
  if v_creator is null then
    raise exception 'No creator test account found.';
  end if;

  for i in 1..array_length(spec, 1) loop
    -- 1. The second campaign, created once.
    select ca.id into v_campaign
      from public.campaigns ca
      join public.brands b on b.id = ca.brand_id
     where b.handle = spec[i][1] and ca.name = spec[i][2];

    if v_campaign is null then
      select ca.id into v_source
        from public.campaigns ca
        join public.brands b on b.id = ca.brand_id
       where b.handle = spec[i][1]
       order by ca.created_at
       limit 1;
      if v_source is null then
        raise exception 'No campaign found for %.', spec[i][1];
      end if;

      v_campaign := gen_random_uuid();

      -- Copy every column of the existing campaign, then change what makes
      -- it a different campaign. Written this way so it keeps working as
      -- columns are added to campaigns.
      insert into public.campaigns
      select (jsonb_populate_record(
                null::public.campaigns,
                to_jsonb(ca) || jsonb_build_object(
                  'id', v_campaign,
                  'name', spec[i][2],
                  'status', 'live',
                  'invite_token', null,
                  'spent_cents', 0,
                  'pool_balance_cents', 0,
                  'created_at', now() - interval '5 days'
                )
             )).*
        from public.campaigns ca
       where ca.id = v_source;

      insert into public.campaign_products
        (campaign_id, brand_id, name, description, image_url, price_cents, external_url, position)
      select v_campaign, cp.brand_id, cp.name, cp.description, cp.image_url, cp.price_cents, cp.external_url, cp.position
        from public.campaign_products cp
       where cp.campaign_id = v_source;
    end if;

    -- 2. The application, unless the creator is already on that campaign.
    if not exists (select 1 from public.applications a
                    where a.campaign_id = v_campaign and a.creator_id = v_creator
                      and a.status::text = 'accepted') then
      if spec[i][3] = 'pending' then
        insert into public.applications (campaign_id, creator_id, status, intake_path, message, created_at)
        values (v_campaign, v_creator, 'pending', 'marketplace',
                'I film morning routines and my audience asks about supplements constantly. Would love to try the collagen on camera.',
                now() - interval '1 day')
        on conflict (campaign_id, creator_id) do update
          set status = 'pending', decision_note = null, decided_at = null;
      else
        insert into public.applications (campaign_id, creator_id, status, intake_path, message,
                                         decision_note, decided_at, created_at)
        values (v_campaign, v_creator, 'rejected', 'marketplace',
                'Big fan of the gummies. I can do a day-in-my-life style video.',
                'Thanks for applying! For this campaign we need creators who have posted at least one gut-health or wellness video. Share one and apply again, we would love to see it.',
                now() - interval '6 hours', now() - interval '3 days')
        on conflict (campaign_id, creator_id) do update
          set status = 'rejected',
              decision_note = excluded.decision_note,
              decided_at = excluded.decided_at;
      end if;
    end if;
  end loop;
end $$;

-- ── What the creator now sees ────────────────────────────────
select b.name as brand, ca.name as campaign, a.status, a.decision_note
  from public.applications a
  join public.campaigns ca on ca.id = a.campaign_id
  join public.brands b     on b.id = ca.brand_id
  join public.creators cr  on cr.id = a.creator_id
  join public.profiles p   on p.id = cr.user_id
 where p.role = 'creator'
 order by case a.status::text when 'pending' then 0 when 'rejected' then 1 else 2 end, b.name;
