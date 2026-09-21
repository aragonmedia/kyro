-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0024: a reason when a brand declines a creator
--
-- Declining a video already requires a note. Declining a creator now does
-- too, and the creator sees it next to "Apply again", so a no comes with
-- something they can act on.
--
-- It also closes two gaps in how applications were written:
--
--   · The brand's Accept / Decline was a direct UPDATE, which the original
--     policy's WITH CHECK only allows for the creator or an admin. Decisions
--     now go through decide_application(), which checks the caller owns the
--     brand and requires a note on a decline.
--   · A creator could set their own application to "accepted". A trigger now
--     limits creators to applying (pending) and withdrawing. Only the brand's
--     function and invite links can accept.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.applications add column if not exists decision_note text;
alter table public.applications add column if not exists decided_at   timestamptz;

comment on column public.applications.decision_note is
  'What the brand told the creator when deciding. Required on a decline. Shown to the creator.';

-- ── Guard: what a creator may do to their own application ────
create or replace function public.applications_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted paths (decide_application, invite links) mark the transaction.
  if coalesce(current_setting('kyro.app_decision', true), '') = 'on' then
    return new;
  end if;

  -- The SQL editor and the service role are not browser sessions.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.decision_note := null;
    new.decided_at := null;
    return new;
  end if;

  -- Update from a browser: apply again, or withdraw. Never decide.
  if new.status is distinct from old.status
     and new.status::text not in ('pending', 'withdrawn') then
    raise exception 'Only the brand can accept or decline an application.';
  end if;
  new.decision_note := old.decision_note;
  new.decided_at := old.decided_at;
  return new;
end;
$$;

drop trigger if exists applications_guard on public.applications;
create trigger applications_guard
  before insert or update on public.applications
  for each row execute function public.applications_guard();

-- ── The brand's decision ─────────────────────────────────────
create or replace function public.decide_application(
  p_application_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Decide with accepted or rejected.';
  end if;

  if not (
    public.is_admin()
    or exists (select 1 from public.applications a
                 join public.campaigns c on c.id = a.campaign_id
                 join public.brands b    on b.id = c.brand_id
                where a.id = p_application_id and b.owner_user_id = auth.uid())
  ) then
    raise exception 'That application is not on one of your campaigns.';
  end if;

  if p_status = 'rejected' and v_note is null then
    raise exception 'Tell the creator why, so they know what to change.';
  end if;

  perform set_config('kyro.app_decision', 'on', true);

  update public.applications
     set status = p_status::public.application_status,
         decision_note = v_note,
         decided_at = now()
   where id = p_application_id;
end;
$$;

grant execute on function public.decide_application(uuid, text, text) to authenticated;

-- Invite links accept directly, so they mark the transaction as trusted.
create or replace function public.accept_campaign_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_creator  uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select id into v_campaign from public.campaigns where invite_token = p_token;
  if v_campaign is null then
    raise exception 'That invite link is not valid any more.';
  end if;

  select id into v_creator from public.creators where user_id = auth.uid();
  if v_creator is null then
    raise exception 'Only creator accounts can join a campaign.';
  end if;

  perform set_config('kyro.app_decision', 'on', true);

  insert into public.applications (campaign_id, creator_id, status, intake_path, decided_at)
  values (v_campaign, v_creator, 'accepted', 'invite', now())
  on conflict (campaign_id, creator_id)
  do update set status = 'accepted', decision_note = null, decided_at = now();

  return v_campaign;
end;
$$;

grant execute on function public.accept_campaign_invite(text) to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'applications' and column_name = 'decision_note') as note_column,
  (select count(*) from pg_trigger where tgname = 'applications_guard') as guard,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'decide_application') as decide_function;
