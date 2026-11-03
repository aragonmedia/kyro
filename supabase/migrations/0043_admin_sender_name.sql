-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0043: messages from KYRO are signed "KYRO Admin Team"
--
-- The sender name on a message is stamped from the session, never from the
-- request body, so a creator cannot post as the brand. Until now an admin
-- fell through to their personal name, which meant a brand opening their
-- support thread saw a stranger's first name rather than KYRO.
--
-- A brand or creator keeps the name the other side would recognise: the
-- brand's name, the creator's handle. An admin is now always the team,
-- because that is what the person reading it needs to know, and because a
-- support reply should not change character when a different person on the
-- team picks it up.
--
-- Only the name changes. sender_role is still stamped from the profile, so
-- the KYRO badge in the chat and anything else keyed on role is unaffected,
-- and messages already sent keep the name they were sent under, which is
-- the point of storing it on the row.
--
-- The messages_stamp_sender trigger stays exactly where it is. This
-- replaces the function it calls.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.stamp_message_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role public.kyro_role;
begin
  new.sender_user_id := auth.uid();

  select p.role into v_role from public.profiles p where p.id = auth.uid();
  new.sender_role := v_role;

  -- Prefer the name the other side of the conversation would recognise:
  -- the KYRO team, the brand's name, or the creator's handle, before the
  -- personal name.
  if v_role = 'admin' then
    v_name := 'KYRO Admin Team';
  elsif v_role = 'brand' then
    select b.name into v_name from public.brands b where b.owner_user_id = auth.uid() limit 1;
  elsif v_role = 'creator' then
    select nullif(c.handle, '') into v_name from public.creators c where c.user_id = auth.uid() limit 1;
  end if;

  if v_name is null then
    select nullif(btrim(coalesce(p.full_name, '')), '') into v_name
      from public.profiles p where p.id = auth.uid();
  end if;

  if v_name is null then
    select split_part(coalesce(p.email, ''), '@', 1) into v_name
      from public.profiles p where p.id = auth.uid();
  end if;

  new.sender_name := coalesce(nullif(v_name, ''), 'Someone');
  return new;
end;
$$;

-- The trigger is not recreated: it already points at this function by name,
-- and dropping it, even for a moment, is a window in which a message could
-- be inserted unstamped.

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from pg_trigger
    where tgname = 'messages_stamp_sender' and not tgisinternal)        as trigger_still_on,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'stamp_message_sender'
      and pg_get_functiondef(p.oid) like '%KYRO Admin Team%')           as admin_name_installed,
  (select count(*) from public.messages where sender_role = 'admin')    as admin_messages_already_sent;
