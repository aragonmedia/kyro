-- ─────────────────────────────────────────────────────────────
-- KYRO — 0013: email notification preference
--
-- One switch, on the account's registered email. There is no second address
-- to manage: the email a creator or brand signed up with is the one KYRO can
-- prove they control, so sending anywhere else would mean an unverified
-- address and a deliverability problem nobody asked for.
--
-- Transactional mail (password reset, security) is deliberately NOT covered
-- by this flag. Those are not marketing and cannot be opted out of.
--
-- Run AFTER 0012_campaign_covers.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists notify_email boolean not null default true;

comment on column public.profiles.notify_email is
  'Whether KYRO emails this account about activity (applications, submissions, payouts). Transactional mail such as password resets ignores this flag.';
