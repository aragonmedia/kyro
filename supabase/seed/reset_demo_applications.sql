-- ═══════════════════════════════════════════════════════════════
-- Put the three demo creator applications back to pending.
--
-- For rehearsing Accept / Decline as many times as you like. Only touches
-- the fictional creators from seed_applications.sql (stats.demo = true, no
-- login), so no real person is ever affected. Safe to run any time.
-- ═══════════════════════════════════════════════════════════════

update public.applications a
   set status = 'pending', decision_note = null, decided_at = null
  from public.creators cr
 where cr.id = a.creator_id
   and cr.user_id is null
   and (cr.stats ->> 'demo') = 'true';

select cr.handle, a.status, a.decision_note
  from public.applications a
  join public.creators cr on cr.id = a.creator_id
 where cr.user_id is null and (cr.stats ->> 'demo') = 'true'
 order by cr.handle;
