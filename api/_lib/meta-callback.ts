/**
 * GET /api/meta/callback
 *
 * Where Meta returns the brand after they approve KYRO.
 *
 * Trades the code for a long-lived token, stores it encrypted in the
 * service-role-only credentials table, and records a visible connection row.
 * The ad account is NOT chosen here: a person may administer several, and
 * guessing which one a brand advertises from is the kind of mistake that
 * spends someone else's budget. The app asks them next.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from './supabase.js';
import { seal, verifyState } from './crypto.js';
import { appOrigin } from './env.js';
import { exchangeCode, fetchMe, longLivedToken } from './meta.js';

function back(res: VercelResponse, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  res.setHeader('Location', `${appOrigin()}/?${qs}`);
  return res.status(302).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query as Record<string, string | string[] | undefined>;
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

  // The brand declined on Meta's screen, which is not an error.
  if (str(query.error)) {
    return back(res, { meta: 'error', reason: 'declined' });
  }

  try {
    const state = verifyState(str(query.state) ?? '');
    if (!state?.brandId) return back(res, { meta: 'error', reason: 'expired' });

    const code = str(query.code);
    if (!code) return back(res, { meta: 'error', reason: 'incomplete' });

    const short = await exchangeCode(code);
    const long = await longLivedToken(short.accessToken);
    const me = await fetchMe(long.accessToken);

    const sealed = seal(long.accessToken);
    const sb = serviceClient();

    const { error: credError } = await sb.from('platform_credentials').upsert(
      {
        brand_id: state.brandId,
        provider: 'meta',
        external_id: me.id,
        access_token_ct: sealed.ct,
        access_token_iv: sealed.iv,
        access_token_tag: sealed.tag,
        scopes: [],
        expires_at: long.expiresIn ? new Date(Date.now() + long.expiresIn * 1000).toISOString() : null,
        rotated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,provider' }
    );

    if (credError) {
      console.error('[kyro] meta/callback could not store credential', credError);
      return back(res, { meta: 'error', reason: 'storage' });
    }

    const { error: connError } = await sb.from('brand_connections').upsert(
      {
        brand_id: state.brandId,
        provider: 'meta',
        external_id: me.id,
        display_name: me.name || 'Meta account',
        // Connected. Not yet usable: the brand still has to pick which ad
        // account KYRO publishes to, which brands.meta_ad_account_id records.
        status: 'active',
        scopes: [],
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error: null,
      },
      { onConflict: 'brand_id,provider' }
    );

    if (connError) console.error('[kyro] meta/callback could not update brand_connections', connError);

    return back(res, { meta: 'choose-account' });
  } catch (e) {
    console.error('[kyro] meta/callback failed', e);
    return back(res, { meta: 'error', reason: 'unexpected' });
  }
}
