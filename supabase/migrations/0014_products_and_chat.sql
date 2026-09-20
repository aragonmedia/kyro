-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0014 — campaign products, content direction, and chat
--
-- Three things a campaign has been missing:
--
--   1. Products. A creator deciding whether to make a video needs to see
--      what they would be selling. `campaign_products` is filled in by the
--      brand today and is shaped to be filled by a Shopify product sync
--      later without changing the read path.
--
--   2. Content direction. `brief` says what the campaign is, `deliverable_spec`
--      says the format. Neither says what the video should feel like, which is
--      the part creators actually get wrong.
--
--   3. Chat, in two shapes that are deliberately not the same thing:
--        · a campaign thread — the brand and every accepted creator, together
--        · a submission thread — one creator and the brand, about one video
--      A creator whose video was passed on should be able to ask why without
--      the rest of the roster reading it, which is why the second exists.
--
-- Messages are append-only: no update or delete policy. What a brand asked
-- for is a record, and a record you can quietly rewrite is not one.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────────────────────
   1. Content direction on the campaign
   ───────────────────────────────────────────────────────────── */

alter table public.campaigns add column if not exists content_style text;

comment on column public.campaigns.content_style is
  'What the video should feel like — setting, tone, language, pacing. Distinct from deliverable_spec, which is format only.';

/* ─────────────────────────────────────────────────────────────
   2. Products
   ───────────────────────────────────────────────────────────── */

create table if not exists public.campaign_products (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  brand_id      uuid not null references public.brands(id)    on delete cascade,
  name          text not null,
  description   text,
  image_url     text,
  price_cents   bigint,
  external_url  text,
  -- Where a Shopify product sync will write the product's id, so a synced
  -- product updates in place instead of being inserted a second time.
  external_id   text,
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists campaign_products_campaign_idx
  on public.campaign_products(campaign_id, position);

create unique index if not exists campaign_products_external_uniq
  on public.campaign_products(brand_id, external_id)
  where external_id is not null;

alter table public.campaign_products enable row level security;

-- Any signed-in user can read them, matching how campaigns themselves read:
-- a creator cannot decide whether to apply without seeing the product.
drop policy if exists campaign_products_read on public.campaign_products;
create policy campaign_products_read on public.campaign_products for select
  using (auth.uid() is not null);

drop policy if exists campaign_products_write on public.campaign_products;
create policy campaign_products_write on public.campaign_products for all
  using (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = campaign_products.brand_id and b.owner_user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = campaign_products.brand_id and b.owner_user_id = auth.uid())
  );

/* ─────────────────────────────────────────────────────────────
   3. Threads
   ───────────────────────────────────────────────────────────── */

do $$ begin
  create type public.thread_kind as enum ('campaign', 'submission');
exception when duplicate_object then null; end $$;

create table if not exists public.threads (
  id            uuid primary key default gen_random_uuid(),
  kind          public.thread_kind not null,
  campaign_id   uuid not null references public.campaigns(id)   on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- A submission thread without a submission, or a campaign thread with one,
  -- would both be meaningless. Rejected at the table rather than trusted to
  -- the application.
  constraint threads_shape check (
    (kind = 'campaign'   and submission_id is null)
    or (kind = 'submission' and submission_id is not null)
  )
);

create unique index if not exists threads_campaign_uniq
  on public.threads(campaign_id) where kind = 'campaign';

create unique index if not exists threads_submission_uniq
  on public.threads(submission_id) where kind = 'submission';

/**
 * Who may see a thread.
 *
 * security definer so the policies below can ask this question without every
 * caller needing read access to applications, submissions and brands — and so
 * the messages policy does not recurse back through threads' own policy.
 */
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

alter table public.threads enable row level security;

drop policy if exists threads_read on public.threads;
create policy threads_read on public.threads for select
  using (public.can_see_thread(id));

-- Threads are only ever created by the two functions further down, which
-- check membership themselves. Nothing inserts directly.
revoke insert, update, delete on public.threads from anon, authenticated;

/* ─────────────────────────────────────────────────────────────
   4. Messages
   ───────────────────────────────────────────────────────────── */

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  -- Denormalised on purpose. `profiles` is readable only by its owner, so a
  -- join would show every sender as blank; and the name a message was sent
  -- under should not change retroactively when someone edits their profile.
  sender_name    text not null,
  sender_role    public.kyro_role,
  body           text not null,
  created_at     timestamptz not null default now(),
  constraint messages_body_length check (char_length(btrim(body)) between 1 and 4000)
);

