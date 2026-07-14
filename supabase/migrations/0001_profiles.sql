-- ─────────────────────────────────────────────────────────────
-- KYRO — profiles table, auto-provisioning trigger, and RLS
-- Run this in Supabase → SQL Editor (or via the Supabase CLI).
-- Backs the auth workflow: every auth user gets a profile row; the
-- app checks `role`/`onboarded` after OTP verify to decide whether to
-- send them to their dashboard (existing) or onboarding (new).
-- ─────────────────────────────────────────────────────────────

-- Role enum
do $$ begin
  create type public.kyro_role as enum ('brand', 'creator', 'admin');
exception when duplicate_object then null; end $$;

-- Profiles table (1:1 with auth.users)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       public.kyro_role,
  onboarded  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row-level security: a user can only see/edit their own profile
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- To make yourself an admin after signing up once:
--   update public.profiles set role = 'admin', onboarded = true
--   where email = 'aragonkevin239@gmail.com';
