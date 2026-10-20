-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0029: a payment run that actually moves money
--
-- 0018 recorded what a run owed and said plainly that nothing was settled.
-- This is the other half. One run now means one charge to the brand and one
-- transfer per creator, in that order, with a row for each so both sides can
-- be told exactly what happened.
--
--   payment_runs.stripe_payment_intent_id  the charge to the brand
--   payment_run_payouts                    one row per creator paid
--
-- Order matters and cannot be swapped. KYRO transfers from its own Stripe
-- balance, so a transfer sent before the brand's charge has settled would pay
-- a creator out of KYRO's money. The charge comes first; for a bank debit the
-- transfers wait for it to clear, which is why a payout row can sit pending
-- for days without anything being wrong.
--
-- A failed charge reverts: the earnings go back to `available` and the run is
-- marked failed. Nothing is left marked paid that nobody paid for.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── The charge ───────────────────────────────────────────────

alter table public.payment_runs
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id         text,
  add column if not exists failure_reason           text,
  add column if not exists paid_out_cents           bigint not null default 0;

comment on column public.payment_runs.stripe_payment_intent_id is
  'The PaymentIntent charging the brand for this run. Null until one is created.';
comment on column public.payment_runs.paid_out_cents is
  'Sum of transfers that have actually left for creators. Reaches commission_cents when the run is fully paid out.';

