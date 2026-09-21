-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0020 — brand teams
--
-- A brand is rarely one person. This lets the owner invite teammates and say
-- exactly what each can do: reach out to creators, give notes on videos, run
-- chat, see money, move money.
--
-- ⚠ SCOPE. This migration stores teams and invites. It does NOT yet grant a
--   member access to any brand data. Access is gated by row-level security on
--   around fifteen tables, all of which check `owner_user_id = auth.uid()`.
--   Widening those is deliberately a separate migration (0021), so it can be
--   reviewed on its own and applied when it is safe to test — not bundled into
--   a change whose job is to record who has been invited.
--
--   The UI says so. Nobody is told a teammate has access when they do not.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

do $$ begin
  create type public.brand_member_status as enum ('invited', 'active', 'removed');
exception when duplicate_object then null; end $$;

create table if not exists public.brand_members (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  -- Invites are addressed to an email; user_id is filled in when that person
  -- signs in, so an invite can exist before its recipient has an account.
  email       text not null,
  user_id     uuid references auth.users(id) on delete cascade,
  role        text not null,
  permissions text[] not null default '{}',
  status      public.brand_member_status not null default 'invited',
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  constraint brand_members_role_valid
    check (role in ('admin', 'manager', 'creator_manager', 'viewer')),
  -- Only permissions KYRO actually knows about. A typo here would otherwise
  -- be stored forever and quietly grant nothing.
  constraint brand_members_permissions_valid
    check (permissions <@ array[
      'campaigns.manage', 'creators.manage', 'videos.feedback',
      'chat.manage', 'finance.view', 'finance.pay', 'team.manage'
    ]::text[])
);

-- One live invite per person per brand.
create unique index if not exists brand_members_email_uniq
  on public.brand_members(brand_id, lower(email)) where status <> 'removed';

create index if not exists brand_members_user_idx on public.brand_members(user_id) where user_id is not null;

alter table public.brand_members enable row level security;

-- The owner sees and manages the whole team. A member sees their own row, so
-- they can tell what they have been granted.
drop policy if exists brand_members_read on public.brand_members;
create policy brand_members_read on public.brand_members for select
  using (
    public.is_admin()
    or user_id = auth.uid()
    or exists (select 1 from public.brands b
                where b.id = brand_members.brand_id and b.owner_user_id = auth.uid())
  );

drop policy if exists brand_members_write on public.brand_members;
create policy brand_members_write on public.brand_members for all
  using (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = brand_members.brand_id and b.owner_user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = brand_members.brand_id and b.owner_user_id = auth.uid())
  );

/**
 * Link any waiting invites to the signed-in account.
 *
 * Called on sign-in. Matches on the verified email Supabase holds, never on
 * an email the client supplies, so nobody can claim an invite addressed to
 * someone else.
 */
create or replace function public.claim_brand_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  if auth.uid() is null then return 0; end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;

  update public.brand_members
     set user_id = auth.uid(),
         status = 'active',
         accepted_at = coalesce(accepted_at, now())
   where status = 'invited'
     and lower(email) = v_email
     and user_id is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.claim_brand_invites() to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'brand_members') as brand_members_table,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_brand_invites') as claim_function;
