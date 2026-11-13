-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0050: disconnecting a store actually gives the key back
--
-- Until now "Disconnect" set a status flag and nothing else. The encrypted
-- access token stayed in platform_credentials, so KYRO kept a working key to
-- a store the merchant had told it to let go of.
--
-- That is not a hypothetical. A Shopify reviewer installed KYRO on their own
-- store during the last review; the install is still on file, and the only
-- thing standing between that token and a request is a boolean nobody reads.
--
-- A merchant who clicks Disconnect means "stop, and give the key back". So
-- this does both, in one transaction, and it is the browser's own call:
-- platform_credentials is RLS-on with no policies, so the delete has to
-- happen inside a security-definer function rather than from the client.
-- An endpoint would have been the obvious home for it, but Vercel's Hobby
-- plan caps the project at twelve serverless functions and KYRO is at
-- exactly twelve. An RPC costs none.
--
-- Also here: the App Store install decides who bills the brand.
--
-- apply_app_store_billing used to run only when the brand was created at the
-- same moment as the install, which read "arrived from the App Store" as
-- "signed up during the install". A merchant who already had a KYRO account
-- and then installed from the App Store stayed on Stripe billing, which is
-- the arrangement App Store rule 1.2.1 exists to prevent. The origin now
-- follows the install, and only the fee waiver still asks whether the brand
-- is new, because a brand six months in should not get a free month for
-- reinstalling.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────────────────────
   Disconnect, properly
   ───────────────────────────────────────────────────────────── */

create or replace function public.revoke_provider(
  p_brand_id uuid,
  p_provider public.connection_provider
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_user_id into v_owner from public.brands where id = p_brand_id;
  if v_owner is null then
    return false;
  end if;

  -- security definer bypasses RLS, so ownership is checked here or nowhere.
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'That brand is not yours.' using errcode = '42501';
  end if;

  update public.brand_connections
     set status = 'disconnected',
         disconnected_at = now(),
         last_error = null
   where brand_id = p_brand_id
     and provider = p_provider;

  -- The point of the exercise.
  delete from public.platform_credentials
   where brand_id = p_brand_id
     and provider = p_provider;

  return true;
end;
$$;

comment on function public.revoke_provider(uuid, public.connection_provider) is
  'Disconnect a provider and delete its stored token. Brand owner or admin only.';

revoke all on function public.revoke_provider(uuid, public.connection_provider) from public, anon;
grant execute on function public.revoke_provider(uuid, public.connection_provider) to authenticated;

/* ─────────────────────────────────────────────────────────────
   Who bills a brand that arrived through the App Store
   ───────────────────────────────────────────────────────────── */

-- The signature gains an argument, so the old one has to go rather than sit
-- beside it: two overloads reachable by the same call is an ambiguity error
-- at the worst possible moment.
drop function if exists public.apply_app_store_billing(uuid);

create or replace function public.apply_app_store_billing(
  p_brand_id uuid,
  p_with_trial boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.brands
     set billing_origin = 'shopify_app_store',
         fee_waived_until = case
           when p_with_trial then coalesce(fee_waived_until, now() + interval '30 days')
           else fee_waived_until
         end
   where id = p_brand_id;
end;
$$;

comment on function public.apply_app_store_billing(uuid, boolean) is
  'Move a brand onto Shopify billing because it installed from the App Store. The waiver is for brands that signed up during that install, not for every reinstall.';

revoke all on function public.apply_app_store_billing(uuid, boolean) from public, anon, authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'revoke_provider')            as revoke_function,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_app_store_billing')    as billing_functions,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_app_store_billing'
      and p.pronargs = 2)                                                    as billing_takes_trial_flag;
