-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0049: asking for the product, and what happened after
--
-- A creator on a campaign cannot make a video about a product they do not
-- have. Today that conversation happens in chat, or in a DM, or not at all,
-- and the brand has no record of what it sent or whether sending it was
-- worth doing.
--
-- So: a request, a decision, and a date the thing was sent. KYRO does not
-- buy labels or talk to carriers. The brand ships the way it already ships.
--
-- The number this exists for is the one a brand actually wants before it
-- puts product in a box: does this creator post after a sample arrives, or
-- do they collect. Sample farming is real, it is expensive, and until now
-- nothing in KYRO could tell the two apart.
--
-- Two things worth stating about the address.
--
-- It is stored per request, not on the creator's profile. A creator decides
-- to give an address by asking a particular brand for a particular thing,
-- and that is the smallest scope the feature can work in. Nothing else in
-- KYRO gains a shipping address.
--
-- And the brand it was sent to can read it. That is inherent: somebody has
-- to put it on a parcel. No other brand can, no other creator can, and the
-- creator gave it for exactly this.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

do $$ begin
  create type public.sample_status as enum ('requested','approved','declined','sent');
exception when duplicate_object then null; end $$;

create table if not exists public.sample_requests (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  creator_id    uuid not null references public.creators(id)  on delete cascade,
  -- Denormalised the same way submissions carry it, so a policy can answer
  -- "is this mine" without walking two joins on every row.
  brand_id      uuid not null references public.brands(id)    on delete cascade,

  -- What they are asking for, in their words. Matched to campaign_products
  -- by eye rather than by a foreign key: a creator asking for "the vanilla
  -- one" is more useful than a dropdown that does not have it.
  product       text,
  note          text,

  ship_name     text not null,
  ship_address  text not null,
  ship_country  text not null default 'United States',

  status        public.sample_status not null default 'requested',
  decline_reason text,

  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  sent_at       timestamptz,

  constraint sample_requests_address_present
    check (btrim(ship_name) <> '' and btrim(ship_address) <> '')
);

create index if not exists sample_requests_brand_idx   on public.sample_requests(brand_id, requested_at desc);
create index if not exists sample_requests_creator_idx on public.sample_requests(creator_id, requested_at desc);

-- One open request per creator per campaign. Without this, a declined
-- creator can ask eleven more times and the brand's queue becomes noise.
create unique index if not exists sample_requests_open_uniq
  on public.sample_requests(campaign_id, creator_id)
  where status in ('requested','approved');

comment on table public.sample_requests is
  'A creator asking a brand for product on a campaign they are on, and what the brand did about it. Shipping happens outside KYRO; only the dates are recorded here.';

/* ─────────────────────────────────────────────────────────────
   Who may do what
   ───────────────────────────────────────────────────────────── */

alter table public.sample_requests enable row level security;

drop policy if exists sample_requests_read on public.sample_requests;
create policy sample_requests_read on public.sample_requests for select
  using (
    public.is_admin()
    or exists (select 1 from public.creators c
                where c.id = sample_requests.creator_id and c.user_id = auth.uid())
    or exists (select 1 from public.brands b
                where b.id = sample_requests.brand_id and b.owner_user_id = auth.uid())
  );

-- A creator may ask, but only for a campaign they are actually accepted on.
-- Asking for product on a campaign you were never picked for is not a
-- request, it is a cold email with an address attached.
drop policy if exists sample_requests_ask on public.sample_requests;
create policy sample_requests_ask on public.sample_requests for insert
  with check (
    exists (select 1 from public.creators c
             where c.id = sample_requests.creator_id and c.user_id = auth.uid())
    and exists (
      select 1 from public.applications a
       where a.campaign_id = sample_requests.campaign_id
         and a.creator_id = sample_requests.creator_id
         and a.status = 'accepted')
  );

drop policy if exists sample_requests_decide on public.sample_requests;
create policy sample_requests_decide on public.sample_requests for update
  using (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = sample_requests.brand_id and b.owner_user_id = auth.uid())
  );

-- Nobody deletes a request. A brand that declined and a creator who asked
-- both have an interest in the record surviving the awkwardness.
revoke delete on public.sample_requests from anon, authenticated;

/**
 * Pin the decision fields to the side that owns them.
 *
 * A table-level UPDATE grant makes `revoke update (column)` a no-op under
 * Supabase's default privileges, which is the same trap migration 0037
 * documented. So the rule lives in a trigger: the brand decides, the
 * creator writes the request, and neither gets to be the other.
 */
create or replace function public.pin_sample_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_brand boolean;
begin
  if tg_op = 'INSERT' then
    -- Whatever a creator's client sends, a new request starts at the start.
    if not public.is_admin() then
      new.status        := 'requested';
      new.decided_at    := null;
      new.sent_at       := null;
      new.decline_reason := null;
      new.brand_id      := (select c.brand_id from public.campaigns c where c.id = new.campaign_id);
      new.requested_at  := now();
    end if;
    return new;
  end if;

  select exists (
    select 1 from public.brands b
     where b.id = old.brand_id and b.owner_user_id = auth.uid()
  ) into v_is_brand;

  if not (v_is_brand or public.is_admin()) then
    -- A creator editing their own row may correct where it goes, nothing else.
    new.status         := old.status;
    new.decided_at     := old.decided_at;
    new.sent_at        := old.sent_at;
    new.decline_reason := old.decline_reason;
    new.brand_id       := old.brand_id;
    new.campaign_id    := old.campaign_id;
    new.creator_id     := old.creator_id;
    return new;
  end if;

  -- Stamp the dates from the transition rather than trusting the client.
  if new.status is distinct from old.status then
    if new.status in ('approved','declined') then new.decided_at := now(); end if;
    if new.status = 'sent' then
      new.sent_at := now();
      if new.decided_at is null then new.decided_at := now(); end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sample_requests_pin on public.sample_requests;
create trigger sample_requests_pin
  before insert or update on public.sample_requests
  for each row execute function public.pin_sample_request();

/* ─────────────────────────────────────────────────────────────
   Did the sample turn into a video
   ───────────────────────────────────────────────────────────── */

/**
 * How often a creator posts after product arrives.
 *
 * Counted only against samples actually sent, because a request nobody
 * fulfilled says nothing about the creator. A sample counts as posted when
 * that creator uploaded to that campaign after it went out.
 *
 * security invoker on purpose: a brand running this sees its own experience
 * of a creator, not every brand's. A platform-wide rate would be more
 * useful and is not this function's to disclose.
 */
create or replace function public.sample_posting_rate(p_creator_id uuid)
returns table (sent bigint, posted bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where r.sent_at is not null),
    count(*) filter (
      where r.sent_at is not null
        and exists (
          select 1 from public.submissions s
           where s.creator_id = r.creator_id
             and s.campaign_id = r.campaign_id
             and s.submitted_at > r.sent_at))
  from public.sample_requests r
 where r.creator_id = p_creator_id;
$$;

grant execute on function public.sample_posting_rate(uuid) to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'sample_requests')      as table_created,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'sample_requests')         as policies,
  (select count(*) from pg_trigger
    where tgname = 'sample_requests_pin' and not tgisinternal)             as pin_trigger,
  (select count(*) from pg_indexes
    where indexname = 'sample_requests_open_uniq')                         as one_open_request,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sample_posting_rate')      as rate_function;
