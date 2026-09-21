/**
 * POST /api/shopify/launch
 *
 * Handles an install that Shopify started rather than KYRO.
 *
 * When a merchant clicks Install on the App Store listing — or on the Partner
 * Dashboard test link — Shopify shows its own consent screen and then sends
 * them to the app's `application_url` (itskyro.com) with the store in the
 * query string, signed:
 *
 *   https://itskyro.com/?shop=bold-buns.myshopify.com&hmac=…&host=…&timestamp=…
 *
 * Before this existed, that landed on the marketing page and nothing happened,
 * so an install from Shopify's side silently never connected.
 *
 * This endpoint only answers one question: is that signature genuine, and for
 * which shop? It deliberately does NOT connect anything. The browser then
 * hands the verified shop to POST /api/shopify/install — the existing path,
 * which already checks the signed-in user owns the brand. So there is no new
 * way to attach a store to a brand, just a new way to arrive at the old one.
 *
 * Body: the query parameters Shopify appended, as an object.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeShopDomain, verifyOAuthHmac } from '../_lib/shopify.js';

/** Shopify's launch signature is only honoured for a short window. */
const MAX_AGE_SECONDS = 5 * 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === 'string') query[k] = v;
    }

    // 1. Signature first. Every other field is attacker-supplied until this passes.
    if (!verifyOAuthHmac(query)) {
      return res.status(400).json({ error: 'That link did not come from Shopify.' });
    }

    // 2. Stale links are refused, so a copied URL cannot be replayed later.
    const ts = Number(query.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_AGE_SECONDS) {
      return res.status(400).json({ error: 'That Shopify link has expired. Start the install again.' });
    }

    const shop = normalizeShopDomain(query.shop);
    if (!shop) return res.status(400).json({ error: 'Shopify did not say which store.' });

    return res.status(200).json({ shop });
  } catch (e) {
    console.error('[kyro] shopify/launch failed', e);
    return res.status(500).json({ error: 'Could not read the Shopify link.' });
  }
}
