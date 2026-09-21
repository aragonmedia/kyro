/**
 * GET /api/shopify/launch
 *
 * Where an install that Shopify started arrives.
 *
 * When a merchant installs KYRO from the App Store (or clicks KYRO in their
 * Shopify admin later), Shopify opens the app's `application_url` with the
 * store in the query string, signed:
 *
 *   https://itskyro.com/?shop=bold-buns.myshopify.com&hmac=…&host=…&timestamp=…
 *
 * vercel.json routes exactly that shape of request here, before the web app
 * loads. App Store requirement 2.3.2 says OAuth must happen before the
 * merchant sees any screen, including sign-up, so this answers with a
 * redirect straight into Shopify's OAuth. The merchant already approved the
 * scopes on Shopify's install screen, so Shopify passes them straight through
 * to /api/shopify/callback without asking again.
 *
 * The callback then either refreshes the token for the brand that already
 * owns this store, or parks the token until the merchant creates a brand.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signState } from '../_lib/crypto.js';
import { buildAuthorizeUrl, normalizeShopDomain, verifyOAuthHmac } from '../_lib/shopify.js';
import { appOrigin } from '../_lib/env.js';

/** Shopify's launch signature is only honoured for a short window. */
const MAX_AGE_SECONDS = 5 * 60;

function back(res: VercelResponse, reason: string) {
  res.setHeader('Location', `${appOrigin()}/?shopify=error&reason=${encodeURIComponent(reason)}`);
  return res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const query = req.query as Record<string, string | string[] | undefined>;

    // 1. Signature first. Every other field is attacker-supplied until this passes.
    if (!verifyOAuthHmac(query)) return back(res, 'signature');

    // 2. Stale links are refused, so a copied URL cannot be replayed later.
    const ts = Number(query.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS) {
      return back(res, 'expired');
    }

    const shop = normalizeShopDomain(typeof query.shop === 'string' ? query.shop : undefined);
    if (!shop) return back(res, 'incomplete');

    // 3. Straight into OAuth. No brand yet, so the state carries the shop only.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', buildAuthorizeUrl(shop, signState('', shop, true)));
    return res.status(302).end();
  } catch (e) {
    console.error('[kyro] shopify/launch failed', e);
    return back(res, 'unexpected');
  }
}
