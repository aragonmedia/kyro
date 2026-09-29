/**
 * GET  /api/meta/accounts?brandId=…   list the ad accounts this brand can use
 * POST /api/meta/accounts             choose one
 *
 * Kept together because they are two halves of one question: which ad account
 * does KYRO publish this brand's creator videos to.
 *
 * Header: Authorization: Bearer <supabase access token>
 * POST body: { brandId: string, adAccountId: string }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { unseal } from '../_lib/crypto.js';
import { listAdAccounts, MetaError } from '../_lib/meta.js';

type Db = ReturnType<typeof serviceClient>;

async function ownedBrand(sb: Db, req: VercelRequest, brandId: string) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { error: 'Not signed in.', status: 401 };

  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return { error: 'Not signed in.', status: 401 };
  if (!brandId) return { error: 'Missing brandId.', status: 400 };

  const { data: brand, error } = await sb
    .from('brands')
    .select('id, owner_user_id')
    .eq('id', brandId)
    .maybeSingle();

  if (error) return { error: 'Could not verify the brand.', status: 500 };
  if (!brand || brand.owner_user_id !== userId) return { error: "That brand isn't yours.", status: 403 };
  return { brandId, status: 200 };
}

/** The stored Meta token for a brand, or null when they have not connected. */
async function metaToken(sb: Db, brandId: string): Promise<string | null> {
  const { data } = await sb
    .from('platform_credentials')
    .select('access_token_ct, access_token_iv, access_token_tag')
    .eq('brand_id', brandId)
    .eq('provider', 'meta')
    .maybeSingle();

  if (!data?.access_token_ct) return null;
  try {
    return unseal({
      ct: data.access_token_ct as string,
      iv: data.access_token_iv as string,
      tag: data.access_token_tag as string,
    });
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sb = serviceClient();

  try {
    if (req.method === 'GET') {
      const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
      const check = await ownedBrand(sb, req, brandId);
      if (check.error) return res.status(check.status).json({ error: check.error });

      const token = await metaToken(sb, brandId);
      if (!token) return res.status(409).json({ error: 'Connect Meta first.' });

      const accounts = await listAdAccounts(token);
      const { data: brand } = await sb
        .from('brands')
        .select('meta_ad_account_id')
        .eq('id', brandId)
        .maybeSingle();

      return res.status(200).json({
        accounts,
        selected: (brand?.meta_ad_account_id as string | null) ?? null,
      });
    }

    if (req.method === 'POST') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
      const brandId = typeof body.brandId === 'string' ? body.brandId : '';
      const adAccountId = typeof body.adAccountId === 'string' ? body.adAccountId : '';

      const check = await ownedBrand(sb, req, brandId);
      if (check.error) return res.status(check.status).json({ error: check.error });

      const token = await metaToken(sb, brandId);
      if (!token) return res.status(409).json({ error: 'Connect Meta first.' });

      // Only an account this token actually has, so a crafted request cannot
      // point a brand at somebody else's ad account.
      const accounts = await listAdAccounts(token);
      const chosen = accounts.find((a) => a.id === adAccountId || a.accountId === adAccountId);
      if (!chosen) return res.status(400).json({ error: 'That ad account is not on your Meta account.' });

      const { error } = await sb
        .from('brands')
        .update({ meta_ad_account_id: chosen.id })
        .eq('id', brandId);

      if (error) return res.status(500).json({ error: 'Could not save that ad account.' });

      await sb
        .from('brand_connections')
        .update({ external_id: chosen.id, display_name: chosen.name, status: 'active', last_error: null })
        .eq('brand_id', brandId)
        .eq('provider', 'meta');

      return res.status(200).json({ selected: chosen.id, name: chosen.name });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (e instanceof MetaError) {
      console.error('[kyro] meta/accounts graph error', e.code, e.message);
      // Meta's own wording is the useful part here: it says whether the token
      // expired, or the permission was never granted.
      return res.status(e.retryable ? 503 : 400).json({ error: `Meta said: ${e.message}` });
    }
    console.error('[kyro] meta/accounts failed', e);
    return res.status(500).json({ error: 'Could not read your Meta ad accounts.' });
  }
}
