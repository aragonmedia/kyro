-- ═══════════════════════════════════════════════════════════════
-- Two Bold Buns videos waiting on a decision.
--
-- So the brand side has something under "Needs a decision" in
-- Submissions → Content library during the demo.
--
-- Uploaded by the creator test account, on the Bold Buns campaign.
-- No thumbnail on purpose: they fall back to the Bold Buns product image
-- rather than reusing a frame already shown on another video.
--
-- The video paths start with demo/, which the library reads as "no file
-- stored" and says so, instead of offering a download that fails.
--
-- Safe to run more than once: it only adds what is missing.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_brand    uuid;
  v_campaign uuid;
  v_creator  uuid;
  v_n        integer;
begin
  select id into v_brand from public.brands where handle = 'bold-buns';
  if v_brand is null then
    raise exception 'No brand with handle bold-buns. Run adopt_bold_buns.sql first.';
  end if;

  select id into v_campaign
    from public.campaigns
   where brand_id = v_brand
   order by case when status::text = 'live' then 0 else 1 end, created_at
   limit 1;
  if v_campaign is null then
    raise exception 'Bold Buns has no campaign yet.';
  end if;

  -- The creator test account: the first real creator sign-up.
  select c.id into v_creator
    from public.creators c
    join public.profiles p on p.id = c.user_id
   where p.role = 'creator'
   order by p.created_at
   limit 1;
  if v_creator is null then
    raise exception 'No creator test account found. Sign one up, then re-run.';
  end if;

  for v_n in 1..2 loop
    if not exists (
      select 1 from public.submissions
       where video_url = 'demo/placeholder-pending-' || v_n || '.mp4'
    ) then
      insert into public.submissions
        (campaign_id, creator_id, brand_id, video_url, thumbnail_url, status, submitted_at)
      values
        (v_campaign, v_creator, v_brand,
         'demo/placeholder-pending-' || v_n || '.mp4', null, 'submitted',
         now() - (v_n || ' hours')::interval);
    end if;
  end loop;
end $$;

-- ── What landed ──────────────────────────────────────────────
select c.name as campaign, cr.handle as creator, s.status, s.video_url, s.submitted_at
  from public.submissions s
  join public.campaigns c  on c.id = s.campaign_id
  join public.creators  cr on cr.id = s.creator_id
 where s.video_url like 'demo/placeholder-pending-%'
 order by s.submitted_at desc;
