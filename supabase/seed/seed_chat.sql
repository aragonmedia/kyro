-- ═══════════════════════════════════════════════════════════════
-- A conversation between the brand test account and the creator test account.
--
-- Two threads, matching the two shapes the product has:
--
--   · the Bold Buns campaign room — brand and creator, together
--   · a private thread about the video the brand passed on
--
-- ⚠ This disables `messages_stamp_sender` for the length of the insert.
--
-- That trigger is what stops a client posting as someone else: it overwrites
-- sender_user_id with auth.uid() and derives the name server-side. The SQL
-- editor has no auth.uid(), so with the trigger on, every seeded message would
-- be stamped with a null sender and fail. Turning it off here is safe because
-- this runs as the database owner, not as a client — but it is turned back on
-- in the same transaction, and the last query below proves it.
--
-- Run AFTER adopt_bold_buns.sql. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

begin;

alter table public.messages disable trigger messages_stamp_sender;

do $$
declare
  v_brand_user   uuid;
  v_creator_user uuid;
  v_brand_name   text;
  v_creator_name text;
  v_brand        uuid;
  v_campaign     uuid;
  v_submission   uuid;
  v_room         uuid;
  v_private      uuid;
begin
  select p.id into v_brand_user   from public.profiles p where p.role = 'brand'   order by p.created_at limit 1;
  select p.id into v_creator_user from public.profiles p where p.role = 'creator' order by p.created_at limit 1;

  if v_brand_user is null or v_creator_user is null then
    raise exception 'Need both a brand and a creator account. Sign both up, then re-run.';
  end if;

  select b.id, b.name into v_brand, v_brand_name
    from public.brands b where b.owner_user_id = v_brand_user order by b.created_at limit 1;

  select coalesce(nullif(c.handle, ''), 'the creator') into v_creator_name
    from public.creators c where c.user_id = v_creator_user limit 1;

  select c.id into v_campaign from public.campaigns c where c.brand_id = v_brand order by c.created_at limit 1;
  if v_campaign is null then
    raise exception 'That brand has no campaigns. Run adopt_bold_buns.sql first.';
  end if;

  -- The video the brand passed on: that is what a private thread is for.
  select s.id into v_submission
    from public.submissions s
   where s.campaign_id = v_campaign and s.status = 'rejected'
   order by s.submitted_at desc
   limit 1;

  -- ── Threads ──────────────────────────────────────────────
  select id into v_room from public.threads where kind = 'campaign' and campaign_id = v_campaign;
  if v_room is null then
    insert into public.threads (kind, campaign_id) values ('campaign', v_campaign) returning id into v_room;
  end if;

  if v_submission is not null then
    select id into v_private from public.threads where kind = 'submission' and submission_id = v_submission;
    if v_private is null then
      insert into public.threads (kind, campaign_id, submission_id)
      values ('submission', v_campaign, v_submission) returning id into v_private;
    end if;
  end if;

  -- Clear anything a previous run left, so re-running replaces rather than
  -- doubles the conversation.
  delete from public.messages where thread_id in (v_room, v_private);

  -- ── The campaign room ────────────────────────────────────
  insert into public.messages (thread_id, sender_user_id, sender_name, sender_role, body, created_at) values
    (v_room, v_brand_user, v_brand_name, 'brand',
     'Welcome to the Bold Buns room. Post whenever you like, no approval needed before you upload. Commission is 15% on every attributed order.',
     now() - interval '9 days'),
    (v_room, v_creator_user, v_creator_name, 'creator',
     'Appreciate it. Is the gym angle still what you want, or are you testing anything else right now?',
     now() - interval '9 days' + interval '3 hours'),
    (v_room, v_brand_user, v_brand_name, 'brand',
     'Gym is still converting best for us, especially in Spanish. Keep the product on screen early and we will run it.',
     now() - interval '8 days'),
    (v_room, v_creator_user, v_creator_name, 'creator',
     'Got it. Sending one tonight and another over the weekend.',
     now() - interval '8 days' + interval '40 minutes');

  -- ── The private thread about the passed-over video ───────
  if v_private is not null then
    insert into public.messages (thread_id, sender_user_id, sender_name, sender_role, body, created_at) values
      (v_private, v_brand_user, v_brand_name, 'brand',
       'Left you a note on this one. The pacing drags after the second beat and we lost viewers there. Same hook, cut to 18 seconds, product on screen before the 2 second mark and we will run it.',
       now() - interval '3 days'),
      (v_private, v_creator_user, v_creator_name, 'creator',
       'That is fair, it did feel long on the second watch. Recutting it now. Do you want the same audio or should I re-record?',
       now() - interval '3 days' + interval '2 hours'),
      (v_private, v_brand_user, v_brand_name, 'brand',
       'Same audio is fine. It was the timing, not the script.',
       now() - interval '2 days');
  end if;
end $$;

alter table public.messages enable trigger messages_stamp_sender;

commit;

-- ── What landed, and that the guard is back on ───────────────
select t.kind,
       count(m.id) as messages,
       max(m.created_at) as last_message
  from public.threads t
  left join public.messages m on m.thread_id = t.id
 group by t.kind;

select tgname as trigger, tgenabled as enabled_flag,
       case when tgenabled = 'O' then 'ON — senders are stamped from the session'
            else 'OFF — FIX THIS before anyone uses chat' end as verdict
  from pg_trigger
 where tgrelid = 'public.messages'::regclass and not tgisinternal;
