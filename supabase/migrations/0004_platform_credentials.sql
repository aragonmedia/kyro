-- ─────────────────────────────────────────────────────────────
-- KYRO — 0004: platform credentials
--
-- Where OAuth access tokens live after a brand connects Shopify or Meta.
--
-- Deliberately NOT a column on brand_connections. That table is readable by
-- the brand that owns it (see 0003 RLS), and a brand must never be able to
-- read the token KYRO holds for their store — nor anyone else's. This table
-- has RLS enabled with NO policies at all, which denies every request that
-- arrives with an anon or authenticated key. Only the service_role key, used
-- exclusively by the serverless endpoints under /api, bypasses RLS and can
-- touch it.
--
-- Tokens are additionally encrypted at rest with AES-256-GCM before insert
-- (see api/_lib/crypto.ts). A leaked database dump without KYRO_ENCRYPTION_KEY
-- yields nothing usable.
--
-- Run AFTER 0003_commercial_model.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.platform_credentials (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references public.brands(id) on delete cascade,
  provider          public.connection_provider not null,

  -- The account this token is for: myshopify domain, or Meta ad account id.
  external_id       text not null,

  -- AES-256-GCM. Ciphertext, IV and auth tag stored separately; all base64.
  access_token_ct   text not null,
  access_token_iv   text not null,
  access_token_tag  text not null,

  -- Present for providers that issue refreshable or expiring tokens.
  refresh_token_ct  text,
  refresh_token_iv  text,
  refresh_token_tag text,
  expires_at        timestamptz,

  scopes            text[] not null default '{}',

  -- Bumped when a token is re-issued, so a stale callback can't clobber a
  -- newer token with an older one.
  rotated_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (brand_id, provider)
);

create index if not exists platform_credentials_brand_idx on public.platform_credentials(brand_id);
create index if not exists platform_credentials_expiry_idx on public.platform_credentials(expires_at)
  where expires_at is not null;

comment on table public.platform_credentials is
  'OAuth tokens per brand per provider. RLS is ON with NO policies: unreachable with anon or authenticated keys. Only service_role (the /api endpoints) may read or write. Values are AES-256-GCM encrypted before insert.';

drop trigger if exists platform_credentials_touch on public.platform_credentials;
create trigger platform_credentials_touch before update on public.platform_credentials
  for each row execute function public.touch_updated_at();

-- RLS on, zero policies. This is the security boundary, not an oversight.
alter table public.platform_credentials enable row level security;

-- Belt and braces: revoke the grants PostgREST relies on, so even a future
-- policy added by mistake can't expose this table to client keys.
revoke all on public.platform_credentials from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Webhook delivery log
--
-- Shopify retries on non-2xx and can deliver the same event twice. Recording
-- every delivery id makes the handler idempotent: a repeat is acknowledged
-- and dropped rather than double-counting an order.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      public.connection_provider not null,
  -- Shopify's X-Shopify-Webhook-Id header. Unique per delivery.
  external_id   text not null,
  topic         text not null,
  shop_domain   text,
  brand_id      uuid references public.brands(id) on delete set null,
  processed_at  timestamptz,
  error         text,
  received_at   timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists webhook_events_topic_idx on public.webhook_events(topic, received_at desc);
create index if not exists webhook_events_unprocessed_idx on public.webhook_events(received_at)
  where processed_at is null;

alter table public.webhook_events enable row level security;
revoke all on public.webhook_events from anon, authenticated;

-- Admins can read the log for debugging; nobody else, and nobody writes
-- through a client key.
drop policy if exists webhook_events_admin_read on public.webhook_events;
create policy webhook_events_admin_read on public.webhook_events for select
  using (public.is_admin());
grant select on public.webhook_events to authenticated;
