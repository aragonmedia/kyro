/**
 * KYRO — Shopify OAuth helpers
 */

import crypto from 'node:crypto';
import { shopifyConfig } from './env.js';
import { safeEqual } from './crypto.js';

/**
 * Validate and normalize a shop domain.
 *
 * This is the most security-critical function in the Shopify flow. Every
 * request arrives carrying a `shop` parameter, and we build URLs from it and
 * redirect users to it. Accepting an arbitrary value would let an attacker
 * point the OAuth dance at a domain they control, harvesting either the
 * install or the token exchange. Only exact `<store>.myshopify.com` passes.
 */
export function normalizeShopDomain(input: string | undefined): string | null {
  if (!input) return null;
  let shop = String(input).trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/.test(shop)) return null;
  // Reject anything with embedded credentials or ports that slipped the regex.
  if (shop.includes('@') || shop.includes(':')) return null;
  return shop;
}

/**
 * Verify the HMAC Shopify attaches to OAuth redirects.
 *
 * Shopify signs the query string: every parameter except `hmac` and
 * `signature`, sorted by key, joined as `k=v` with `&`, HMAC-SHA256 with the
 * app's client secret, hex encoded.
 */
export function verifyOAuthHmac(query: Record<string, string | string[] | undefined>): boolean {
  const { clientSecret } = shopifyConfig();
  const provided = typeof query.hmac === 'string' ? query.hmac : undefined;
  if (!provided) return false;

  const message = Object.keys(query)
    .filter((k) => k !== 'hmac' && k !== 'signature')
    .sort()
    .map((k) => {
      const v = query[k];
      return `${k}=${Array.isArray(v) ? v.join(',') : v ?? ''}`;
    })
    .join('&');

  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  return safeEqual(digest, provided);
}

/** The URL a merchant is sent to in order to approve the install. */
export function buildAuthorizeUrl(shop: string, state: string): string {
  const { clientId, redirectUri, scopes } = shopifyConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
}

/** Trade the one-time code for a store access token. Requires the secret. */
export async function exchangeCodeForToken(shop: string, code: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = shopifyConfig();
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new Error('Shopify token exchange returned no access_token.');
  return json;
}
