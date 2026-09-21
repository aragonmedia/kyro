/**
 * POST /api/shopify/claim
 *
 * Attach a store installed from the Shopify App Store to the merchant's new
 * KYRO brand.
 *
 * The App Store install ran OAuth before the merchant had an account, so the
 * token was parked in shopify_pending_installs and the browser was handed a
 * signed claim. Now that they have signed up, this moves the token onto
 * their brand.
 *
 * Checks, in order:
 *   · the caller is signed in and owns the brand (same as /install)
 *   · the claim is genuine and recent
 *   · the store is not already attached to a different brand
 *   · a parked token for that store still exists
 *
 * Body:   { brandId: string, claim: string }
 * Header: Authorization: Bearer <supabase access token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { verifyClaim } from '../_lib/crypto.js';
import { appOrigin } from '../_lib/env.js';
import { subscribeWebhooks } from '../_lib/shopify-admin.js';
import { requireStoreToken } from '../_lib/shopify-token.js';

/**
 * A brand created after the install began found KYRO on the App Store, so it
 * can only be billed through Shopify (requirement 1.2.1). The margin covers
 * clock differences between Vercel and Postgres.
 */
const ORIGIN_MARGIN_MS = 5 * 60 * 1000;

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
    const claim = verifyClaim(typeof body.claim === 'string' ? body.claim : '');
    if (!brandId) return res.status(400).json({ error: 'Missing brandId.' });
    if (!claim) {
      return res.status(400).json({ error: 'That Shopify install has expired. Open KYRO from your Shopify admin to connect again.' });
    }
    const shop = claim.shop;

    const { data: brand, error: brandError } = await sb
      .from('brands')
      .select('id, owner_user_id, created_at')
      .eq('id', brandId)
      .maybeSingle();
    if (brandError) return res.status(500).json({ error: 'Could not verify the brand.' });
    if (!brand || brand.owner_user_id !== userId) {
      return res.status(403).json({ error: "That brand isn't yours." });
    }

    const { data: other } = await sb
      .from('brand_connections')
      .select('brand_id')
      .eq('provider', 'shopify')
      .eq('external_id', shop)
      .eq('status', 'active')
      .neq('brand_id', brandId)
      .maybeSingle();
    if (other) {
      return res.status(409).json({ error: `${shop} is already connected to another KYRO brand.` });
    }

    const { data: pending, error: pendingError } = await sb
      .from('shopify_pending_installs')
      .select('*')
      .eq('shop', shop)
      .maybeSingle();
    if (pendingError) return res.status(500).json({ error: 'Could not read the Shopify install.' });
    if (!pending) {
      return res.status(410).json({ error: 'That Shopify install is no longer waiting. Open KYRO from your Shopify admin to connect again.' });
    }

    // 1. Move the token onto the brand.
    const { error: credError } = await sb.from('platform_credentials').upsert(
      {
        brand_id: brandId,
        provider: 'shopify',
        external_id: shop,
        access_token_ct: pending.access_token_ct,
        access_token_iv: pending.access_token_iv,
        access_token_tag: pending.access_token_tag,
        refresh_token_ct: pending.refresh_token_ct,
        refresh_token_iv: pending.refresh_token_iv,
        refresh_token_tag: pending.refresh_token_tag,
        expires_at: pending.expires_at,
        refresh_token_expires_at: pending.refresh_token_expires_at,
        scopes: pending.scopes,
        rotated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,provider' }
    );
    if (credError) {
      console.error('[kyro] claim: could not store credential', credError);
      return res.status(500).json({ error: 'Could not save the Shopify connection.' });
    }

    const { error: connError } = await sb.from('brand_connections').upsert(
      {
        brand_id: brandId,
        provider: 'shopify',
        external_id: shop,
        display_name: shop.replace('.myshopify.com', ''),
        status: 'active',
        scopes: pending.scopes,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        last_error: null,
      },
      { onConflict: 'brand_id,provider' }
    );
    if (connError) console.error('[kyro] claim: could not update brand_connections', connError);

    // 2. Billing origin. A brand that did not exist before the install
    //    discovered KYRO on Shopify, so KYRO takes no off-platform fee from it.
    const brandCreated = Date.parse(brand.created_at as string);
    const installStarted = Date.parse(pending.created_at as string);
    if (Number.isFinite(brandCreated) && Number.isFinite(installStarted) && brandCreated >= installStarted - ORIGIN_MARGIN_MS) {
      const { error: billingError } = await sb.rpc('apply_app_store_billing', { p_brand_id: brandId });
      if (billingError) console.error('[kyro] claim: could not apply app store billing', billingError);
    }

    // 3. The parked token has a home now.
    await sb.from('shopify_pending_installs').delete().eq('shop', shop);

    // 4. Subscribe order webhooks. Best effort, as in the callback. The token
    //    may be over an hour old by now, so go through the refreshing reader.
    try {
      const accessToken = await requireStoreToken(sb, brandId, shop);
      const outcomes = await subscribeWebhooks(shop, accessToken, `${appOrigin()}/api/shopify/webhooks`);
      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length) {
        console.error('[kyro] claim: webhook subscriptions failed', failed);
        await sb
          .from('brand_connections')
          .update({ last_error: `webhooks: ${failed.map((f) => f.topic).join(',')}` })
          .eq('brand_id', brandId)
          .eq('provider', 'shopify');
      }
    } catch (e) {
      console.error('[kyro] claim: webhook subscription step threw', e);
    }

    return res.status(200).json({ shop });
  } catch (e) {
    console.error('[kyro] shopify/claim failed', e);
    return res.status(500).json({ error: 'Could not finish connecting Shopify.' });
  }
}
