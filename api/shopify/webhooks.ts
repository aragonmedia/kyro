/**
 * KYRO — Shopify webhook receiver
 *
 * One endpoint, every topic. Shopify posts here; nothing else may.
 *
 * Order of operations is deliberate and must not be rearranged:
 *
 *   1. Read the RAW body. Parsing first destroys the bytes the HMAC covers.
 *   2. Verify the HMAC. Before looking at any header, any topic, any field.
 *      An unverified request is not a Shopify request and gets 401.
 *   3. Claim the delivery in `webhook_events`. Shopify sends duplicates and
 *      retries; a unique index on (provider, external_id) makes replay safe.
 *   4. Resolve the shop to a brand.
 *   5. Handle the topic.
 *
 * Response contract: Shopify wants a 2xx within 5 seconds and retries up to
 * 8 times over ~48h on anything else. So we return 200 for anything we have
 * durably recorded, and non-200 ONLY when a retry might actually succeed.
 * Returning 500 for a permanent failure just burns 8 retries and then drops
 * the event; returning 200 for a transient one loses it immediately.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import {
  normalizeShopDomain,
  readRawBody,
  verifyWebhookHmac,
  moneyToCents,
} from '../_lib/shopify.js';
import { requireStoreToken, TokenUnavailable } from '../_lib/shopify-token.js';
import {
  fetchOrderJourney,
  trackingTokenFromVisit,
  ShopifyAdminError,
  type CustomerVisit,
} from '../_lib/shopify-admin.js';

/** Required. Vercel would otherwise consume the stream and break the HMAC. */
export const config = { api: { bodyParser: false } };

type Json = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : v == null ? null : String(v);

/* ─────────────────────────────────────────────────────────────
   Order mapping
   ───────────────────────────────────────────────────────────── */

/**
 * Sum the product value actually refunded.
 *
 * Deliberately reads `refund_line_items`, not `total_refunded`. The latter
 * includes refunded shipping and tax, which are not commissionable, so using
 * it would claw back more from a creator than the brand actually lost on
 * product.
 */
function refundedProductCents(payload: Json): number {
  const refunds = Array.isArray(payload.refunds) ? payload.refunds : [];
  let cents = 0;
  for (const refund of refunds) {
    const items = (refund as Json)?.refund_line_items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      cents += moneyToCents((item as Json)?.subtotal);
    }
  }
  return cents;
}

function orderStatus(payload: Json, refunded: number, commissionable: number): string {
  if (payload.cancelled_at) return 'cancelled';
  if (refunded > 0) return refunded >= commissionable + refunded ? 'refunded' : 'partially_refunded';
  if (payload.fulfillment_status === 'fulfilled') return 'fulfilled';
  return 'placed';
}

function mapOrder(brandId: string, payload: Json) {
  // Pre-discount product value. `subtotal_price` is already net of discounts,
  // so it is the wrong field for a column documented as pre-discount.
  const lineItems = moneyToCents(payload.total_line_items_price);
  const discounts = moneyToCents(payload.total_discounts);
  const refunded = refundedProductCents(payload);

  // The one definition used everywhere: product subtotal, after discounts,
  // excluding shipping and tax, net of refunds. Never bill on total.
  const commissionable = Math.max(0, lineItems - discounts - refunded);

  const shipping = moneyToCents(
    ((payload.total_shipping_price_set as Json)?.shop_money as Json)?.amount ??
      payload.total_shipping_price
  );

  const fulfilled = payload.fulfillment_status === 'fulfilled';

  return {
    brand_id: brandId,
    external_id: String(payload.id),
    external_number: str(payload.name) ?? str(payload.order_number),
    currency: str(payload.currency) ?? 'USD',
    subtotal_cents: lineItems,
    discount_cents: discounts,
    shipping_cents: shipping,
    tax_cents: moneyToCents(payload.total_tax),
    total_cents: moneyToCents(payload.current_total_price ?? payload.total_price),
    refunded_cents: refunded,
    commissionable_cents: commissionable,
    status: orderStatus(payload, refunded, commissionable),
    placed_at: str(payload.created_at) ?? new Date().toISOString(),
    fulfilled_at: fulfilled ? str(payload.updated_at) : null,
    cancelled_at: str(payload.cancelled_at),
    last_refund_at: refunded > 0 ? str(payload.updated_at) : null,
  };
}

