-- ─────────────────────────────────────────────────────────────
-- KYRO — 0009: creator payout bank accounts
--
-- Full routing and account numbers, for ACH or wire.
--
-- This table is built like platform_credentials, and for the same reason.
-- RLS is ON with NO policies, and all privileges are revoked from anon and
-- authenticated, so it is unreachable with any key the browser holds. Only
-- the service_role key used by /api endpoints can touch it.
--
-- On top of that, the numbers are AES-256-GCM sealed before insert, with the
-- key held only in the Vercel environment. A leaked database dump without
-- KYRO_ENCRYPTION_KEY yields nothing usable.
--
-- The last four digits are stored SEPARATELY in the clear. That is the only
-- part the app ever displays, so keeping it unsealed means the common read
-- path never needs the key at all.
--
-- Run AFTER 0008_submission_feedback.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

do $$ begin create type public.payout_method as enum ('ach','wire');
exception when duplicate_object then null; end $$;

create table if not exists public.creator_payout_accounts (
  creator_id        uuid primary key references public.creators(id) on delete cascade,
  method            public.payout_method not null default 'ach',

  -- Who the account belongs to. Not secret, and needed to match the name on
  -- the tax form before money moves.
  account_holder    text not null,
  bank_name         text,

  -- Display only. Never used to move money, so safe to keep readable.
  routing_last4     text,
  account_last4     text,

  -- AES-256-GCM. Ciphertext, IV and auth tag, all base64.
  routing_ct        text not null,
  routing_iv        text not null,
  routing_tag       text not null,
  account_ct        text not null,
  account_iv        text not null,
  account_tag       text not null,

  -- Wire only. Domestic ACH does not use these.
  swift_ct          text,
  swift_iv          text,
  swift_tag         text,
  bank_address      text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$ begin
  alter table public.creator_payout_accounts
    add constraint payout_last4_chk
    check (
      (routing_last4 is null or routing_last4 ~ '^[0-9]{4}$')
      and (account_last4 is null or account_last4 ~ '^[0-9]{4}$')
    );
exception when duplicate_object then null; end $$;

alter table public.creator_payout_accounts enable row level security;
revoke all on public.creator_payout_accounts from anon, authenticated;

comment on table public.creator_payout_accounts is
  'Creator bank details for ACH and wire payouts. RLS is ON with NO policies: unreachable with anon or authenticated keys. Only service_role, meaning the /api endpoints, may read or write. Routing and account numbers are AES-256-GCM encrypted before insert; only the last four digits are stored in the clear, for display.';

drop trigger if exists creator_payout_accounts_touch on public.creator_payout_accounts;
create trigger creator_payout_accounts_touch before update on public.creator_payout_accounts
  for each row execute function public.touch_updated_at();

-- ── The creator row keeps only what the app displays ─────────
-- 0007 added payout_bank_name / payout_bank_last4 for display. Those stay,
-- and are now written by the API endpoint alongside the sealed record so the
-- creator dashboard can render the masked account without the service key.
alter table public.creators add column if not exists payout_method public.payout_method;

comment on column public.creators.payout_bank_last4 is
  'Last four of the account, for display. The full number lives sealed in creator_payout_accounts and is never exposed to the browser.';
