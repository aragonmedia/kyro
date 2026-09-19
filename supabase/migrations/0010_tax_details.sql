-- ─────────────────────────────────────────────────────────────
-- KYRO — 0010: creator tax details
--
-- What KYRO needs to issue a 1099-NEC, and nothing more.
--
-- Deliberately ABSENT: the SSN or EIN. A taxpayer identification number is a
-- government ID number, and holding one turns this database into a target
-- while buying KYRO nothing, because KYRO does not file the form. The payout
-- provider collects the TIN on the W-9 and issues the 1099 against it.
--
-- So this table holds the parts that are merely personal: legal name, entity
-- type and address. tax_form_status stays the single source of truth for
-- whether a creator can withdraw.
--
-- Run AFTER 0009_payout_accounts.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

do $$ begin create type public.tax_entity_type as enum ('individual','business');
exception when duplicate_object then null; end $$;

alter table public.creators add column if not exists tax_legal_name   text;
alter table public.creators add column if not exists tax_entity_type  public.tax_entity_type;
alter table public.creators add column if not exists tax_address      text;
alter table public.creators add column if not exists tax_country      text;

comment on column public.creators.tax_legal_name is
  'Name as it appears on the tax return. Must match the payout account holder before money moves.';

comment on column public.creators.tax_country is
  'Drives which form applies: W-9 for US persons, W-8BEN otherwise. KYRO never stores the TIN itself.';
