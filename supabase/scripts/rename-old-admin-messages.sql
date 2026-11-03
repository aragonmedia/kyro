-- ═══════════════════════════════════════════════════════════════
-- KYRO: sign the admin messages that were sent before 0043
--
-- NOT a migration. A one-off tidy-up for the handful of messages sent from
-- the admin side while the sender name still fell through to the local part
-- of an email address, so a brand scrolling back does not see a stranger.
--
-- The name on a message is stored on the row on purpose: it is what the
-- other side actually saw, and changing it is rewriting a record. That is
-- why this is a script you run deliberately rather than part of 0043, and
-- why it touches admin rows only and nothing else. Brand and creator names
-- are left exactly as sent.
--
-- Run in the Supabase SQL editor, once. Safe to run again: the second run
-- finds nothing to do.
-- ═══════════════════════════════════════════════════════════════

-- ── Before ───────────────────────────────────────────────────
select sender_name, count(*) as messages
  from public.messages
 where sender_role = 'admin'
 group by sender_name
 order by messages desc;

-- ── The change ───────────────────────────────────────────────
update public.messages
   set sender_name = 'KYRO Admin Team'
 where sender_role = 'admin'
   and sender_name <> 'KYRO Admin Team';

-- ── After ────────────────────────────────────────────────────
select
  (select count(*) from public.messages
    where sender_role = 'admin' and sender_name = 'KYRO Admin Team') as signed_as_the_team,
  (select count(*) from public.messages
    where sender_role = 'admin' and sender_name <> 'KYRO Admin Team') as still_signed_otherwise;
