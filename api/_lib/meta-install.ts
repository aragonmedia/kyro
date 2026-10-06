/**
 * POST /api/meta/install
 *
 * Starts the Meta connection for a brand.
 *
 * Mirrors the Shopify install endpoint: the URL is returned as JSON rather
 * than issued as a redirect, because a top-level redirect cannot carry the
 * signed-in user's token, and we will not start a connection without first
 * checking this caller owns this brand.
 *
 * Body:   { brandId: string }
 * Header: Authorization: Bearer <supabase access token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from './supabase.js';
import { signState } from './crypto.js';
import { buildLoginUrl } from './meta.js';

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
    if (!brandId) return res.status(400).json({ error: 'Missing brandId.' });

    const { data: brand, error: brandError } = await sb
      .from('brands')
      .select('id, owner_user_id')
      .eq('id', brandId)
      .maybeSingle();

    if (brandError) return res.status(500).json({ error: 'Could not verify the brand.' });
    if (!brand || brand.owner_user_id !== userId) {
      return res.status(403).json({ error: "That brand isn't yours." });
    }

    return res.status(200).json({ url: buildLoginUrl(signState(brandId)) });
  } catch (e) {
    console.error('[kyro] meta/install failed', e);
    const message = (e as Error).message ?? '';
    // A missing app secret is a setup problem, not a merchant problem.
    if (message.includes('META_APP_SECRET') || message.includes('VITE_META_APP_ID')) {
      return res.status(503).json({ error: 'Meta is not configured on this deployment yet.' });
    }
    return res.status(500).json({ error: 'Could not start the Meta connection.' });
  }
}