/* ─────────────────────────────────────────────────────────────
   Attribution
   ───────────────────────────────────────────────────────────── */

/**
 * Ask the store how this customer arrived and, if a KYRO tracking token is in
 * the journey, record which submission earned the order.
 *
 * Last touch wins, first touch is the fallback. That matches how the campaign
 * agreement describes attribution and how brands read their own Shopify
 * reports, so the numbers reconcile.
 *
 * Failure here never fails the webhook. An order that cannot be attributed is
 * still a real order and must be recorded; `journey_checked_at` and
 * `attribution_note` say what happened so it can be revisited.
 */
async function attribute(
  db: ReturnType<typeof serviceClient>,
  brandId: string,
  shop: string,
  orderRowId: string,
  shopifyOrderId: string,
  commissionableCents: number
): Promise<{ note: string; retryable: boolean }> {
  // Never unseal the credential directly. Shopify access tokens now live one
  // hour, and a webhook can arrive at any point after that, so the token has
  // to be refreshed on the way out.
  let token: string;
  try {
    token = await requireStoreToken(db, brandId, shop);
  } catch (err) {
    if (err instanceof TokenUnavailable) {
      // needsReconnect means no number of retries will help: the merchant has
      // to reauthorise. Surface it on the connection so it is visible in the
      // app rather than only in a log line.
      if (err.needsReconnect) {
        await db
          .from('brand_connections')
          .update({ status: 'error', last_error: err.message.slice(0, 500) })
          .eq('brand_id', brandId)
          .eq('provider', 'shopify');
      }
      return { note: err.message.slice(0, 500), retryable: !err.needsReconnect };
    }
    return { note: `token lookup failed: ${(err as Error).message}`.slice(0, 500), retryable: true };
  }

  let visits: Array<CustomerVisit | null | undefined>;
  try {
    const journey = await fetchOrderJourney(shop, token, shopifyOrderId);
    if (!journey) return { note: 'no customer journey on this order', retryable: false };
    visits = [journey.lastVisit, journey.firstVisit];
  } catch (err) {
    const retryable = err instanceof ShopifyAdminError ? err.retryable : true;
    return { note: `journey lookup failed: ${(err as Error).message}`.slice(0, 500), retryable };
  }

  let token_ = null as string | null;
  let matched: CustomerVisit | null = null;
  for (const visit of visits) {
    const t = trackingTokenFromVisit(visit);
    if (t) {
      token_ = t;
      matched = visit ?? null;
      break;
    }
  }

  const utm = matched?.utmParameters ?? null;
  await db
    .from('orders')
    .update({
      utm_source: utm?.source ?? null,
      utm_medium: utm?.medium ?? null,
      utm_campaign: utm?.campaign ?? null,
      utm_content: utm?.content ?? null,
      utm_term: utm?.term ?? null,
      journey_checked_at: new Date().toISOString(),
    })
    .eq('id', orderRowId);

  if (!token_) return { note: 'journey carried no KYRO tracking token', retryable: false };

  const sub = await db
    .from('submissions')
    .select('id, campaign_id, creator_id, brand_id, meta_ad_id')
    .eq('tracking_token', token_)
    .maybeSingle();

  if (sub.error || !sub.data) return { note: `tracking token ${token_} matched no submission`, retryable: false };

  // A token from another brand's campaign landing on this store means either
  // a copied ad URL or a bug. Either way it is not this brand's to pay.
  if (sub.data.brand_id && sub.data.brand_id !== brandId) {
    return { note: `tracking token ${token_} belongs to a different brand`, retryable: false };
  }

  const ins = await db.from('order_attributions').upsert(
    {
      order_id: orderRowId,
      submission_id: sub.data.id,
      campaign_id: sub.data.campaign_id,
      creator_id: sub.data.creator_id,
      method: 'utm',
      meta_ad_id: sub.data.meta_ad_id ?? null,
      weight: 1,
      commissionable_cents: commissionableCents,
    },
    { onConflict: 'order_id,submission_id' }
  );

  if (ins.error) return { note: `attribution insert failed: ${ins.error.message}`, retryable: true };
  return { note: `attributed to submission ${sub.data.id} via ${token_}`, retryable: false };
}