create index if not exists messages_thread_idx on public.messages(thread_id, created_at);

/**
 * Stamp the sender from the session rather than the request body.
 *
 * The client sends a thread id and a body. Everything identifying comes from
 * auth.uid() here, so a creator cannot post as the brand by editing a payload.
 */
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
  -- the brand's name, or the creator's handle, before the personal name.
  if v_role = 'brand' then
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

drop trigger if exists messages_stamp_sender on public.messages;
create trigger messages_stamp_sender
  before insert on public.messages
  for each row execute function public.stamp_message_sender();

alter table public.messages enable row level security;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select
  using (public.can_see_thread(thread_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (public.can_see_thread(thread_id));

-- Append-only. A conversation someone can silently rewrite is not a record.
revoke update, delete on public.messages from anon, authenticated;

/* ─────────────────────────────────────────────────────────────
   5. Read state, for unread badges
   ───────────────────────────────────────────────────────────── */

create table if not exists public.thread_reads (
  thread_id    uuid not null references public.threads(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.thread_reads enable row level security;

drop policy if exists thread_reads_own on public.thread_reads;
create policy thread_reads_own on public.thread_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* ─────────────────────────────────────────────────────────────
   6. Getting a thread
   ───────────────────────────────────────────────────────────── */

/** The shared thread for a campaign. Created on first open. */
create or replace function public.campaign_thread(p_campaign_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  -- Membership is checked before anything is created, so a stranger cannot
  -- conjure a thread for a campaign they are not on.
  if not (
    public.is_admin()
    or exists (select 1 from public.campaigns c join public.brands b on b.id = c.brand_id
                where c.id = p_campaign_id and b.owner_user_id = auth.uid())
    or exists (select 1 from public.applications a join public.creators cr on cr.id = a.creator_id
                where a.campaign_id = p_campaign_id and a.status = 'accepted' and cr.user_id = auth.uid())
  ) then
    raise exception 'You are not on this campaign.';
  end if;

  select id into v_id from public.threads
   where kind = 'campaign' and campaign_id = p_campaign_id;

  if v_id is null then
    insert into public.threads (kind, campaign_id) values ('campaign', p_campaign_id)
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.threads
       where kind = 'campaign' and campaign_id = p_campaign_id;
    end if;
  end if;

  return v_id;
end;
$$;

/** The private thread between one creator and the brand about one video. */
create or replace function public.submission_thread(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_campaign uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  select s.campaign_id into v_campaign from public.submissions s where s.id = p_submission_id;
  if v_campaign is null then
    raise exception 'No such submission.';
  end if;

  if not (
    public.is_admin()
    or exists (select 1 from public.submissions s join public.creators cr on cr.id = s.creator_id
                where s.id = p_submission_id and cr.user_id = auth.uid())
    or exists (select 1 from public.campaigns c join public.brands b on b.id = c.brand_id
                where c.id = v_campaign and b.owner_user_id = auth.uid())
  ) then
    raise exception 'This conversation is not yours.';
  end if;

  select id into v_id from public.threads
   where kind = 'submission' and submission_id = p_submission_id;

  if v_id is null then
    insert into public.threads (kind, campaign_id, submission_id)
    values ('submission', v_campaign, p_submission_id)
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from public.threads
       where kind = 'submission' and submission_id = p_submission_id;
    end if;
  end if;

  return v_id;
end;
$$;

/* ─────────────────────────────────────────────────────────────
   7. The inbox
   ───────────────────────────────────────────────────────────── */

/**
 * Every thread the caller can see, with the last message and an unread count.
 *
 * One round trip rather than a query per thread. The counts are computed
 * against thread_reads, so a thread the user has never opened counts all of
 * its messages as unread, which is the behaviour you want on first sight.
 */
create or replace function public.my_threads()
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
  unread         bigint
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
                   'epoch'::timestamptz))
    from visible v
    join public.campaigns c on c.id = v.campaign_id
    join public.brands b    on b.id = c.brand_id
    left join last_msg lm   on lm.thread_id = v.id
   order by coalesce(lm.created_at, v.created_at) desc;
$$;

grant execute on function public.campaign_thread(uuid)   to authenticated;
grant execute on function public.submission_thread(uuid) to authenticated;
grant execute on function public.my_threads()            to authenticated;
grant execute on function public.can_see_thread(uuid)    to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'content_style') as content_style_col,
  (select count(*) from public.campaign_products) as products,
  (select count(*) from public.threads)           as threads,
  (select count(*) from public.messages)          as messages;
