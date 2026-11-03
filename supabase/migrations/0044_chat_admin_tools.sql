-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0044: deleting a conversation, and something to filter by
--
-- Two small additions to chat.
--
-- 1. An admin can delete a thread. Nobody else can, and no message can be
--    edited or deleted on its own by anyone, which is deliberate: a
--    conversation someone can quietly rewrite is not a record. Removing a
--    whole thread is a different act, visible by its absence, and it is the
--    one an admin actually needs for a test room or a duplicate.
--
--    The function is security definer and checks is_admin() itself, because
--    delete on threads is revoked from browser sessions and should stay
--    revoked: a policy would make the table writable and then rely on the
--    policy being right forever.
--
-- 2. my_threads also returns the brand's niche, so the list can be filtered
--    by it. No new access: the brand row behind every thread is already
--    visible to anyone who can see that thread.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────────────────────
   1. Deleting a thread
   ───────────────────────────────────────────────────────────── */

/**
 * Remove a conversation and everything in it. Admins only.
 *
 * Returns the number of messages that went with it, so the caller can say
 * what was actually destroyed rather than claiming success blindly. The
 * messages and read markers go by cascade from their foreign keys.
 */
create or replace function public.delete_thread(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages integer;
begin
  if not public.is_admin() then
    raise exception 'Only KYRO can delete a conversation.';
  end if;

  if not exists (select 1 from public.threads t where t.id = p_thread_id) then
    raise exception 'No such conversation.';
  end if;

  select count(*) into v_messages from public.messages m where m.thread_id = p_thread_id;

  delete from public.threads where id = p_thread_id;

  return v_messages;
end;
$$;

grant execute on function public.delete_thread(uuid) to authenticated;

/* ─────────────────────────────────────────────────────────────
   2. The inbox, with a niche on each row
   ───────────────────────────────────────────────────────────── */

drop function if exists public.my_threads();

create function public.my_threads()
returns table (
  thread_id       uuid,
  kind            text,
  campaign_id     uuid,
  campaign_name   text,
  brand_name      text,
  brand_niche     text,
  submission_id   uuid,
  last_body       text,
  last_sender     text,
  last_at         timestamptz,
  unread          bigint,
  creator_handle  text,
  video_thumb     text,
  video_status    text,
  support_user_id uuid,
  support_name    text
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
         -- Category first, then the broader business type. Same order the
         -- browse page uses, so a filter means the same thing in both.
         coalesce(nullif(b.category, ''), nullif(b.business_type, '')),
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
         s.status::text,
         v.support_user_id,
         case when v.kind = 'support' then coalesce(
           (select sb.name from public.brands sb where sb.owner_user_id = v.support_user_id limit 1),
           (select nullif(scr.handle, '') from public.creators scr where scr.user_id = v.support_user_id limit 1),
           (select nullif(btrim(coalesce(sp.full_name, '')), '') from public.profiles sp where sp.id = v.support_user_id),
           (select split_part(coalesce(sp.email, ''), '@', 1) from public.profiles sp where sp.id = v.support_user_id),
           'Account'
         ) end
    from visible v
    left join public.campaigns c   on c.id = v.campaign_id
    left join public.brands b      on b.id = c.brand_id
    left join public.submissions s on s.id = v.submission_id
    left join public.creators cr   on cr.id = s.creator_id
    left join last_msg lm          on lm.thread_id = v.id
   order by coalesce(lm.created_at, v.created_at) desc;
$$;

grant execute on function public.my_threads() to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_thread')     as delete_fn,
  (select count(*) from information_schema.routines
    where routine_schema = 'public' and routine_name = 'my_threads') as inbox_fn,
  (select count(*) from public.threads)                             as threads_on_file;
