/**
 * GET /api/shopify/callback
 *
 * Where Shopify sends the merchant after they approve the install. This is the
 * only moment Shopify hands us anything: a one-time `code` which we trade,
 * together with the app secret, for a durable access token for that store.
 *
 * Order of checks matters. The HMAC is verified before anything else is
 * trusted, because every other parameter in this request is attacker-supplied
 * until that signature proves otherwise.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { seal, signClaim, verifyState } from '../_lib/crypto.js';
import { exchangeCodeForToken, normalizeShopDomain, verifyOAuthHmac } from '../_lib/shopify.js';
import { appOrigin } from '../_lib/env.js';
import { subscribeWebhooks } from '../_lib/shopify-admin.js';

/** Send the merchant back into the app with a readable outcome. */
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

  try {
    const query = req.query as Record<string, string | string[] | undefined>;

    // 1. Signature first. Nothing below is trustworthy without it.
    if (!verifyOAuthHmac(query)) {
      console.warn('[kyro] shopify/callback rejected: bad HMAC');
      return back(res, { shopify: 'error', reason: 'signature' });
    }

    const shop = normalizeShopDomain(typeof query.shop === 'string' ? query.shop : undefined);
    const code = typeof query.code === 'string' ? query.code : '';
    const rawState = typeof query.state === 'string' ? query.state : '';

    if (!shop || !code) return back(res, { shopify: 'error', reason: 'incomplete' });

    // 2. Our own signed state tells us which brand began this flow.
    const state = verifyState(rawState);
    if (!state) return back(res, { shopify: 'error', reason: 'expired' });

    // The shop that came back must be the shop the flow started for.
    if (state.shop && state.shop !== shop) {
      console.warn('[kyro] shopify/callback rejected: shop mismatch');
      return back(res, { shopify: 'error', reason: 'mismatch' });
    }

    // 3. Trade the code. This is the step that needs the client secret.
    const token = await exchangeCodeForToken(shop, code);
    const sealed = seal(token.access_token);
    const scopes = (token.scope || '').split(',').map((s) => s.trim()).filter(Boolean);

    const sb = serviceClient();

    // 3b. Which brand is this for?
    //   · Started from KYRO: the brand in the signed state.
    //   · Started from Shopify (App Store install, or opening KYRO from the
    //     Shopify admin): the brand that already owns this store, if any.
    //     If none, the merchant has no KYRO account yet. The token is parked
    //     and they go on to sign up, which is the order review requires.
    let brandId = state.brandId;
    if (state.launch) {
      const { data: owner } = await sb
        .from('brand_connections')
        .select('brand_id')
        .eq('provider', 'shopify')
        .eq('external_id', shop)
        .eq('status', 'active')
        .maybeSingle();
      brandId = (owner?.brand_id as string | undefined) ?? '';
    }

    if (!brandId) {
      const pending: Record<string, unknown> = {
        shop,
        access_token_ct: sealed.ct,
        access_token_iv: sealed.iv,
        access_token_tag: sealed.tag,
        scopes,
        expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        refresh_token_ct: null,
        refresh_token_iv: null,
        refresh_token_tag: null,
        refresh_token_expires_at: null,
        created_at: new Date().toISOString(),
      };
      if (token.refresh_token) {
        const refresh = seal(token.refresh_token);
        pending.refresh_token_ct = refresh.ct;
        pending.refresh_token_iv = refresh.iv;
        pending.refresh_token_tag = refresh.tag;
        if (token.refresh_token_expires_in) {
          pending.refresh_token_expires_at = new Date(
            Date.now() + token.refresh_token_expires_in * 1000
          ).toISOString();
        }
      }
      const { error: pendingError } = await sb
        .from('shopify_pending_installs')
        .upsert(pending, { onConflict: 'shop' });
      if (pendingError) {
        console.error('[kyro] could not park shopify install', pendingError);
        return back(res, { shopify: 'error', reason: 'storage' });
      }
      return back(res, { shopify: 'installed', shop, claim: signClaim(shop) });
    }

    // 4. Store the token in the service-role-only table.
    const credential: Record<string, unknown> = {
      brand_id: brandId,
      provider: 'shopify',
      external_id: shop,
      access_token_ct: sealed.ct,
      access_token_iv: sealed.iv,
      access_token_tag: sealed.tag,
      scopes,
      rotated_at: new Date().toISOString(),
    };
    if (token.expires_in) {
      credential.expires_at = new Date(Date.now() + token.expires_in * 1000).toISOString();
    }
    if (token.refresh_token) {
      const refresh = seal(token.refresh_token);
      credential.refresh_token_ct = refresh.ct;
      credential.refresh_token_iv = refresh.iv;
      credential.refresh_token_tag = refresh.tag;
      // The refresh token's own deadline (90 days). Past it there is no
      // automatic recovery and the merchant has to reconnect, so it is worth
      // knowing before orders quietly stop arriving.
      if (token.refresh_token_expires_in) {
        credential.refresh_token_expires_at = new Date(
          Date.now() + token.refresh_token_expires_in * 1000
        ).toISOString();
      }
    }

    const { error: credError } = await sb
      .from('platform_credentials')
      .upsert(credential, { onConflict: 'brand_id,provider' });

    if (credError) {
      console.error('[kyro] could not store shopify credential', credError);
      return back(res, { shopify: 'error', reason: 'storage' });
    }

    // 5. Mark the connection visible to the brand. No token here: this row is
    //    readable by the brand owner, the credentials table is not.
    const { error: connError } = await sb.from('brand_connections').upsert(
      {
        brand_id: brandId,
        provider: 'shopify',
        external_id: shop,
        display_name: shop.replace('.myshopify.com', ''),
        status: 'active',
        scopes,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error: null,
      },
      { onConflict: 'brand_id,provider' }
    );

    if (connError) console.error('[kyro] could not update brand_connections', connError);

    // 6. Subscribe the store to the topics the receiver expects. Without this
    //    the app installs cleanly and then silently never sees an order.
    //    Best effort: a subscription failure must not break the merchant's
    //    install, so it is logged and the flow completes either way.
    try {
      const outcomes = await subscribeWebhooks(
        shop,
        token.access_token,
        `${appOrigin()}/api/shopify/webhooks`
      );
      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length) {
        console.error('[kyro] webhook subscriptions failed', failed);
        await sb
          .from('brand_connections')
          .update({ last_error: `webhooks: ${failed.map((f) => f.topic).join(',')}` })
          .eq('brand_id', brandId)
          .eq('provider', 'shopify');
      }
    } catch (e) {
      console.error('[kyro] webhook subscription step threw', e);
    }

    return back(res, { shopify: 'connected', shop });
  } catch (e) {
    console.error('[kyro] shopify/callback failed', e);
    return back(res, { shopify: 'error', reason: 'unexpected' });
  }
}
