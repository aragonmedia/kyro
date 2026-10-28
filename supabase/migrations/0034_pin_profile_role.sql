-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0034: a user cannot make themselves an admin
--
-- ⚠ THIS CLOSES A PRIVILEGE ESCALATION. Read before changing it.
--
-- public.profiles carries the role, and profiles_update_own lets a user
-- update their own row:
--
--   create policy profiles_update_own on public.profiles for update
--     using (auth.uid() = id) with check (auth.uid() = id);
--
-- That policy checks WHICH row you may write, and nothing checked WHAT you
-- may write in it. saveMyProfile() already sends `role` from the browser so a
-- new account can declare itself a Brand or a Creator, which means the value
-- is attacker-controlled. Anyone with an account could open the console on
-- itskyro.com and run:
--
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', <their id>)
--
-- public.is_admin() reads that same column, and the admin clause appears in
-- the RLS on brands, creators, campaigns, submissions, orders, earnings,
-- payment_runs, payouts, agreements, brand_billing, ledger_entries and more.
-- So one UPDATE on your own row turned into read access to every brand's and
-- every creator's data on the platform, and write access wherever that clause
-- covers `for all`.
--
-- The fix is the pattern 0022 already uses for billing_origin: the server
-- decides, and a browser write cannot move the value. A role change into or
-- out of 'admin' is silently reverted when the caller is anon or
-- authenticated. Brand and Creator can still be chosen and changed at signup,
-- because that is a real user choice and carries no privilege.
--
-- An admin is made the way they always should have been: by someone with the
-- service role, in the SQL editor.
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.profiles_pin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The service role and any server-side caller are trusted; this guards the
  -- browser, which is the only place the value is attacker-controlled.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      -- A signup may declare itself a Brand or a Creator. Never an admin.
      if new.role is not distinct from 'admin'::public.kyro_role then
        new.role := null;
      end if;
    else
      -- On update, a move into or out of admin is reverted. Everything else,
      -- including switching between brand and creator, is left alone.
      if new.role is distinct from old.role
         and ('admin'::public.kyro_role in (new.role, old.role)) then
        new.role := old.role;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_pin_role on public.profiles;
create trigger profiles_pin_role
  before insert or update on public.profiles
  for each row execute function public.profiles_pin_role();

-- ── What landed ──────────────────────────────────────────────
-- trigger_installed should be 1. admins is however many you intend to have:
-- check the list and remove any you do not recognise, because before this
-- migration anyone could have added themselves.
select
  (select count(*) from pg_trigger
    where tgname = 'profiles_pin_role' and tgrelid = 'public.profiles'::regclass) as trigger_installed,
  (select count(*) from public.profiles where role = 'admin')                     as admins;

select email, role, created_at
  from public.profiles
 where role = 'admin'
 order by created_at;
