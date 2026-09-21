-- ═══════════════════════════════════════════════════════════════
-- Give the creator test account one pending and one declined application.
--
-- So Browse → "Your applications" has both states to show: one waiting on
-- the brand, one declined with the brand's note. Uses the demo brands'
-- campaigns (Fuel, Jaje Health) and skips any campaign the creator is
-- already on, so it never demotes an accepted application.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_creator uuid;
  v_pending uuid;
  v_declined uuid;
begin
  -- The creator test account: the first real creator sign-up.
  select c.id into v_creator
    from public.creators c
    join public.profiles p on p.id = c.user_id
   where p.role = 'creator'
   order by p.created_at
   limit 1;
  if v_creator is null then
    raise exception 'No creator test account found.';
  end if;

  select ca.id into v_pending
    from public.campaigns ca
    join public.brands b on b.id = ca.brand_id
   where b.handle = 'demo-fuel'
     and ca.status::text in ('live', 'pending_fund', 'draft')
     and not exists (select 1 from public.applications a
                      where a.campaign_id = ca.id and a.creator_id = v_creator and a.status::text = 'accepted')
   order by ca.created_at limit 1;

  select ca.id into v_declined
    from public.campaigns ca
    join public.brands b on b.id = ca.brand_id
   where b.handle = 'demo-jaje-health'
     and ca.status::text in ('live', 'pending_fund', 'draft')
     and not exists (select 1 from public.applications a
                      where a.campaign_id = ca.id and a.creator_id = v_creator and a.status::text = 'accepted')
   order by ca.created_at limit 1;

  if v_pending is not null then
    insert into public.applications (campaign_id, creator_id, status, intake_path, message, created_at)
    values (v_pending, v_creator, 'pending', 'marketplace',
            'I film morning routines and my audience asks about supplements constantly. Would love to try the collagen on camera.',
            now() - interval '1 day')
    on conflict (campaign_id, creator_id) do update
      set status = 'pending', decision_note = null, decided_at = null;
  end if;

  if v_declined is not null then
    insert into public.applications (campaign_id, creator_id, status, intake_path, message,
                                     decision_note, decided_at, created_at)
    values (v_declined, v_creator, 'rejected', 'marketplace',
            'Big fan of the gummies. I can do a day-in-my-life style video.',
            'Thanks for applying! For this campaign we need creators who have posted at least one gut-health or wellness video. Share one and apply again, we would love to see it.',
            now() - interval '6 hours', now() - interval '3 days')
    on conflict (campaign_id, creator_id) do update
      set status = 'rejected',
          decision_note = excluded.decision_note,
          decided_at = excluded.decided_at;
  end if;
end $$;

-- ── What the creator now sees ────────────────────────────────
select b.name as brand, ca.name as campaign, a.status, a.decision_note
  from public.applications a
  join public.campaigns ca on ca.id = a.campaign_id
  join public.brands b     on b.id = ca.brand_id
  join public.creators cr  on cr.id = a.creator_id
  join public.profiles p   on p.id = cr.user_id
 where p.role = 'creator'
 order by a.status, b.name;
