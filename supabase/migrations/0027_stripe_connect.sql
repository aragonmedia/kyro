-- ─────────────────────────────────────────────────────────────
-- 0027 — Stripe Connect: where a creator's payout account lives
--
-- Creators are Express connected accounts. Stripe hosts their onboarding,
-- verifies their identity and files their 1099, and the money moves from
-- KYRO's platform balance to their account as a transfer.
--
-- This matters beyond convenience. A platform that collects from one party
-- and pays another through its own account is aggregating, which is what
-- closed the previous Stripe account. Individually onboarded connected
-- accounts are the sanctioned form of the same money flow.
--
-- Nothing here holds bank details. Stripe collects them on its own pages and
-- KYRO never sees them, which is also why creator_payout_accounts stops being
-- necessary once this is live.
-- ─────────────────────────────────────────────────────────────

alter table public.creators
  add column if not exists stripe_account_id        text,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists stripe_charges_enabled   boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  -- What Stripe is still waiting on, verbatim, so the creator can be told
  -- precisely what is missing instead of "verification pending".
  add column if not exists stripe_requirements_due  text[] not null default '{}',
  add column if not exists stripe_checked_at        timestamptz;

create unique index if not exists creators_stripe_account_idx
  on public.creators(stripe_account_id)
  where stripe_account_id is not null;

comment on column public.creators.stripe_account_id is
  'acct_… for this creator''s Express account. Written only by the server.';
comment on column public.creators.stripe_payouts_enabled is
  'Stripe''s own answer to "can this person be paid". The only gate KYRO trusts before transferring.';

-- Browsers must not be able to mark themselves payable. Writes to these
-- columns belong to the service role alone.
revoke update (
  stripe_account_id,
  stripe_payouts_enabled,
  stripe_charges_enabled,
  stripe_details_submitted,
  stripe_requirements_due,
  stripe_checked_at
) on public.creators from anon, authenticated;

-- Result: the six columns above.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'creators'
  and column_name like 'stripe_%'
order by column_name;
