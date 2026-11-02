-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0042: a thread with the KYRO team
--
-- Until now chat had two kinds of room, and both hung off a campaign:
--
--   campaign   the brand and every accepted creator on it
--   submission one creator and the brand, about one video
--
-- There was no way for a brand or a creator to reach KYRO itself. The
-- support widget opened a mailto link, which is a different inbox, a
-- different thread and no record inside the product.
--
-- This adds the third kind:
--
--   support    one account and the KYRO team
--
-- One per account, created the first time either side opens it. Admins see
-- every support thread; nobody sees anybody else's.
--
-- Two notes on the shape of this migration.
--
-- First, `kind` stops being an enum and becomes text with a check
-- constraint. Postgres will not let a migration add an enum value and then
-- use it in the same transaction, so an enum means every future kind of
-- room arrives as two scripts run in the right order, which is exactly the
-- kind of thing that gets half-run at 1am. Text plus a check does the same
-- job in one script.
--
-- Second, campaign_id becomes nullable, because a support thread is not
-- about a campaign. The shape constraint below now carries the whole rule,
-- so a malformed thread is still rejected by the table rather than trusted
-- to the application.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────────────────────
   1. kind becomes text
   ───────────────────────────────────────────────────────────── */

do $$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'threads'
       and column_name = 'kind' and udt_name = 'thread_kind'
  ) then
    -- Everything that carries the old type in its own definition has to go
    -- first, because Postgres rebuilds each one against the new column type
    -- and the stored `kind = 'campaign'::thread_kind` no longer type checks:
    -- the shape constraint, the two partial unique indexes, and my_threads,
    -- whose declared return type is the enum. All three are recreated below.
    alter table public.threads drop constraint if exists threads_shape;
    drop index if exists public.threads_campaign_uniq;
    drop index if exists public.threads_submission_uniq;
    drop function if exists public.my_threads();
    alter table public.threads alter column kind type text using kind::text;
  end if;
end $$;

create unique index if not exists threads_campaign_uniq
  on public.threads(campaign_id) where kind = 'campaign';

create unique index if not exists threads_submission_uniq
  on public.threads(submission_id) where kind = 'submission';

/* ─────────────────────────────────────────────────────────────
   2. The support thread's owner
   ───────────────────────────────────────────────────────────── */

alter table public.threads
  add column if not exists support_user_id uuid references auth.users(id) on delete cascade;

alter table public.threads
  alter column campaign_id drop not null;

do $$ begin
  alter table public.threads add constraint threads_kind_known
    check (kind in ('campaign', 'submission', 'support'));
exception when duplicate_object then null; end $$;

alter table public.threads drop constraint if exists threads_shape;
alter table public.threads add constraint threads_shape check (
     (kind = 'campaign'   and campaign_id is not null and submission_id is null     and support_user_id is null)
  or (kind = 'submission' and campaign_id is not null and submission_id is not null and support_user_id is null)
  or (kind = 'support'    and campaign_id is null     and submission_id is null     and support_user_id is not null)
);

-- One support thread per account. Same reasoning as the campaign and
-- submission indexes: the uniqueness is what makes "open it, creating it if
-- needed" safe to call from two tabs at once.
create unique index if not exists threads_support_uniq
  on public.threads(support_user_id) where kind = 'support';

comment on column public.threads.support_user_id is
  'Support threads only: the account on the other side of the KYRO team. Null for campaign and video threads.';

/* ─────────────────────────────────────────────────────────────
   3. Who may see a thread
   ───────────────────────────────────────────────────────────── */

create or replace function public.can_see_thread(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.threads t
     where t.id = t_id
       and (
         public.is_admin()
         -- Support thread: its own account, and the KYRO team above.
         or (t.kind = 'support' and t.support_user_id = auth.uid())
         -- The brand that owns the campaign.
         or exists (
              select 1 from public.campaigns c
                join public.brands b on b.id = c.brand_id
               where c.id = t.campaign_id and b.owner_user_id = auth.uid())
         -- Campaign thread: every creator accepted onto the campaign.
         or (t.kind = 'campaign' and exists (
              select 1 from public.applications a
                join public.creators cr on cr.id = a.creator_id
               where a.campaign_id = t.campaign_id
                 and a.status = 'accepted'
                 and cr.user_id = auth.uid()))
         -- Submission thread: that submission's creator, and nobody else.
         or (t.kind = 'submission' and exists (
              select 1 from public.submissions s
                join public.creators cr on cr.id = s.creator_id
               where s.id = t.submission_id and cr.user_id = auth.uid()))
       )
  );
$$;

/* ─────────────────────────────────────────────────────────────
   4. Opening it
   ───────────────────────────────────────────────────────────── */

/**
 * The caller's own thread with the KYRO team, or, for an admin passing a
 * user id, that account's thread. Created on first open either way, so the
 * first message from either side is what brings the room into existence.
 */
create or replace function public.support_thread(p_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  -- An admin may open anyone's. Everyone else gets their own, whatever
  -- they passed, so a crafted argument cannot reach another account.
  if public.is_admin() then
    v_target := coalesce(p_user_id, auth.uid());
  else
    v_target := auth.uid();
  end if;

  if not exists (select 1 from auth.users u where u.id = v_target) then
    raise exception 'No such account.';
  end if;

  select id into v_id from public.threads
   where kind = 'support' and support_user_id = v_target;

  if v_id is null then
    insert into public.threads (kind, support_user_id) values ('support', v_target)
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.threads
       where kind = 'support' and support_user_id = v_target;
    end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.support_thread(uuid) to authenticated;

/* ─────────────────────────────────────────────────────────────
   5. The inbox
   ───────────────────────────────────────────────────────────── */

-- Return type changes: kind is text now, and support threads carry the name
-- of the account rather than a campaign.
drop function if exists public.my_threads();

create function public.my_threads()
returns table (
  thread_id       uuid,
  kind            text,
  campaign_id     uuid,
  campaign_name   text,
  brand_name      text,
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
         -- Whose support thread this is, named the way the KYRO team would
         -- recognise them: the brand, then the creator handle, then the
         -- person, then the local part of their email.
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
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'threads' and column_name = 'kind')  as kind_type,
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'threads' and column_name = 'campaign_id') as campaign_nullable,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'threads' and column_name = 'support_user_id') as support_column,
  (select count(*) from pg_constraint where conname in ('threads_shape', 'threads_kind_known')) as constraints,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'support_thread')                        as support_fn,
  (select count(*) from public.threads where kind = 'support')                          as support_threads;
