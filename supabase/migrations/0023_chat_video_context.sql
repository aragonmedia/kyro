-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0023: the video in a video conversation
--
-- A submission thread is about one video, but until now neither side could
-- see which one without leaving the chat. This gives the chat what it needs
-- to show it:
--
--   · my_threads() also returns the creator's handle, the video's frame (or
--     the campaign image when there is no frame) and its status, so the
--     thread list can show a thumbnail and the brand sees whose video it is
--   · submission_thread_context() returns the full summary for the header
--     card inside the conversation: video path, status, the brand's note
--
-- Both only return rows the caller can already see through can_see_thread,
-- so nothing new is exposed: the brand and that video's creator, nobody else.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- The return type changes, which create or replace cannot do.
drop function if exists public.my_threads();

create function public.my_threads()
returns table (
  thread_id      uuid,
  kind           public.thread_kind,
  campaign_id    uuid,
  campaign_name  text,
  brand_name     text,
  submission_id  uuid,
  last_body      text,
  last_sender    text,
  last_at        timestamptz,
  unread         bigint,
  creator_handle text,
  video_thumb    text,
  video_status   text
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select t.* from public.threads t where public.can_see_thread(t.id)
  ),
  last_msg as (
    select distinct on (m.thread_id)
           m.thread_id, m.body, m.sender_name, m.created_at
      from public.messages m
      join visible v on v.id = m.thread_id
     order by m.thread_id, m.created_at desc
  )
  select v.id,
         v.kind,
         v.campaign_id,
         c.name,
         b.name,
         v.submission_id,
         lm.body,
         lm.sender_name,
         lm.created_at,
         (select count(*) from public.messages m2
           where m2.thread_id = v.id
             and m2.sender_user_id <> auth.uid()
             and m2.created_at > coalesce(
                   (select tr.last_read_at from public.thread_reads tr
                     where tr.thread_id = v.id and tr.user_id = auth.uid()),
                   'epoch'::timestamptz)),
         cr.handle,
         coalesce(s.thumbnail_url, c.cover_url),
         s.status::text
    from visible v
    join public.campaigns c on c.id = v.campaign_id
    join public.brands b    on b.id = c.brand_id
    left join public.submissions s on s.id = v.submission_id
    left join public.creators cr   on cr.id = s.creator_id
    left join last_msg lm   on lm.thread_id = v.id
   order by coalesce(lm.created_at, v.created_at) desc;
$$;

grant execute on function public.my_threads() to authenticated;

/** Everything the header card of a video conversation shows. */
create or replace function public.submission_thread_context(p_thread_id uuid)
returns table (
  submission_id  uuid,
  campaign_name  text,
  brand_name     text,
  creator_handle text,
  video_path     text,
  thumbnail_url  text,
  cover_url      text,
  status         text,
  brand_note     text,
  submitted_at   timestamptz,
  decided_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, c.name, b.name, cr.handle, s.video_url, s.thumbnail_url, c.cover_url,
         s.status::text, s.brand_note, s.submitted_at, s.decided_at
    from public.threads t
    join public.submissions s on s.id = t.submission_id
    join public.campaigns c   on c.id = t.campaign_id
    join public.brands b      on b.id = c.brand_id
    join public.creators cr   on cr.id = s.creator_id
   where t.id = p_thread_id
     and t.kind = 'submission'
     and public.can_see_thread(t.id);
$$;

grant execute on function public.submission_thread_context(uuid) to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('my_threads', 'submission_thread_context')) as functions,
  (select count(*) from public.threads where kind = 'submission') as video_threads;
