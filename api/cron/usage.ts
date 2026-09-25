/**
 * GET /api/cron/usage
 *
 * Reports KYRO's fee to Shopify, once a day.
 *
 * Only brands that arrived through the App Store are billed this way, and
 * only on sales that have cleared their return window. A sale inside the
 * brand's 30-day trial carries platform_fee_cents = 0 (migration 0022), so
 * the filter on a fee above zero is also what enforces the trial.
 *
 * Every earning is reported once. `usage_reported_at` is written the moment
 * an event is accepted, and the idempotency key is the earning's own id, so
 * neither a retry nor an overlapping run can charge the same sale twice.
 *
 * Vercel calls this on the schedule in vercel.json with CRON_SECRET as a
 * bearer token. Set that variable, or the endpoint refuses everyone.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { requireStoreToken } from '../_lib/shopify-token.js';
import { fetchShopGid } from '../_lib/shopify-admin.js';
import { reportUsage, USAGE_METER } from '../_lib/shopify-usage.js';

/** Sales reported per run. Plenty at this size, and bounded on purpose. */
const BATCH = 200;

interface Row {
  id: string;
  brand_id: string;
  commissionable_cents: number;
  state_changed_at: string | null;
  available_at: string | null;
  created_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET is not set, so this endpoint is disabled.' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorised.' });
  }

  const db = serviceClient();
  const summary = { brands: 0, reported: 0, failed: 0, skipped: 0 };

  try {
    // 1. Brands Shopify bills: App Store origin with a live store connection.
    const { data: brands, error: brandError } = await db
      .from('brands')
      .select('id, shopify_shop_gid, brand_connections!inner(external_id, status, provider)')
      .eq('billing_origin', 'shopify_app_store')
      .eq('brand_connections.provider', 'shopify')
      .eq('brand_connections.status', 'active');

    if (brandError) {
      console.error('[kyro] usage: could not list brands', brandError);
      return res.status(500).json({ error: 'Could not list brands.' });
    }

    for (const b of (brands ?? []) as Array<Record<string, unknown>>) {
      const brandId = b.id as string;
      const connections = (b.brand_connections ?? []) as Array<{ external_id: string }>;
      const shop = (Array.isArray(connections) ? connections[0]?.external_id : undefined) ?? null;
      if (!shop) { summary.skipped += 1; continue; }

      // 2. Cleared sales with a fee, not yet reported.
      const { data: earnings, error: earningError } = await db
        .from('earnings')
        .select('id, brand_id, commissionable_cents, state_changed_at, available_at, created_at')
        .eq('brand_id', brandId)
        .in('state', ['available', 'paid'])
        .gt('platform_fee_cents', 0)
        .is('usage_reported_at', null)
        .order('created_at', { ascending: true })
        .limit(BATCH);

      if (earningError) {
        console.error('[kyro] usage: could not read earnings', earningError);
        summary.skipped += 1;
        continue;
      }
      const rows = (earnings ?? []) as unknown as Row[];
      if (rows.length === 0) continue;

      summary.brands += 1;

      let token: string;
      try {
        token = await requireStoreToken(db, brandId, shop);
      } catch (e) {
        console.error('[kyro] usage: no usable token', brandId, (e as Error).message);
        summary.skipped += rows.length;
        continue;
      }

      // 3. The store's Shopify id, cached after the first lookup.
      let shopGid = (b.shopify_shop_gid as string | null) ?? null;
      if (!shopGid) {
        try {
          shopGid = await fetchShopGid(shop, token);
        } catch (e) {
          console.error('[kyro] usage: shop id lookup failed', shop, (e as Error).message);
          summary.skipped += rows.length;
          continue;
        }
        if (!shopGid) { summary.skipped += rows.length; continue; }
        await db.from('brands').update({ shopify_shop_gid: shopGid }).eq('id', brandId);
      }

      for (const row of rows) {
        const valueUsd = row.commissionable_cents / 100;
        if (valueUsd <= 0) {
          // Nothing to charge, but mark it so it stops being picked up.
          await db.from('earnings').update({ usage_reported_at: new Date().toISOString() }).eq('id', row.id);
          continue;
        }

        // Shopify rejects events outside the current billing cycle, so a sale
        // that cleared long ago is reported as of now rather than lost.
        const cleared = Date.parse(row.state_changed_at ?? row.available_at ?? row.created_at);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const occurredAt = new Date(Number.isFinite(cleared) && cleared > thirtyDaysAgo ? cleared : Date.now());

        const result = await reportUsage(token, {
          shopGid,
          valueUsd,
          idempotencyKey: row.id,
          occurredAt,
        });

        await db.from('billing_usage_log').upsert(
          {
            brand_id: brandId,
            earning_id: row.id,
            shop,
            event_handle: USAGE_METER,
            value_usd: valueUsd,
            idempotency_key: row.id,
            status: result.status,
            error: result.error,
          },
          { onConflict: 'idempotency_key' }
        );

        if (result.error) {
          summary.failed += 1;
          // Left unreported on purpose: the next run tries again, and the
          // idempotency key stops a double charge if it actually landed.
          continue;
        }

        await db.from('earnings').update({ usage_reported_at: new Date().toISOString() }).eq('id', row.id);
        summary.reported += 1;
      }
    }

    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[kyro] usage run failed', e);
    return res.status(500).json({ error: 'Usage reporting failed.' });
  }
}
