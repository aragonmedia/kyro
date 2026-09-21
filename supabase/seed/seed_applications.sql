-- ═══════════════════════════════════════════════════════════════
-- Pending applications for Bold Buns, to review in the demo.
--
-- Three fictional creators apply to the Bold Buns campaign, each with a pitch,
-- so the Creators page has an approval queue to walk through.
--
-- These creators have no login (user_id is null). They exist only so a brand
-- has someone to accept or decline. They are marked with stats.demo = true,
-- which is what the cleanup at the top keys off, so re-running replaces them
-- rather than doubling them — and nothing real is ever deleted.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- ── Clean any previous run ───────────────────────────────────
delete from public.creators where user_id is null and stats->>'demo' = 'true';

do $$
declare
  v_campaign uuid;
  v_creator  uuid;
  spec       text[][] := array[
    -- handle, bio, location, niche, ig handle, ig followers, tt followers, pitch
    array['fitwithmarisol',
          'Gym lifestyle in Spanish. Morning lifts, honest supplement reviews, no fake transformations.',
          'Miami, FL', 'Fitness,Wellness',
          '@fitwithmarisol', '41800', '92300',
          'Hola! I film in the gym five days a week, almost all in Spanish, and my audience is 70% women 22 to 34. I already take creatine daily so this would be a real routine video, not a script. Happy to do a 15 to 20 second cut with the scoop on screen in the first two seconds.'],
    array['liftsbyandre',
          'Powerlifting and recovery. Bilingual content, mostly short form.',
          'Houston, TX', 'Fitness,Sports',
          '@liftsbyandre', '28400', '156000',
          'Big fan of the pink tub, it stands out on camera. My last three supplement videos each drove orders through a link in bio. I can turn around two cuts this week, one gym and one post-workout kitchen shot.'],
    array['dailymacrosdana',
          'Macros, meal prep and the supplements that actually earn a spot in my bag.',
          'Phoenix, AZ', 'Wellness,Food',
          '@dailymacrosdana', '63100', '47800',
          'I focus on the everyday side of fitness rather than the gym itself, which tends to convert well with people just starting out. Would love to show it as part of a morning routine.']
  ];
  i int;
begin
  select c.id into v_campaign
    from public.campaigns c
    join public.brands b   on b.id = c.brand_id
    join public.profiles p on p.id = b.owner_user_id
   where p.role = 'brand'
   order by c.created_at
   limit 1;

  if v_campaign is null then
    raise exception 'No brand campaign found. Run adopt_bold_buns.sql first.';
  end if;

  for i in 1..array_length(spec, 1) loop
    insert into public.creators
      (user_id, handle, bio, location, niche,
       instagram_handle, instagram_followers, tiktok_handle, tiktok_followers, stats)
    values
      (null, spec[i][1], spec[i][2], spec[i][3], string_to_array(spec[i][4], ','),
       spec[i][5], spec[i][6]::int, '@' || spec[i][1], spec[i][7]::int,
       jsonb_build_object('demo', true))
    returning id into v_creator;

    insert into public.applications (campaign_id, creator_id, status, intake_path, message, created_at)
    values (v_campaign, v_creator, 'pending', 'marketplace', spec[i][8],
            now() - ((i * 7) || ' hours')::interval);
  end loop;
end $$;

-- ── What the brand now has to review ─────────────────────────
select cr.handle,
       cr.instagram_followers as ig,
       cr.tiktok_followers    as tiktok,
       a.status,
       left(a.message, 60) || '…' as pitch
  from public.applications a
  join public.creators cr on cr.id = a.creator_id
 where a.status = 'pending'
 order by a.created_at desc;
