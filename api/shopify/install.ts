/**
 * POST /api/shopify/install
 *
 * Starts the Shopify OAuth flow for a brand.
 *
 * Returns the authorize URL as JSON rather than issuing a redirect, because
 * the caller must prove who they are. A top-level browser redirect can't carry
 * an Authorization header, so the app POSTs here with the signed-in user's
 * Supabase token, we verify they own the brand, and only then hand back a URL
 * for the app to navigate to.
 *
 * Body: { brandId: string, shop: string }
 * Header: Authorization: Bearer <supabase access token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { signState } from '../_lib/crypto.js';
import { buildAuthorizeUrl, normalizeShopDomain } from '../_lib/shopify.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in.' });

    const sb = serviceClient();
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    const brandId = typeof body.brandId === 'string' ? body.brandId : '';
    const shop = normalizeShopDomain(body.shop);

    if (!brandId) return res.status(400).json({ error: 'Missing brandId.' });
    if (!shop) {
      return res.status(400).json({ error: 'Enter your store as your-store.myshopify.com.' });
    }

    // Ownership check. Without this, any signed-in user could attach a store
    // to somebody else's brand.
    const { data: brand, error: brandError } = await sb
      .from('brands')
      .select('id, owner_user_id')
      .eq('id', brandId)
      .maybeSingle();

    if (brandError) return res.status(500).json({ error: 'Could not verify the brand.' });
    if (!brand || brand.owner_user_id !== userId) {
      return res.status(403).json({ error: "That brand isn't yours." });
    }

    return res.status(200).json({ url: buildAuthorizeUrl(shop, signState(brandId, shop)) });
  } catch (e) {
    console.error('[kyro] shopify/install failed', e);
    return res.status(500).json({ error: 'Could not start the Shopify connection.' });
  }
}
