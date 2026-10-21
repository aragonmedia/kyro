-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0032: no transfer before the tax form
--
-- KYRO issues the 1099-NEC, not Stripe. A creator paid $600 or more across a
-- calendar year has to be reported, and a creator paid with no W-9 on file is
-- a reporting obligation with nobody's details attached to it. The creator
-- portal has always said tax info is required before money moves. The payment
-- run did not check, so it was a promise the product did not keep.
--
-- Held, not skipped over. The share is recorded against the run with a reason,
-- the brand has already paid for it, and the daily settle pass sends it the
-- day the creator completes their details. Nobody loses money; it waits.
--
-- Same shape as the Stripe onboarding hold in 0029, and for the same reason:
-- the two blockers are different but a creator should not have to care which
-- one is theirs.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

drop function if exists public.plan_payment_run_payouts(uuid);

create or replace function public.plan_payment_run_payouts(p_run_id uuid)
returns setof public.payment_run_payouts
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A creator who has since finished whatever was holding them up gets their
  -- held share queued again. Both conditions have to hold: a payout account
  -- Stripe will accept, and tax details KYRO can report against.
  update public.payment_run_payouts p
     set status = 'pending',
         stripe_account_id = c.stripe_account_id,
         failure_reason = null
    from public.creators c
   where p.run_id = p_run_id
     and p.status = 'skipped'
     and c.id = p.creator_id
     and c.stripe_account_id is not null
     and c.tax_form_status = 'complete';

  insert into public.payment_run_payouts (run_id, creator_id, amount_cents, stripe_account_id, status, failure_reason)
  select p_run_id,
         e.creator_id,
         sum(e.commission_cents)::bigint,
         c.stripe_account_id,
         case
           when c.stripe_account_id is null then 'skipped'
           when c.tax_form_status <> 'complete' then 'skipped'
           else 'pending'
         end,
         case
           when c.stripe_account_id is null
             then 'This creator has not set up payouts yet.'
           when c.tax_form_status <> 'complete'
             then 'This creator has not submitted their tax details yet.'
         end
    from public.payment_run_items i
    join public.earnings e on e.id = i.earning_id
    join public.creators c on c.id = e.creator_id
   where i.run_id = p_run_id
   group by e.creator_id, c.stripe_account_id, c.tax_form_status
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

-- ── What landed ──────────────────────────────────────────────
-- Reads the stored definition back, so this reports what the database will
-- run rather than what this file intended.
select
  (select position('tax_form_status' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plan_payment_run_payouts'
    limit 1) as tax_check_present,
  (select count(*) from public.payment_run_payouts where status = 'pending') as currently_pending;
