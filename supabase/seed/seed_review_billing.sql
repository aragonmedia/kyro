-- ═══════════════════════════════════════════════════════════════
-- Make the review account bill the way the listing says it does.
--
-- The listing says: free for 30 days, then 1% of attributed sales charged on
-- the merchant's Shopify bill. The review account was created by hand, so it
-- is marked as a direct customer, and Finance would show the 1% as something
-- KYRO collects. A reviewer reading that against the listing sees the app
-- charging outside Shopify, which is the rule they reject apps for.
--
-- This marks the review brand as App Store billed with its trial already
-- finished, so Finance shows the fee as "charged on your Shopify bill" and
-- the payment covers creator commission only.
--
-- Run after seed_review_account.sql. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

update public.brands b
   set billing_origin = 'shopify_app_store',
       fee_waived_until = now() - interval '1 day'
  from public.profiles p
 where p.id = b.owner_user_id
   and lower(p.email) = 'review@itskyro.com';

-- ── What the reviewer sees in Finance ────────────────────────
select b.name as brand,
       b.billing_origin,
       b.fee_waived_until::date as trial_ended,
       (select coalesce(sum(e.commission_cents), 0) from public.earnings e
         where e.brand_id = b.id and e.state = 'available') / 100.0 as due_to_creators_usd,
       (select coalesce(sum(e.platform_fee_cents), 0) from public.earnings e
         where e.brand_id = b.id and e.state = 'available') / 100.0 as kyro_fee_on_shopify_usd
  from public.brands b
  join public.profiles p on p.id = b.owner_user_id
 where lower(p.email) = 'review@itskyro.com';