-- One run, one charge. A retry that reuses the idempotency key gets the same
-- intent back, and this makes a second intent for the same run impossible.
create unique index if not exists payment_runs_intent_uniq
  on public.payment_runs(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists payment_runs_processing_idx
  on public.payment_runs(status)
  where status = 'processing';

-- ── The payouts ──────────────────────────────────────────────

create table if not exists public.payment_run_payouts (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.payment_runs(id) on delete cascade,
  creator_id         uuid not null references public.creators(id) on delete cascade,
  -- Commission only. KYRO's fee is collected in the brand's charge and never
  -- passes through a creator's share.
  amount_cents       bigint not null check (amount_cents > 0),
  stripe_account_id  text,
  stripe_transfer_id text,
  status             text not null default 'pending'
                       check (status in ('pending', 'paid', 'failed', 'skipped')),
  failure_reason     text,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);

comment on table public.payment_run_payouts is
  'One creator''s share of one payment run. status skipped means the creator has no Stripe payout account yet, so there is money owed and nowhere to send it.';

-- One share per creator per run, which is what makes paying a run twice a
-- no-op rather than a double payment.
create unique index if not exists payment_run_payouts_uniq
  on public.payment_run_payouts(run_id, creator_id);

create unique index if not exists payment_run_payouts_transfer_uniq
  on public.payment_run_payouts(stripe_transfer_id)
  where stripe_transfer_id is not null;

create index if not exists payment_run_payouts_creator_idx
  on public.payment_run_payouts(creator_id, created_at desc);

create index if not exists payment_run_payouts_pending_idx
  on public.payment_run_payouts(run_id)
  where status = 'pending';

alter table public.payment_run_payouts enable row level security;

-- The brand that paid may read it, and the creator who was paid may read
-- their own. Nobody writes from a browser.
drop policy if exists payment_run_payouts_read on public.payment_run_payouts;
create policy payment_run_payouts_read on public.payment_run_payouts for select
  using (
    public.is_admin()
    or exists (select 1 from public.payment_runs r
                 join public.brands b on b.id = r.brand_id
                where r.id = payment_run_payouts.run_id and b.owner_user_id = auth.uid())
    or exists (select 1 from public.creators c
                where c.id = payment_run_payouts.creator_id and c.user_id = auth.uid())
  );

revoke insert, update, delete on public.payment_run_payouts from anon, authenticated;

-- ── Authorising a run ────────────────────────────────────────

/**
 * Authorise payment of everything currently due, without asking who wants it.
 *
 * The sums and the locking are unchanged from 0025. What moved is the
 * ownership check, which now lives in the wrapper below. The charge happens in
 * api/stripe/[action].ts, which verifies the brand against the caller's token
 * itself and then calls this with the service key, so that one request both
 * creates the run and charges for it. A run that exists and was never charged
 * is the failure mode worth designing out.
 */
create or replace function public.authorize_payment_run_for(p_brand_id uuid, p_method text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run        uuid;
  v_commission bigint;
  v_fee        bigint;
  v_orders     integer;
  v_creators   integer;
  v_shopify    boolean;
begin
  select b.billing_origin = 'shopify_app_store' into v_shopify
    from public.brands b where b.id = p_brand_id;

  -- Lock the rows we are about to pay so a second click cannot pay them twice.
  create temporary table if not exists _run_earnings (id uuid primary key) on commit drop;
  delete from _run_earnings;

  insert into _run_earnings (id)
  select e.id
    from public.earnings e
   where e.brand_id = p_brand_id
     and e.state = 'available'
   for update;

  select coalesce(sum(e.commission_cents), 0),
         coalesce(sum(e.platform_fee_cents), 0),
         count(*),
         count(distinct e.creator_id)
    into v_commission, v_fee, v_orders, v_creators
    from public.earnings e
    join _run_earnings r on r.id = e.id;

  if v_orders = 0 then
    raise exception 'Nothing is due right now.';
  end if;

  if coalesce(v_shopify, false) then
    v_fee := 0;
  end if;

  insert into public.payment_runs
    (brand_id, status, commission_cents, platform_fee_cents, total_cents,
     order_count, creator_count, method)
  values
    (p_brand_id, 'authorized', v_commission, v_fee, v_commission + v_fee,
     v_orders, v_creators, p_method)
  returning id into v_run;

  insert into public.payment_run_items (run_id, earning_id)
  select v_run, r.id from _run_earnings r;

  update public.earnings e
     set state = 'paid', state_changed_at = now()
    from _run_earnings r
   where e.id = r.id;

  return v_run;
end;
$$;

revoke execute on function public.authorize_payment_run_for(uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_payment_run_for(uuid, text) to service_role;

/**
 * The same thing, for a brand's own owner.
 *
 * Kept so an admin or a direct SQL caller still has one entry point, and so
 * nothing that already calls it breaks. It authorises only; the money moves
 * through the endpoint.
 */
create or replace function public.authorize_payment_run(p_brand_id uuid, p_method text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    exists (select 1 from public.brands b
             where b.id = p_brand_id and b.owner_user_id = auth.uid())
    or public.is_admin()
  ) then
    raise exception 'That brand is not yours.';
  end if;

  return public.authorize_payment_run_for(p_brand_id, p_method);
end;
$$;

grant execute on function public.authorize_payment_run(uuid, text) to authenticated;

-- ── Planning the payouts ─────────────────────────────────────

/**
 * Who this run owes, and where to send it.
 *
 * Written as one row per creator rather than one per order: a creator with
 * forty attributed orders gets one transfer, not forty. The amounts come from
 * the earnings the run actually covered, so a later change to a commission
 * rate cannot rewrite what a run paid.
 *
 * Calling it twice is safe. The unique index on (run_id, creator_id) means
 * the second call inserts nothing and the rows already there are returned.
 */
-- Returns a row shape, and Postgres will not let `create or replace` change
-- one. Dropped first so re-running this file is actually idempotent.
drop function if exists public.plan_payment_run_payouts(uuid);

create or replace function public.plan_payment_run_payouts(p_run_id uuid)
returns setof public.payment_run_payouts
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A creator who has since finished Stripe onboarding gets their held share
  -- queued again. Without this, money a brand was charged for sits against a
  -- run forever because the creator was not ready on the day it was paid.
  update public.payment_run_payouts p
     set status = 'pending',
         stripe_account_id = c.stripe_account_id,
         failure_reason = null
    from public.creators c
   where p.run_id = p_run_id
     and p.status = 'skipped'
     and c.id = p.creator_id
     and c.stripe_account_id is not null;

  insert into public.payment_run_payouts (run_id, creator_id, amount_cents, stripe_account_id, status, failure_reason)
  select p_run_id,
         e.creator_id,
         sum(e.commission_cents)::bigint,
         c.stripe_account_id,
         case when c.stripe_account_id is null then 'skipped' else 'pending' end,
         case when c.stripe_account_id is null
              then 'This creator has not set up payouts yet.' end
    from public.payment_run_items i
    join public.earnings e on e.id = i.earning_id
    join public.creators c on c.id = e.creator_id
   where i.run_id = p_run_id
   group by e.creator_id, c.stripe_account_id
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

-- ── Giving up on a run ───────────────────────────────────────

/**
 * Undo a run whose charge did not go through.
 *
 * The earnings were marked paid when the run was authorised, because that is
 * what stops two runs paying the same order. If the charge then fails they
 * have to go back, or a brand ends up with orders marked paid that nobody was
 * ever charged for and no creator was ever sent.
 *
 * Earnings already transferred to a creator are left alone: that money has
 * gone, and reverting the row would offer it again on the next run.
 */
create or replace function public.fail_payment_run(p_run_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.earnings e
     set state = 'available', state_changed_at = now()
    from public.payment_run_items i
   where i.run_id = p_run_id
     and e.id = i.earning_id
     and e.state = 'paid'
     and not exists (
       select 1 from public.payment_run_payouts p
        where p.run_id = p_run_id
          and p.creator_id = e.creator_id
          and p.status = 'paid'
     );

  update public.payment_runs
     set status = 'failed',
         failure_reason = left(coalesce(p_reason, 'The charge did not go through.'), 500)
   where id = p_run_id
     and status in ('authorized', 'processing');
end;
$$;

revoke execute on function public.fail_payment_run(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_payment_run(uuid, text) to service_role;

-- ── Closing a run ────────────────────────────────────────────

/**
 * Mark a run settled once every creator's share has actually left.
 *
 * Skipped counts as outstanding, not as done. A creator who had not finished
 * Stripe onboarding on the day the run was charged is owed money KYRO is
 * holding, so the run stays `processing` and the daily settle pass keeps
 * looking at it until they can be paid. Calling it settled would be a lie
 * told once and never revisited.
 *
 * `paid_out_cents` is summed from the payout rows rather than assumed from
 * the total, so the gap between charged and paid out is always readable.
 */
create or replace function public.close_payment_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending integer;
  v_paid    bigint;
begin
  select count(*) filter (where status in ('pending', 'skipped')),
         coalesce(sum(amount_cents) filter (where status = 'paid'), 0)
    into v_pending, v_paid
    from public.payment_run_payouts
   where run_id = p_run_id;

  update public.payment_runs
     set paid_out_cents = v_paid,
         status   = case when v_pending = 0 then 'settled'::public.payment_run_status else status end,
         settled_at = case when v_pending = 0 then now() else settled_at end
   where id = p_run_id;

  return case when v_pending = 0 then 'settled' else 'processing' end;
end;
$$;

revoke execute on function public.close_payment_run(uuid) from public, anon, authenticated;
grant execute on function public.close_payment_run(uuid) to service_role;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_runs'
      and column_name in ('stripe_payment_intent_id', 'stripe_charge_id', 'failure_reason', 'paid_out_cents')) as run_columns,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_run_payouts') as payouts_table,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('authorize_payment_run_for', 'plan_payment_run_payouts',
                        'fail_payment_run', 'close_payment_run')) as functions;
