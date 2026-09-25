-- ═══════════════════════════════════════════════════════════════
-- Fill out the review account so a reviewer sees a working portal.
--
-- seed_review_account.sql attached the Fuel demo brand, which only has two
-- videos. This adds four more from the demo creators so Submissions shows
-- videos in every state: waiting on a decision, in use, and passed over with
-- a reason. Frames are reused from /public/submission-thumbs.
--
-- Run after seed_review_account.sql. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_brand    uuid;
  v_campaign uuid;
  v_creator  uuid;
  spec       text[][] := array[
    -- video_url suffix, status,     thumbnail,                    note
    array['review-1', 'submitted', '/submission-thumbs/1.jpg', ''],
    array['review-2', 'submitted', '/submission-thumbs/2.jpg', ''],
    array['review-3', 'live',      '/submission-thumbs/3.jpg', ''],
    array['review-4', 'rejected',  '/submission-thumbs/5.jpg',
          'Great energy, but the product is off screen for the first six seconds. Same hook with the tub in frame and we will run it.']
  ];
  i int;
begin
  select b.id into v_brand
    from public.brands b
    join public.profiles p on p.id = b.owner_user_id
   where lower(p.email) = 'review@itskyro.com'
   order by b.created_at
   limit 1;
  if v_brand is null then
    raise exception 'Run seed_review_account.sql first.';
  end if;

  select id into v_campaign
    from public.campaigns
   where brand_id = v_brand
   order by case when status::text = 'live' then 0 else 1 end, created_at
   limit 1;
  if v_campaign is null then
    raise exception 'That brand has no campaign.';
  end if;

  for i in 1..array_length(spec, 1) loop
    -- Spread across whichever demo creators exist, so the roster looks real.
    select c.id into v_creator
      from public.creators c
     where c.handle is not null
     order by (c.user_id is null) desc, c.created_at
     offset ((i - 1) % greatest(1, (select count(*) from public.creators)))
     limit 1;

    if not exists (
      select 1 from public.submissions where video_url = 'demo/' || spec[i][1] || '.mp4'
    ) then
      insert into public.submissions
        (campaign_id, creator_id, brand_id, video_url, thumbnail_url, status,
         brand_note, decided_at, submitted_at)
      values
        (v_campaign, v_creator, v_brand,
         'demo/' || spec[i][1] || '.mp4', spec[i][3], spec[i][2]::public.submission_status,
         nullif(spec[i][4], ''),
         case when spec[i][2] = 'submitted' then null else now() - (i || ' days')::interval end,
         now() - ((i * 9) || ' hours')::interval);
    end if;
  end loop;
end $$;

-- ── What the reviewer sees under Submissions ─────────────────
select cr.handle as creator, s.status, s.thumbnail_url, left(coalesce(s.brand_note, ''), 40) as note
  from public.submissions s
  join public.brands b    on b.id = s.brand_id
  join public.creators cr on cr.id = s.creator_id
  join public.profiles p  on p.id = b.owner_user_id
 where lower(p.email) = 'review@itskyro.com'
 order by s.submitted_at desc;
