-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0036: moving Stripe from test mode to live
--
-- Every Stripe identifier is scoped to the key that made it. An acct_, cus_,
-- pm_ or pi_ created with a test key does not exist to a live key: Stripe
-- answers "no such …" and nothing else. So the moment STRIPE_SECRET_KEY
-- becomes a live key, every identifier this database holds becomes a lie that
-- the application keeps acting on. A creator's row would still say payouts are
-- enabled and a transfer to them would fail. A brand would still be shown a
-- saved card that cannot be charged.
--
-- This clears all of it, after keeping a copy.
--
-- What it does NOT do is delete history. Earnings, payment runs and payout
-- rows stay exactly as they are, because they record what happened, and the
-- archive below keeps the identifiers themselves in case a test-mode charge
-- ever has to be looked up in Stripe again.
--
-- It also adds stripe_mode next to the identifiers it clears. From here on
-- every stored account and customer says which mode created it, so a preview
-- deployment running a test key can never overwrite a live customer id on a
-- real brand, and a mismatch shows up as "not set up" rather than as an
-- unexplained Stripe error. See api/_lib/env.ts (stripeMode).
--
-- RUN THIS AT THE SWITCH, not before. Running it while the test key is still
-- in production logs every creator out of their payout setup for nothing.
--
-- After it runs:
--   · every creator redoes Stripe payout onboarding, on a live account
--   · every brand re-enters a payment method, on a live customer
--   · any run still in flight is failed, and its earnings return to available
--     so the brand can pay them again with a working method
--
-- Idempotent. Running it twice archives nothing new and clears nothing new.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Somewhere to keep what we are about to clear ──────────
create table if not exists public.stripe_test_archive (
  id          uuid primary key default gen_random_uuid(),
  -- 'creator', 'brand_billing' or 'payment_run'.
  kind        text not null,
  subject_id  uuid not null,
  payload     jsonb not null,
  archived_at timestamptz not null default now()
);

comment on table public.stripe_test_archive is
  'Stripe identifiers from before the live switch. Written once by migration 0036. Service role only: no policy grants read to anyone else.';

-- RLS on with no policy at all means no browser session can read this,
-- whatever its role. The service role bypasses RLS and is the only thing that
-- ever needed it.
alter table public.stripe_test_archive enable row level security;
revoke all on public.stripe_test_archive from anon, authenticated;

create index if not exists stripe_test_archive_subject_idx
  on public.stripe_test_archive(kind, subject_id);

-- ── 2. Which mode made each identifier ───────────────────────
alter table public.creators      add column if not exists stripe_mode text;
alter table public.brand_billing add column if not exists stripe_mode text;

