-- ─────────────────────────────────────────────────────────────
-- Grant admin to your main email.
-- Run in Supabase → SQL Editor (after 0001_profiles.sql exists).
-- This creates the profile row if it's missing (e.g. you signed up
-- before the trigger existed) OR updates it if it's already there.
-- ─────────────────────────────────────────────────────────────
insert into public.profiles (id, email, role, onboarded)
select id, email, 'admin', true
from auth.users
where email = 'aragonkevin239@gmail.com'
on conflict (id) do update
  set role = 'admin', onboarded = true;

-- Verify it worked (should show your email with role = admin):
select id, email, role, onboarded from public.profiles
where email = 'aragonkevin239@gmail.com';
