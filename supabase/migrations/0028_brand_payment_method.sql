-- ─────────────────────────────────────────────────────────────
-- 0028: How a brand pays KYRO
--
-- The other half of the money flow. Creators receive through Connect
-- (migration 0027); brands pay in through an ordinary Stripe Customer with a
-- saved payment method. KYRO charges once per payment run and transfers each
-- creator their share, which is Stripe's separate charges and transfers model.
--
-- No card or bank numbers live here, or anywhere in KYRO. Stripe collects them
-- on its own hosted page and hands back an identifier plus the last four,
-- which is all that is needed to show a brand which method is on file.
--
-- ach_mandate_ref predates this and still gates paymentReady. It is kept in
-- step for ACH so nothing that reads it starts lying.
-- ─────────────────────────────────────────────────────────────

alter table public.brand_billing
  add column if not exists stripe_customer_id       text,
  add column if not exists stripe_payment_method_id text,
  -- 'card' or 'us_bank_account', straight from Stripe.
  add column if not exists stripe_method_type       text,
  -- Display only: 'visa', or the bank's name for ACH.
  add column if not exists stripe_method_brand      text,
  add column if not exists stripe_method_last4      text,
  add column if not exists stripe_method_at         timestamptz;

create unique index if not exists brand_billing_stripe_customer_idx
  on public.brand_billing(stripe_customer_id)
  where stripe_customer_id is not null;

do $$ begin
  alter table public.brand_billing
    add constraint brand_billing_method_last4_chk
    check (stripe_method_last4 is null or stripe_method_last4 ~ '^[0-9]{4}$');
exception when duplicate_object then null; end $$;

comment on column public.brand_billing.stripe_payment_method_id is
  'pm_… saved against the brand''s Stripe Customer. Never a card or bank number.';

-- A browser must not be able to tell KYRO it has a payment method.
revoke update (
  stripe_customer_id,
  stripe_payment_method_id,
  stripe_method_type,
  stripe_method_brand,
  stripe_method_last4,
  stripe_method_at
) on public.brand_billing from anon, authenticated;

-- Result: the six columns above.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'brand_billing'
  and column_name like 'stripe_%'
order by column_name;