do $$ begin
  alter table public.creators add constraint creators_stripe_mode_chk
    check (stripe_mode is null or stripe_mode in ('test', 'live'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.brand_billing add constraint brand_billing_stripe_mode_chk
    check (stripe_mode is null or stripe_mode in ('test', 'live'));
exception when duplicate_object then null; end $$;

comment on column public.creators.stripe_mode is
  'Which Stripe key created stripe_account_id: test or live. Null means no account. Written only by the server.';
comment on column public.brand_billing.stripe_mode is
  'Which Stripe key created stripe_customer_id: test or live. Null means no customer. Written only by the server.';

-- A browser must not be able to claim its account is a live one.
revoke update (stripe_mode) on public.creators      from anon, authenticated;
revoke update (stripe_mode) on public.brand_billing from anon, authenticated;

-- ── 3. Archive, then clear: creators ─────────────────────────
insert into public.stripe_test_archive (kind, subject_id, payload)
select
  'creator',
  c.id,
  jsonb_build_object(
    'stripe_account_id',        c.stripe_account_id,
    'stripe_payouts_enabled',   c.stripe_payouts_enabled,
    'stripe_charges_enabled',   c.stripe_charges_enabled,
    'stripe_details_submitted', c.stripe_details_submitted,
    'stripe_requirements_due',  to_jsonb(c.stripe_requirements_due),
    'stripe_checked_at',        c.stripe_checked_at
  )
from public.creators c
where c.stripe_account_id is not null
  and not exists (
    select 1 from public.stripe_test_archive a
    where a.kind = 'creator' and a.subject_id = c.id
  );

update public.creators
   set stripe_account_id        = null,
       stripe_payouts_enabled   = false,
       stripe_charges_enabled   = false,
       stripe_details_submitted = false,
       stripe_requirements_due  = '{}',
       stripe_checked_at        = null,
       stripe_mode              = null
 where stripe_account_id is not null;

-- ── 4. Archive, then clear: brand payment methods ────────────
insert into public.stripe_test_archive (kind, subject_id, payload)
select
  'brand_billing',
  b.brand_id,
  jsonb_build_object(
    'stripe_customer_id',       b.stripe_customer_id,
    'stripe_payment_method_id', b.stripe_payment_method_id,
    'stripe_method_type',       b.stripe_method_type,
    'stripe_method_brand',      b.stripe_method_brand,
    'stripe_method_last4',      b.stripe_method_last4,
    'stripe_method_at',         b.stripe_method_at,
    'ach_mandate_ref',          b.ach_mandate_ref
  )
from public.brand_billing b
where (b.stripe_customer_id is not null or b.stripe_payment_method_id is not null)
  and not exists (
    select 1 from public.stripe_test_archive a
    where a.kind = 'brand_billing' and a.subject_id = b.brand_id
  );

-- ach_mandate_ref is cleared with the rest: it predates Stripe here and still
-- gates paymentReady, so leaving it set would show a brand as ready to pay
-- with a mandate that no longer exists.
update public.brand_billing
   set stripe_customer_id       = null,
       stripe_payment_method_id = null,
       stripe_method_type       = null,
       stripe_method_brand      = null,
       stripe_method_last4      = null,
       stripe_method_at         = null,
       ach_mandate_ref          = null,
       stripe_mode              = null
 where stripe_customer_id is not null
    or stripe_payment_method_id is not null
    or ach_mandate_ref is not null;

-- ── 5. Stop chasing test-mode charges ────────────────────────
-- The daily settle pass polls every run in `processing` by its PaymentIntent.
-- A test intent read with a live key is an error forever, so each one is
-- failed here instead. fail_payment_run returns its earnings to `available`,
-- which is what makes the brand able to pay them again once they have a real
-- method on file.
do $$
declare
  r record;
begin
  for r in
    select id from public.payment_runs
     where status in ('authorized', 'processing')
  loop
    insert into public.stripe_test_archive (kind, subject_id, payload)
    select 'payment_run', p.id,
           jsonb_build_object(
             'status',                   p.status,
             'stripe_payment_intent_id', p.stripe_payment_intent_id,
             'total_cents',              p.total_cents,
             'authorized_at',            p.authorized_at
           )
      from public.payment_runs p
     where p.id = r.id
       and not exists (
         select 1 from public.stripe_test_archive a
         where a.kind = 'payment_run' and a.subject_id = p.id
       );

    perform public.fail_payment_run(
      r.id,
      'Cancelled when KYRO moved to live payments. Nothing was charged. Authorize this again with a payment method on file.'
    );
  end loop;
end $$;

-- ── What landed ──────────────────────────────────────────────
-- Every number below should be zero except archived_rows, which should match
-- however many creators, brands and runs carried test-mode state.
select
  (select count(*) from public.stripe_test_archive)                      as archived_rows,
  (select count(*) from public.creators
     where stripe_account_id is not null)                                as creators_still_linked,
  (select count(*) from public.creators
     where stripe_payouts_enabled)                                       as creators_still_payable,
  (select count(*) from public.brand_billing
     where stripe_customer_id is not null
        or stripe_payment_method_id is not null
        or ach_mandate_ref is not null)                                  as brands_still_holding_a_method,
  (select count(*) from public.payment_runs
     where status in ('authorized', 'processing'))                       as runs_still_in_flight;
