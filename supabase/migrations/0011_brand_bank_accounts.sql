-- ─────────────────────────────────────────────────────────────
-- KYRO — 0011: brand ACH billing accounts
--
-- Commission is billed to a brand's bank account by ACH, not to a card, so
-- card processing fees do not eat the 1% KYRO fee. This is where those bank
-- details live until a payment processor is connected and can hold them.
--
-- Same shape and same reasoning as creator_payout_accounts: RLS ON with NO
-- policies, no grants to anon or authenticated, numbers AES-256-GCM sealed
-- before insert, last four kept separately in the clear for display.
--
-- Deliberately ABSENT: anything to do with cards. A card number must be
-- tokenised by the payment processor in their own hosted field and must
-- never reach KYRO's server or database. brand_billing.deposit_ref already
-- exists to hold the processor's reference once that is wired.
--
-- Run AFTER 0010_tax_details.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.brand_bank_accounts (
  brand_id       uuid primary key references public.brands(id) on delete cascade,
  account_holder text not null,
  bank_name      text,
  routing_last4  text,
  account_last4  text,
  routing_ct text not null, routing_iv text not null, routing_tag text not null,
  account_ct text not null, account_iv text not null, account_tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.brand_bank_accounts add constraint brand_bank_last4_chk
    check ((routing_last4 is null or routing_last4 ~ '^[0-9]{4}$')
       and (account_last4 is null or account_last4 ~ '^[0-9]{4}$'));
exception when duplicate_object then null; end $$;

alter table public.brand_bank_accounts enable row level security;
revoke all on public.brand_bank_accounts from anon, authenticated;

comment on table public.brand_bank_accounts is
  'Brand ACH billing details. RLS ON with NO policies: only service_role, meaning the /api endpoints, can read or write. Routing and account numbers are AES-256-GCM sealed; only the last four are readable.';

drop trigger if exists brand_bank_accounts_touch on public.brand_bank_accounts;
create trigger brand_bank_accounts_touch before update on public.brand_bank_accounts
  for each row execute function public.touch_updated_at();

-- Display-safe mirror on brand_billing, which the dashboard reads under RLS.
alter table public.brand_billing add column if not exists ach_bank_name  text;
alter table public.brand_billing add column if not exists ach_last4      text;
alter table public.brand_billing add column if not exists ach_updated_at timestamptz;
