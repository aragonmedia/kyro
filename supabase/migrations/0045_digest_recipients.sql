-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0045: who has unread messages waiting
--
-- The inbox function my_threads() answers "what can the person calling me
-- see", which is the right question for a browser and the wrong one for a
-- nightly job: a cron runs as the service role and is nobody, so auth.uid()
-- is null and every membership check comes back false.
--
-- This asks the question the other way round. For each thread it works out
-- who is in it, counts what each of them has not read, and returns one row
-- per person per thread. The daily digest sends one email per person from
-- that, never one per message.
--
-- Membership is spelled out here rather than reused from can_see_thread for
-- the same reason: that function answers for the caller. The rules are the
-- same ones, written in the other direction:
--
--   support     the account the room belongs to, and the KYRO team
--   campaign    the brand owner, and every accepted creator
--   submission  the brand owner, and that video's creator
--
-- Admins are included for support threads only. The KYRO team should hear
-- about a brand waiting on an answer; it should not get a nightly digest of
-- every campaign room on the platform.
--
-- profiles.notify_email (migration 0013) is honoured here rather than in the
-- job, so nobody can forget it. Transactional mail does not come through
-- this function and is unaffected.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.pending_message_digests()
returns table (
  user_id       uuid,
  email         text,
  full_name     text,
  thread_id     uuid,
  kind          text,
  unread        bigint,
  thread_title  text,
  thread_context text,
  last_sender   text,
  last_body     text,
  last_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with participants as (
    -- The account a support room belongs to.
    select t.id as thread_id, t.support_user_id as user_id
      from public.threads t
     where t.kind = 'support' and t.support_user_id is not null

    union
    -- The KYRO team, on support rooms only.
    select t.id, p.id
      from public.threads t
      join public.profiles p on p.role = 'admin'
     where t.kind = 'support'

    union
    -- The brand that owns the campaign, for both campaign and video rooms.
    select t.id, b.owner_user_id
      from public.threads t
      join public.campaigns c on c.id = t.campaign_id
      join public.brands b    on b.id = c.brand_id
     where b.owner_user_id is not null

    union
    -- Every creator accepted onto the campaign.
    select t.id, cr.user_id
      from public.threads t
      join public.applications a on a.campaign_id = t.campaign_id and a.status = 'accepted'
      join public.creators cr    on cr.id = a.creator_id
     where t.kind = 'campaign' and cr.user_id is not null

    union
    -- That video's creator, and nobody else.
    select t.id, cr.user_id
      from public.threads t
      join public.submissions s on s.id = t.submission_id
      join public.creators cr   on cr.id = s.creator_id
     where t.kind = 'submission' and cr.user_id is not null
  ),
  counted as (
    select p.thread_id,
           p.user_id,
           (select count(*) from public.messages m
             where m.thread_id = p.thread_id
               and m.sender_user_id <> p.user_id
               and m.created_at > coalesce(
                     (select tr.last_read_at from public.thread_reads tr
                       where tr.thread_id = p.thread_id and tr.user_id = p.user_id),
                     'epoch'::timestamptz)) as unread,
           -- The last message from somebody else, not the last message. A
           -- digest that quotes the reader back to themselves tells them
           -- nothing about why they should open it.
           (select m.body        from public.messages m
             where m.thread_id = p.thread_id and m.sender_user_id <> p.user_id
             order by m.created_at desc limit 1) as last_body,
           (select m.sender_name from public.messages m
             where m.thread_id = p.thread_id and m.sender_user_id <> p.user_id
             order by m.created_at desc limit 1) as last_sender,
           (select m.created_at  from public.messages m
             where m.thread_id = p.thread_id and m.sender_user_id <> p.user_id
             order by m.created_at desc limit 1) as last_at
      from participants p
  )
  select pr.id,
         pr.email,
         nullif(btrim(coalesce(pr.full_name, '')), ''),
         t.id,
         t.kind,
         cn.unread,
         -- Titled the way the person reading it would name the room.
         case
           when t.kind = 'support' and pr.role = 'admin' then coalesce(
             (select sb.name from public.brands sb where sb.owner_user_id = t.support_user_id limit 1),
             (select nullif(scr.handle, '') from public.creators scr where scr.user_id = t.support_user_id limit 1),
             'Account')
           when t.kind = 'support' then 'KYRO team'
           when t.kind = 'campaign' then c.name
           else coalesce('@' || cr.handle || '''s video', 'A video')
         end,
         case
           when t.kind = 'support' then 'KYRO team · support'
           when t.kind = 'campaign' then coalesce(b.name, 'Brand') || ' · everyone on this campaign'
           else coalesce(c.name, 'Campaign') || ' · private'
         end,
         cn.last_sender,
         cn.last_body,
         cn.last_at
    from counted cn
    join public.profiles pr        on pr.id = cn.user_id
    join public.threads t          on t.id = cn.thread_id
    left join public.campaigns c   on c.id = t.campaign_id
    left join public.brands b      on b.id = c.brand_id
    left join public.submissions s on s.id = t.submission_id
    left join public.creators cr   on cr.id = s.creator_id
   where cn.unread > 0
     and pr.notify_email
     and coalesce(pr.email, '') <> ''
   order by pr.id, cn.last_at desc;
$$;

-- Service role only. The browser has my_threads(), which answers for the
-- caller; this one answers for everybody and has no business being callable
-- from a session.
revoke all on function public.pending_message_digests() from public, anon, authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'pending_message_digests') as digest_fn,
  (select count(*) from public.pending_message_digests())                 as rows_waiting_now;
