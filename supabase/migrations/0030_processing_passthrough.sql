-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0030: the processor's cost, recorded separately
--
-- KYRO charges 1% of attributed sales. Stripe charges its own fee on top of
-- whatever is run through it, and absorbing that meant KYRO's real revenue
-- moved with a choice the brand makes. On a card, Stripe's 2.9% plus 30c took
-- more than half of a 1% fee.
--
-- The processor's cost is now added to the charge and passed to the processor
-- in full. KYRO keeps none of it. This column records what was added, so a
-- brand asking "what is this line" months later gets an answer from the row
-- rather than from a recalculation against today's rates.
--
-- Stored, not derived, for the same reason platform_fee_cents is: a change to
-- Stripe's rates must never rewrite what a brand was already charged.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.payment_runs
  add column if not exists processing_fee_cents bigint not null default 0;

comment on column public.payment_runs.processing_fee_cents is
  'The payment processor''s fee on this run, added to the charge and paid to the processor in full. KYRO keeps none of it. Zero on runs authorised before this was passed through.';

comment on column public.payment_runs.total_cents is
  'Creator commission plus the KYRO fee. What the brand is charged is this plus processing_fee_cents.';

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_runs'
      and column_name = 'processing_fee_cents') as processing_column;
