-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0046: Stripe collects the tax information, so KYRO stops
--
-- KYRO used to hold a payout until an admin marked a creator's tax details
-- accepted. That made sense when it was unclear who was filing. It is clear
-- now: Stripe collects the creator's tax information during Express
-- onboarding, files the 1099, and refuses to enable payouts on an account
-- that has not given it what it needs. KYRO never held a TIN and never will.
--
-- So the KYRO-side form was asking a creator for something nobody read,
-- adding a step between finishing Stripe onboarding and being paid, and
-- needing an admin to clear it by hand. Two gates for one question, and the
-- one that actually decides is Stripe's.
--
-- After this the payout planner holds on two conditions, both real:
--
--   · a Stripe account that exists, which only exists once Stripe is
--     satisfied, tax information included
--   · the creator's signature on the current creator agreement
--
-- What this migration does NOT do, on purpose:
--
--   · it does not drop the tax columns. Creators answered that form in good
--     faith and the answers are a record of what they told us. A column
--     nothing reads costs nothing; deleting what people submitted is not
--     reversible
--   · it does not touch migration 0037's trigger, which still stops a
--     browser writing tax_form_status. A column no longer used as a gate
--     should still not be writable by the party it describes
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.plan_payment_run_payouts(p_run_id uuid)
returns setof public.payment_run_payouts
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A creator who has since finished whatever was holding them up gets their
  -- held share queued again. Two conditions now: a payout account Stripe
  -- will accept, and their signature on the current agreement.
  update public.payment_run_payouts p
     set status = 'pending',
         stripe_account_id = c.stripe_account_id,
         failure_reason = null
    from public.creators c
   where p.run_id = p_run_id
     and p.status = 'skipped'
     and c.id = p.creator_id
     and c.stripe_account_id is not null
     and public.has_current_agreement('creator_agreement', null, c.user_id);

  insert into public.payment_run_payouts (run_id, creator_id, amount_cents, stripe_account_id, status, failure_reason)
  select p_run_id,
         e.creator_id,
         sum(e.commission_cents)::bigint,
         c.stripe_account_id,
         case
           when c.stripe_account_id is null then 'skipped'
           when not public.has_current_agreement('creator_agreement', null, c.user_id) then 'skipped'
           else 'pending'
         end,
         case
           when c.stripe_account_id is null
             then 'This creator has not set up payouts with Stripe yet.'
           when not public.has_current_agreement('creator_agreement', null, c.user_id)
             then 'This creator has not signed the creator agreement yet.'
         end
    from public.payment_run_items i
    join public.earnings e on e.id = i.earning_id
    join public.creators c on c.id = e.creator_id
   where i.run_id = p_run_id
   group by e.creator_id, c.stripe_account_id, c.user_id
  having sum(e.commission_cents) > 0
  on conflict (run_id, creator_id) do nothing;

  return query
    select p.*
      from public.payment_run_payouts p
     where p.run_id = p_run_id
     order by p.amount_cents desc;
end;
$$;

revoke execute on function public.plan_payment_run_payouts(uuid) from public, anon, authenticated;
grant execute on function public.plan_payment_run_payouts(uuid) to service_role;

/* ─────────────────────────────────────────────────────────────
   Anyone held only by the old gate is released
   ───────────────────────────────────────────────────────────── */

-- A run planned before today may hold creators whose only problem was the
-- KYRO form. Their reason is now wrong, so it goes, and the next settle
-- picks them up through the planner above.
update public.payment_run_payouts p
   set status = 'pending',
       failure_reason = null,
       stripe_account_id = c.stripe_account_id
  from public.creators c
 where c.id = p.creator_id
   and p.status = 'skipped'
   and p.failure_reason like '%tax details%'
   and c.stripe_account_id is not null
   and public.has_current_agreement('creator_agreement', null, c.user_id);

comment on column public.creators.tax_form_status is
  'Historical. KYRO collected tax details before Stripe onboarding handled it; migration 0046 stopped using this as a payout gate. Kept because creators submitted it, read by nothing.';

-- ── What landed ──────────────────────────────────────────────
-- The planner should no longer mention the tax column, and should still
-- mention the agreement. Both are read back from the stored definition
-- rather than assumed.
select
  (select position('tax_form_status' in pg_get_functiondef(p.oid)) = 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plan_payment_run_payouts')  as tax_gate_gone,
  (select position('has_current_agreement' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plan_payment_run_payouts')  as agreement_gate_kept,
  (select count(*) from public.payment_run_payouts
    where status = 'skipped' and failure_reason like '%tax details%')        as still_held_for_tax;
