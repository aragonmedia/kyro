/**
 * KYRO — getting a usable Shopify access token for a stored connection.
 *
 * This is the ONLY supported way to obtain a token for an Admin API call.
 * Nothing else should unseal platform_credentials directly.
 *
 * Why it has to exist: Shopify no longer accepts non-expiring offline tokens
 * on the Admin API, so KYRO requests expiring ones. Those live for one hour.
 * A webhook that arrives 61 minutes after install cannot use the token the
 * install stored; it has to refresh first. Since webhooks are exactly the
 * thing that arrives at unpredictable times, every read path needs this.
 *
 * The refresh rotates BOTH tokens. Persisting only the access token would
 * work once and then permanently break that store, which is the kind of bug
 * that shows up weeks later as "attribution stopped".
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { seal, unseal, type Sealed } from './crypto.js';
import { refreshAccessToken } from './shopify.js';

/**
 * Refresh this many milliseconds before actual expiry.
 *
 * A token that is valid "now" can still expire during the request it is
 * about to be used for, and clock skew between us and Shopify is real. Five
 * minutes costs nothing and removes a whole class of flaky failure.
 */
const RENEW_MARGIN_MS = 5 * 60 * 1000;

export class TokenUnavailable extends Error {
  constructor(message: string, readonly needsReconnect: boolean) {
    super(message);
    this.name = 'TokenUnavailable';
  }
}

interface CredentialRow {
  id: string;
  access_token_ct: string;
  access_token_iv: string;
  access_token_tag: string;
  refresh_token_ct: string | null;
  refresh_token_iv: string | null;
  refresh_token_tag: string | null;
  expires_at: string | null;
}

const sealedFrom = (ct: string | null, iv: string | null, tag: string | null): Sealed | null =>
  ct && iv && tag ? { ct, iv, tag } : null;

/**
 * Return a Shopify access token for this brand's store, refreshing first if
 * it has expired or is about to.
 *
 * Throws TokenUnavailable rather than returning null, because every caller
 * needs to distinguish "retry later" from "the merchant must reconnect", and
 * a null gives them nothing to branch on.
 */
export async function requireStoreToken(
  db: SupabaseClient,
  brandId: string,
  shop: string
): Promise<string> {
  const { data, error } = await db
    .from('platform_credentials')
    .select(
      'id, access_token_ct, access_token_iv, access_token_tag, refresh_token_ct, refresh_token_iv, refresh_token_tag, expires_at'
    )
    .eq('brand_id', brandId)
    .eq('provider', 'shopify')
    .maybeSingle();

  if (error) throw new TokenUnavailable(`Could not read the stored credential: ${error.message}`, false);
  if (!data) throw new TokenUnavailable('No Shopify credential stored for this brand.', true);

  const row = data as CredentialRow;

  const accessSealed = sealedFrom(row.access_token_ct, row.access_token_iv, row.access_token_tag);
  if (!accessSealed) throw new TokenUnavailable('Stored Shopify credential is incomplete.', true);

  // A credential with no expiry predates expiring tokens. It cannot be used
  // and cannot be refreshed, so the merchant has to reconnect once.
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
  if (!Number.isFinite(expiresAt)) {
    throw new TokenUnavailable(
      'Stored Shopify token is a legacy non-expiring token, which the Admin API rejects. The store must be reconnected.',
      true
    );
  }

  if (Date.now() < expiresAt - RENEW_MARGIN_MS) {
    try {
      return unseal(accessSealed);
    } catch {
      throw new TokenUnavailable('Stored Shopify token could not be decrypted.', true);
    }
  }

  // Expired or nearly so. Refresh.
  const refreshSealed = sealedFrom(row.refresh_token_ct, row.refresh_token_iv, row.refresh_token_tag);
  if (!refreshSealed) {
    throw new TokenUnavailable('Shopify token has expired and no refresh token is stored.', true);
  }

  let refreshToken: string;
  try {
    refreshToken = unseal(refreshSealed);
  } catch {
    throw new TokenUnavailable('Stored Shopify refresh token could not be decrypted.', true);
  }

  let fresh;
  try {
    fresh = await refreshAccessToken(shop, refreshToken);
  } catch (e) {
    const message = (e as Error).message || 'unknown error';
    // A 400 means the refresh token is spent or revoked: reconnect. Anything
    // else (5xx, network) is worth another delivery attempt.
    const permanent = /\(4\d\d\)/.test(message);
    throw new TokenUnavailable(`Shopify token refresh failed: ${message}`, permanent);
  }

  const access = seal(fresh.access_token);
  const patch: Record<string, unknown> = {
    access_token_ct: access.ct,
    access_token_iv: access.iv,
    access_token_tag: access.tag,
    expires_at: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString(),
    rotated_at: new Date().toISOString(),
  };

  // Shopify issues a NEW refresh token on every refresh. Dropping it here
  // would make the next refresh fail and force a reconnect.
  if (fresh.refresh_token) {
    const rt = seal(fresh.refresh_token);
    patch.refresh_token_ct = rt.ct;
    patch.refresh_token_iv = rt.iv;
    patch.refresh_token_tag = rt.tag;
    if (fresh.refresh_token_expires_in) {
      patch.refresh_token_expires_at = new Date(
        Date.now() + fresh.refresh_token_expires_in * 1000
      ).toISOString();
    }
  }

  const { error: saveError } = await db
    .from('platform_credentials')
    .update(patch)
    .eq('id', row.id);

  // The token in hand is valid either way, so the call it was fetched for can
  // still proceed. But a failed save means the rotated refresh token is lost,
  // which breaks the NEXT refresh, so it must be loud.
  if (saveError) {
    console.error('[kyro] refreshed Shopify token but could not persist it', saveError);
  }

  return fresh.access_token;
}
