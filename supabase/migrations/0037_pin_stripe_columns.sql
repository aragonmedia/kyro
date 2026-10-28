-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0037: a browser cannot declare itself payable
--
-- Migrations 0027 and 0028 each end with a statement of intent:
--
--   revoke update (stripe_account_id, stripe_payouts_enabled, …)
--     on public.creators from anon, authenticated;
--
-- Those statements do nothing. Supabase grants table-level UPDATE on every
-- table in `public` to anon and authenticated through default privileges, and
-- in Postgres a column-level revoke cannot subtract from a table-level grant.
-- The column privilege it removes was never the one being used.
--
-- Proven against a copy of this schema. With nothing but a creator's own
-- session, holding only their own JWT:
--
--   update public.creators
--      set stripe_payouts_enabled = true,
--          stripe_account_id = 'acct_attacker'
--    where id = <their own id>;          -- UPDATE 1
--
-- The row-level policy allows it: `creators_write` is USING (user_id =
-- auth.uid()), which is correct for a creator editing their bio and says
-- nothing about which columns they may touch.
--
-- What that buys an attacker today is bounded, because Stripe refuses a
-- transfer to an account that is not connected to this platform. What it
-- buys them is the right to skip the holds: migration 0032 holds a payout
-- until Stripe says payouts are enabled and the tax form is complete, and
-- both of those facts live in columns the creator can write. The brand side
-- is worse in principle: brand_billing.stripe_customer_id is writable by the
-- brand's own owner, and that column decides which Stripe Customer a payment
-- run charges.
--
-- None of this mattered much while the keys were test keys. All of it
-- matters from the moment a live key is in production, which is why it is
-- fixed in the same push as the switch.
--
-- The fix is the shape 0034 already uses for profiles.role: a trigger that
-- pins the protected columns for browser sessions and leaves the service
-- role alone. Rewriting the grants instead would mean enumerating every
-- column a browser *may* write, and the next column added to either table
-- would silently become unwritable rather than silently writable. A trigger
-- names what is protected, which is the shorter and more honest list.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/**
 * Creators.
 *
 * Everything Stripe says about a creator is Stripe's to say, read back by
 * the server in api/stripe/[action].ts. A browser may ask to be onboarded;
 * it may not announce the result.
 *
 * tax_form_status is the one column here a browser legitimately writes: a
 * creator submitting their details sets it to 'pending' (src/lib/db.ts). It
 * is only 'complete' that releases a payout, so only 'complete' is pinned,
 * and an admin is let through, because accepting a creator's tax details is
 * a judgement KYRO makes and the admin portal is where it will be made.
 * Nothing lets an admin through on the Stripe columns: what Stripe says
 * about an account is Stripe's to say, and a hand-edit there would only ever
 * be a lie that money is then moved on.
 */
create or replace function public.creators_pin_stripe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A session with no claims is the service role or the SQL editor. Both are
  -- deliberate acts by KYRO itself and are left alone.
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.stripe_account_id        := null;
    new.stripe_payouts_enabled   := false;
    new.stripe_charges_enabled   := false;
    new.stripe_details_submitted := false;
    new.stripe_requirements_due  := '{}';
    new.stripe_checked_at        := null;
    new.stripe_mode              := null;
    if new.tax_form_status = 'complete' and not public.is_admin() then
      new.tax_form_status := 'not_collected';
    end if;
    return new;
  end if;

  new.stripe_account_id        := old.stripe_account_id;
  new.stripe_payouts_enabled   := old.stripe_payouts_enabled;
  new.stripe_charges_enabled   := old.stripe_charges_enabled;
  new.stripe_details_submitted := old.stripe_details_submitted;
  new.stripe_requirements_due  := old.stripe_requirements_due;
  new.stripe_checked_at        := old.stripe_checked_at;
  new.stripe_mode              := old.stripe_mode;

  -- Submitting details is theirs to do. Declaring them accepted is KYRO's.
  if new.tax_form_status = 'complete'
     and old.tax_form_status is distinct from 'complete'
     and not public.is_admin() then
    new.tax_form_status := old.tax_form_status;
  end if;

  return new;
end;
$$;

drop trigger if exists creators_pin_stripe on public.creators;
create trigger creators_pin_stripe
  before insert or update on public.creators
  for each row execute function public.creators_pin_stripe();

/**
 * Brand billing.
 *
 * stripe_customer_id decides whose card a payment run charges, and
 * ach_mandate_ref is half of what makes a brand look ready to pay. Both are
 * written by the server after reading a completed Checkout session back from
 * Stripe, and neither is ever a claim a browser gets to make.
 *
 * The row itself stays creatable from a browser: src/lib/db.ts inserts an
 * empty brand_billing row on demand, and that is harmless.
 */
create or replace function public.brand_billing_pin_stripe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.stripe_customer_id       := null;
    new.stripe_payment_method_id := null;
    new.stripe_method_type       := null;
    new.stripe_method_brand      := null;
    new.stripe_method_last4      := null;
    new.stripe_method_at         := null;
    new.stripe_mode              := null;
    new.ach_mandate_ref          := null;
    return new;
  end if;

  new.stripe_customer_id       := old.stripe_customer_id;
  new.stripe_payment_method_id := old.stripe_payment_method_id;
  new.stripe_method_type       := old.stripe_method_type;
  new.stripe_method_brand      := old.stripe_method_brand;
  new.stripe_method_last4      := old.stripe_method_last4;
  new.stripe_method_at         := old.stripe_method_at;
  new.stripe_mode              := old.stripe_mode;
  new.ach_mandate_ref          := old.ach_mandate_ref;

  return new;
end;
$$;

drop trigger if exists brand_billing_pin_stripe on public.brand_billing;
create trigger brand_billing_pin_stripe
  before insert or update on public.brand_billing
  for each row execute function public.brand_billing_pin_stripe();

-- ── What landed ──────────────────────────────────────────────
-- Both triggers should be present, and both functions should be security
-- definer, or they cannot see past the caller's own row-level policies.
select
  (select count(*) from pg_trigger
    where tgname = 'creators_pin_stripe' and not tgisinternal)      as creators_trigger,
  (select count(*) from pg_trigger
    where tgname = 'brand_billing_pin_stripe' and not tgisinternal) as brand_billing_trigger,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('creators_pin_stripe', 'brand_billing_pin_stripe')
      and p.prosecdef)                                              as security_definer_functions;