/* ─────────────────────────────────────────────────────────────
   Topic handlers
   ───────────────────────────────────────────────────────────── */

async function handleOrder(
  db: ReturnType<typeof serviceClient>,
  brandId: string,
  shop: string,
  payload: Json
): Promise<{ retryable: boolean }> {
  const row = mapOrder(brandId, payload);

  const saved = await db
    .from('orders')
    .upsert(row, { onConflict: 'brand_id,external_id' })
    .select('id, journey_checked_at')
    .single();

  if (saved.error || !saved.data) {
    throw new Error(`order upsert failed: ${saved.error?.message ?? 'no row returned'}`);
  }

  // Attribution is decided once, on the first sighting. Re-running it on every
  // orders/updated would let a later journey re-point an order at a different
  // creator after the first one was already told they earned it.
  if (saved.data.journey_checked_at) {
    await db
      .from('order_attributions')
      .update({ commissionable_cents: row.commissionable_cents })
      .eq('order_id', saved.data.id);
    return { retryable: false };
  }

  const result = await attribute(
    db,
    brandId,
    shop,
    saved.data.id as string,
    String(payload.id),
    row.commissionable_cents
  );

  await db.from('orders').update({ attribution_note: result.note }).eq('id', saved.data.id);
  return { retryable: result.retryable };
}

async function handleUninstall(
  db: ReturnType<typeof serviceClient>,
  brandId: string
): Promise<void> {
  // The token is dead the moment the merchant uninstalls. Keeping it would be
  // holding a credential we are no longer entitled to.
  await db.from('platform_credentials').delete().eq('brand_id', brandId).eq('provider', 'shopify');
  await db
    .from('brand_connections')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('brand_id', brandId)
    .eq('provider', 'shopify');
}

/**
 * shop/redact — Shopify asks us to erase a shop's data, 48h after uninstall.
 *
 * Orders are cascaded away with the connection. Attributions and earnings
 * survive only where a creator is owed money for them, which is a legal
 * obligation to retain, and they carry no customer data by design.
 */
async function handleShopRedact(
  db: ReturnType<typeof serviceClient>,
  brandId: string
): Promise<void> {
  await db.from('platform_credentials').delete().eq('brand_id', brandId).eq('provider', 'shopify');
  await db
    .from('orders')
    .update({
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      customer_email_hash: null,
      attribution_note: 'redacted at shop request',
    })
    .eq('brand_id', brandId);
}

