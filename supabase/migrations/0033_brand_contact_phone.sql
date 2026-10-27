-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0033: a phone number for the brand, for KYRO's use only
--
-- There are moments where email is the wrong channel. A payment run has
-- failed, a store has disconnected mid-campaign, a brand is about to go
-- overdue and lose its content licence under Terms §9(e). Those are worth a
-- call, and today KYRO has no way to make one.
--
-- ⚠ SCOPE. This number is for KYRO contacting the Brand about their own
--   account. It is NOT a marketing channel. KYRO does not send promotional
--   SMS, does not sell or share it, and no campaign, creator or other brand
--   can see it. The column carries that restriction as a comment so the next
--   person to read the schema sees the rule before they see the data.
--
--   It is optional. A brand that leaves it blank is fully set up, and nothing
--   in the product gates on it.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.brands
  add column if not exists contact_phone text;

comment on column public.brands.contact_phone is
  'Optional. A number for KYRO to reach this Brand about their own account: a failed payment, a broken connection, an overdue amount. Operational use only. Never used for marketing or promotional messaging, never shared with Creators or other Brands, never sold.';

-- A loose shape check only. Numbers arrive with spaces, dashes, brackets and
-- country codes, and rejecting a real number because it was typed in an
-- unexpected format is worse than storing it as the brand wrote it. This
-- catches a wrong field, not a wrong format.
do $$ begin
  alter table public.brands
    add constraint brands_contact_phone_shape
    check (
      contact_phone is null
      or (char_length(btrim(contact_phone)) between 7 and 24
          and contact_phone ~ '^[0-9+()\-.\s]+$')
    );
exception when duplicate_object then null; end $$;

-- Writes to public.brands are already revoked from anon and authenticated by
-- the billing migrations, so this column inherits that: the owner reads and
-- writes it through the setup and profile forms, the server writes it, and
-- nobody else sees it.

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'contact_phone') as phone_column,
  (select count(*) from pg_constraint where conname = 'brands_contact_phone_shape')            as shape_constraint,
  (select count(*) from public.brands where contact_phone is not null)                          as brands_with_phone;
