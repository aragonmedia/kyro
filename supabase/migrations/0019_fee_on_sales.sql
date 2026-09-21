-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0019 — the fee is 1% of attributed sales
--
-- Two sources disagreed. The Terms of Service said 1% of Attributed Sales;
-- the seed computed 1% of creator commission. On a 15% campaign those differ
-- about sevenfold, and a brand would have been invoiced the smaller one while
-- having agreed to the larger.
--
-- Settled on SALES, which is:
--   · what the signed Terms already say, so nothing legal has to change
--   · the basis Trybe uses (they charge 1.5% of attributed GMV), so a brand
--     comparing the two is comparing the same metric
--   · independent of the commission rate a brand picks, so KYRO's revenue
--     tracks the value created rather than how generous a brand chooses to be
--
-- One fee. Never stacked. Processing costs come out of it rather than being
-- added on top.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── Say what the columns mean, so the next person does not have to guess ──

comment on column public.earnings.platform_fee_bps is
  'KYRO fee in basis points, applied to commissionable_cents (attributed sales) — NOT to commission_cents. 100 = 1%.';

comment on column public.earnings.platform_fee_cents is
  'KYRO fee for this order: platform_fee_bps of commissionable_cents. Stored per row so a later change to the rate cannot rewrite what a brand was already charged.';

comment on column public.campaigns.platform_fee_bps is
  'KYRO fee in basis points on attributed sales for this campaign. Snapshotted onto each earning when the order lands.';

-- ── Recompute what is already stored ─────────────────────────
-- Earnings that have already been paid are deliberately left alone: a brand
-- was charged what they were charged, and rewriting history to match a new
-- rule would make the payment runs stop reconciling.

update public.earnings
   set platform_fee_cents = floor(commissionable_cents * coalesce(platform_fee_bps, 100) / 10000.0)::bigint
 where state <> 'paid';

-- ── What changed ─────────────────────────────────────────────
select case e.state
         when 'available' then '1 · Due now'
         when 'clearing'  then '2 · Clearing'
         when 'pending'   then '3 · Not fulfilled'
         when 'paid'      then '4 · Paid (left as charged)'
         else e.state::text
       end as bucket,
       count(*) as orders,
       to_char(sum(e.commissionable_cents) / 100.0, 'FM999,990.00') as attributed_sales,
       to_char(sum(e.commission_cents) / 100.0, 'FM999,990.00')     as creator_commission,
       to_char(sum(e.platform_fee_cents) / 100.0, 'FM999,990.00')   as kyro_fee
  from public.earnings e
  join public.brands b   on b.id = e.brand_id
  join public.profiles p on p.id = b.owner_user_id
 where p.role = 'brand'
 group by e.state
 order by 1;
