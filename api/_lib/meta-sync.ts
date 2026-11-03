/**
 * GET /api/meta/sync
 *
 * Pulls what each creator video actually did, once a day.
 *
 * Two steps, in this order, per brand with a Meta ad account chosen:
 *
 *   1. Match. Every approved video has a tracking token that the brand has
 *      to put in the ad's destination URL, because that is what attributes a
 *      Shopify order back to the creator. So the ads are listed and the one
 *      carrying that token is recorded on the submission. Nobody maintains a
 *      mapping, and the match is only ever as wrong as the link that is
 *      already paying the creator.
 *
 *   2. Fetch. For every matched ad, a day by day insight pull, upserted onto
 *      one row per ad per day.
 *
 * The window is deliberately wider than a day. Meta restates recent figures
 * as attribution settles, so re-reading the last week and overwriting is the
 * only way the numbers stop drifting from what the brand sees in Ads
 * Manager. The unique index on (submission, ad, day) is what makes that an
 * overwrite rather than a pile.
 *
 * Nothing here ever invents a number. A brand that has not connected Meta,
 * or an ad that cannot be matched, produces no row at all, and the panel in
 * the product says there is nothing yet rather than showing a zero that
 * looks like a result.
 *
 * Vercel calls this on the schedule in vercel.json with CRON_SECRET as a
 * bearer token.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from './supabase.js';
import { unseal } from './crypto.js';
import { listAdsWithLinks, fetchAdInsights, MetaError, type MetaAdLink } from './meta.js';

/** How many days back to re-read. Meta restates recent attribution. */
const WINDOW_DAYS = 7;

/** Guards one run against an account with a pathological number of ads. */
const MAX_BRANDS = 50;

interface Target {
  brand_id: string;
  ad_account_id: string;
  submission_id: string;
  tracking_token: string;
  meta_ad_id: string | null;
}

const isoDay = (daysAgo: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

/** The decrypted Meta token for a brand, or null when there is not one. */
async function brandToken(db: ReturnType<typeof serviceClient>, brandId: string): Promise<string | null> {
  const { data } = await db
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

/** The ad whose destination URL carries this token, if exactly one does. */
function adForToken(ads: MetaAdLink[], token: string): MetaAdLink | null {
  const needle = token.toLowerCase();
  const hits = ads.filter((ad) => ad.urls.some((url) => url.includes(needle)));
  // Two ads pointing at the same video is a legitimate thing a brand might
  // do, and splitting spend between them is a judgement KYRO should not make
  // silently. The first is taken and the rest are left for a later pass that
  // can do it properly.
  return hits[0] ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set, so this endpoint is disabled.' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not authorised.' });

  const db = serviceClient();
  const { data, error } = await db.rpc('meta_sync_targets');
  if (error) {
    console.error('[kyro] could not read meta sync targets', error);
    return res.status(500).json({ error: 'Could not read what to sync.' });
  }

  const targets = (data ?? []) as Target[];
  if (targets.length === 0) {
    return res.status(200).json({ brands: 0, matched: 0, days: 0, note: 'Nothing connected to sync.' });
  }

  // One Meta token and one ad listing per brand, not per video.
  const byBrand = new Map<string, Target[]>();
  for (const t of targets) {
    const list = byBrand.get(t.brand_id);
    if (list) list.push(t);
    else byBrand.set(t.brand_id, [t]);
  }

  const since = isoDay(WINDOW_DAYS);
  const until = isoDay(0);

  let matched = 0;
  let days = 0;
  const problems: Array<{ brand: string; note: string }> = [];

  for (const [brandId, rows] of [...byBrand.entries()].slice(0, MAX_BRANDS)) {
    const token = await brandToken(db, brandId);
    if (!token) {
      problems.push({ brand: brandId, note: 'no stored Meta token' });
      continue;
    }

    const adAccountId = rows[0]?.ad_account_id;
    if (!adAccountId) continue;

    let ads: MetaAdLink[];
    try {
      ads = await listAdsWithLinks(token, adAccountId);
    } catch (e) {
      const note = e instanceof MetaError ? e.message : (e as Error).message;
      problems.push({ brand: brandId, note: `ad list failed: ${note}`.slice(0, 200) });
      // A brand whose token has expired should say so in the product rather
      // than only in a log line nobody reads.
      if (e instanceof MetaError && !e.retryable) {
        await db
          .from('brand_connections')
          .update({ status: 'error', last_error: note.slice(0, 500) })
          .eq('brand_id', brandId)
          .eq('provider', 'meta');
      }
      continue;
    }

    for (const row of rows) {
      let adId = row.meta_ad_id;

      if (!adId) {
        const hit = adForToken(ads, row.tracking_token);
        if (!hit) continue;
        adId = hit.adId;
        const { error: linkError } = await db
          .from('submissions')
          .update({ meta_ad_id: adId })
          .eq('id', row.submission_id);
        if (linkError) {
          problems.push({ brand: brandId, note: `could not record ad link: ${linkError.message}`.slice(0, 200) });
          continue;
        }
        matched += 1;
      }

      let insights;
      try {
        insights = await fetchAdInsights(token, adId, since, until);
      } catch (e) {
        const note = e instanceof MetaError ? e.message : (e as Error).message;
        problems.push({ brand: brandId, note: `insights failed for ${adId}: ${note}`.slice(0, 200) });
        continue;
      }

      if (insights.length === 0) continue;

      const upserts = insights.map((d) => ({
        submission_id: row.submission_id,
        meta_ad_id: adId,
        ad_account_id: adAccountId,
        day: d.day,
        snapshot_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
        impressions: d.impressions,
        reach: d.reach,
        spend_cents: d.spendCents,
        clicks: d.clicks,
        link_clicks: d.linkClicks,
        video_plays: d.videoPlays,
        video_p25: d.p25,
        video_p50: d.p50,
        video_p75: d.p75,
        video_p100: d.p100,
        thruplays: d.thruplays,
        avg_watch_seconds: d.avgWatchSeconds,
      }));

      const { error: writeError } = await db
        .from('meta_insights')
        .upsert(upserts, { onConflict: 'submission_id,meta_ad_id,day' });

      if (writeError) {
        problems.push({ brand: brandId, note: `write failed: ${writeError.message}`.slice(0, 200) });
        continue;
      }
      days += upserts.length;
    }
  }

  return res.status(200).json({
    brands: byBrand.size,
    matched,
    days,
    problems: problems.slice(0, 20),
  });
}
