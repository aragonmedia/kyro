-- ─────────────────────────────────────────────────────────────
-- KYRO — 0006: expiring Shopify offline tokens
--
-- Shopify stopped accepting non-expiring offline tokens on the Admin API.
-- Every call made with one returns:
--
--   403 [API] Non-expiring access tokens are no longer accepted for the
--   Admin API. Start using expiring offline tokens
--
-- The install still succeeds, because Shopify issues the token happily. It
-- is only rejected when used, which is why our first real install looked
-- perfect and then failed to subscribe a single webhook.
--
-- KYRO now requests `expiring: 1`. Access tokens live 1 hour and refresh
-- tokens live 90 days, and BOTH rotate on every refresh. `expires_at`
-- already existed for the access token; this adds the refresh token's own
-- deadline, which is the thing that decides whether a quiet store can be
-- recovered automatically or needs the merchant to reconnect.
--
-- Run AFTER 0005_attribution.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

alter table public.platform_credentials
  add column if not exists refresh_token_expires_at timestamptz;

comment on column public.platform_credentials.refresh_token_expires_at is
  'When the REFRESH token stops working (90 days from issue, rotated on each refresh). Past this, no automatic recovery is possible and the merchant must reconnect the store.';

-- Finds stores that will need a reconnect before they silently stop
-- reporting orders.
create index if not exists platform_credentials_refresh_expiry_idx
  on public.platform_credentials(refresh_token_expires_at)
  where refresh_token_expires_at is not null;

-- Any credential stored before this migration is a non-expiring token the
-- Admin API will refuse. Mark it so requireStoreToken() reports "reconnect"
-- rather than retrying forever against a token that can never work.
update public.platform_credentials
   set expires_at = null
 where provider = 'shopify'
   and expires_at is null;