/* ─────────────────────────────────────────────────────────────
   Entry point
   ───────────────────────────────────────────────────────────── */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Raw bytes, before anything touches them.
  let raw: Buffer;
  try {
    raw = await readRawBody(req as unknown as AsyncIterable<Buffer | string>);
  } catch {
    return res.status(400).json({ error: 'Unreadable body' });
  }

  // 2. Signature. Nothing below this line may run for an unsigned request.
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!verifyWebhookHmac(raw, typeof hmac === 'string' ? hmac : undefined)) {
    return res.status(401).json({ error: 'Invalid HMAC' });
  }

  const topic = String(req.headers['x-shopify-topic'] ?? '');
  const deliveryId = String(req.headers['x-shopify-webhook-id'] ?? '');
  const shop = normalizeShopDomain(
    typeof req.headers['x-shopify-shop-domain'] === 'string'
      ? req.headers['x-shopify-shop-domain']
      : undefined
  );

  if (!topic || !deliveryId || !shop) {
    return res.status(400).json({ error: 'Missing Shopify headers' });
  }

  let payload: Json;
  try {
    payload = JSON.parse(raw.toString('utf8')) as Json;
  } catch {
    return res.status(400).json({ error: 'Malformed JSON' });
  }

  const db = serviceClient();

  // 3. Claim the delivery. A duplicate id means Shopify is retrying or
  //    double-sending; if we already finished it, say so and stop.
  const claim = await db
    .from('webhook_events')
    .upsert(
      { provider: 'shopify', external_id: deliveryId, topic, shop_domain: shop },
      { onConflict: 'provider,external_id', ignoreDuplicates: false }
    )
    .select('id, processed_at, attempts')
    .single();

  if (claim.error || !claim.data) {
    // Could not even record it. Ask Shopify to try again.
    return res.status(503).json({ error: 'Could not record delivery' });
  }
  if (claim.data.processed_at) {
    return res.status(200).json({ ok: true, duplicate: true });
  }
  const eventId = claim.data.id as string;
  await db
    .from('webhook_events')
    .update({ attempts: ((claim.data.attempts as number) ?? 0) + 1 })
    .eq('id', eventId);

  const finish = async (error: string | null) => {
    await db
      .from('webhook_events')
      .update({ processed_at: error ? null : new Date().toISOString(), error })
      .eq('id', eventId);
  };

  // 4. Which brand is this store?
  const conn = await db
    .from('brand_connections')
    .select('brand_id')
    .eq('provider', 'shopify')
    .eq('external_id', shop)
    .maybeSingle();

  const brandId = (conn.data?.brand_id as string | undefined) ?? null;

  if (brandId) {
    await db.from('webhook_events').update({ brand_id: brandId }).eq('id', eventId);
  }

  // Compliance topics must return 200 even for a shop we have never seen.
  // Shopify sends them to verify the endpoint exists and answers.
  const compliance = topic === 'customers/data_request' || topic === 'customers/redact' || topic === 'shop/redact';

  if (!brandId && !compliance) {
    await finish(`no brand connected for ${shop}`);
    // Not retryable: a later delivery will find the same missing connection.
    return res.status(200).json({ ok: true, ignored: 'unknown shop' });
  }

  try {
    switch (topic) {
      case 'orders/create':
      case 'orders/updated':
      case 'orders/cancelled':
      case 'orders/fulfilled':
      case 'refunds/create': {
        const order = (payload.order as Json) ?? payload;
        const result = await handleOrder(db, brandId as string, shop, order);
        if (result.retryable) {
          await finish('attribution lookup failed, retryable');
          return res.status(503).json({ ok: false, retry: true });
        }
        break;
      }

      case 'fulfillments/create':
      case 'fulfillments/update': {
        const orderId = str(payload.order_id);
        if (orderId && brandId) {
          await db
            .from('orders')
            .update({ status: 'fulfilled', fulfilled_at: str(payload.updated_at) ?? new Date().toISOString() })
            .eq('brand_id', brandId)
            .eq('external_id', orderId);
        }
        break;
      }

      case 'app/uninstalled':
        if (brandId) await handleUninstall(db, brandId);
        break;

      // KYRO stores no customer name, email, phone or address. There is
      // nothing to hand over and nothing to erase for an individual customer.
      // Both still have to answer 200 or the app fails review.
      case 'customers/data_request':
      case 'customers/redact':
        break;

      case 'shop/redact':
        if (brandId) await handleShopRedact(db, brandId);
        break;

      default:
        await finish(null);
        return res.status(200).json({ ok: true, ignored: topic });
    }

    await finish(null);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = (err as Error).message ?? 'unknown error';
    await finish(message.slice(0, 500));
    // Unknown failure: let Shopify retry. It has 8 attempts over ~48h.
    return res.status(503).json({ ok: false, retry: true });
  }
}
