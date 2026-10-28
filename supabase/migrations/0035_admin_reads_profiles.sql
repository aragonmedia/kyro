-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0035: an admin can read the profiles behind the accounts
--
-- The admin portal shows "No email on file" against every brand and falls
-- back to a handle for creator names. Nothing is missing from the data. The
-- admin simply cannot see it.
--
-- public.profiles has carried one SELECT policy since 0001:
--
--   create policy profiles_select_own on public.profiles
--     for select using (auth.uid() = id);
--
-- Every other table the admin portal reads already carries a public.is_admin()
-- clause. profiles never got one, because when 0001 was written nothing read
-- across accounts. So an admin could see that Fuel owes $120.92 and could not
-- see who to tell.
--
-- This adds the read, and only the read. Writing someone else's profile stays
-- impossible: profiles_update_own is untouched, and 0034's trigger still pins
-- the role against any browser write. An admin who needs to change another
-- account does it with the service role, deliberately, in the SQL editor.
--
-- What this exposes to an admin: name, email, role, onboarded, notify_email.
-- No password, no token, no payment detail. Those live in auth.users and in
-- the sealed tables, which have no policies at all and are unreachable from
-- any browser session regardless of role.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select using (public.is_admin());

-- ── What landed ──────────────────────────────────────────────
-- policies_on_profiles should be 4: the three from 0001 plus this one.
-- readable_as_admin is how many profiles an admin can now see, which should
-- match the total number of accounts.
select
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'profiles')        as policies_on_profiles,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_admin_read')                      as admin_read_installed,
  (select count(*) from public.profiles)                           as total_profiles;
