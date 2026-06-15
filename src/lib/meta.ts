/**
 * Kyro — Meta Marketing API Client
 *
 * Server-side functions that wrap Meta's Graph API. These should never be
 * called from the browser directly — the Meta App Secret would leak. Instead,
 * the React app calls /api/meta/* (Vercel serverless), which calls these.
 *
 * Status: STUBS. Each function returns mocked data and logs intent. Replace
 * with real fetch() calls to Meta when:
 *   - VITE_META_APP_ID is set
 *   - META_APP_SECRET is set (server-only, in Vercel env)
 *   - VITE_META_GRAPH_API_VERSION is set (e.g. "v20.0")
 *   - The brand has connected their Meta Ad Account via OAuth
 *
 * Architecture references in:
 *   - Kyro_Founding_Pillars.md → Pillar 3 (Tracking & Performance)
 *   - kyro-payment-handoff.md (Meta is tracking ONLY; never money rail)
 *
 * Attribution model: 1 video = 1 distinct Meta ad/creative.
 * Earnings = sum(spend × commission_rate) per submission, polled every 15 min.
 */

import type { MetaInsightsSnapshot, Cents } from './types';

const GRAPH_API_VERSION = import.meta.env.VITE_META_GRAPH_API_VERSION || 'v20.0';

interface MetaCredentials {
  /** Long-lived Page or User access token (from OAuth) */
  accessToken: string;
  /** Brand's Meta Ad Account ID, format act_XXXXXXXXXX */
  adAccountId: string;
}

/**
 * Push a creator's approved video to Meta as a new ad creative + ad.
 *
 * V1 implementation will:
 *   1. POST /act_XXX/advideos with the video URL → returns video_id
 *   2. POST /act_XXX/adcreatives with video_id + brand asset spec → returns creative_id
 *   3. POST /act_XXX/ads with creative_id + ad_set_id → returns ad_id
 *   4. Return ad_id + creative_id to be persisted on the submission row
 */
export async function pushSubmissionToMeta(
  _credentials: MetaCredentials,
  submission: { id: string; videoUrl: string; campaignName: string }
): Promise<{ adId: string; creativeId: string }> {
  console.log('[meta:stub] pushSubmissionToMeta', submission);
  // Simulated network delay
  await new Promise((r) => setTimeout(r, 600));
  return {
    adId: `act_demo_${submission.id}`,
    creativeId: `creative_demo_${submission.id}`,
  };
}

/**
 * Fetch the latest performance snapshot for a single ad.
 * Scheduled job calls this every 15 min per live ad and writes results to
 * meta_insights_snapshots table.
 *
 * V1 endpoint:
 *   GET /{ad_id}/insights?fields=impressions,clicks,spend,actions,
 *       action_values,date_start,date_stop&date_preset=lifetime
 */
export async function fetchAdInsights(
  _credentials: MetaCredentials,
  metaAdId: string,
  submissionId: string
): Promise<MetaInsightsSnapshot> {
  console.log('[meta:stub] fetchAdInsights', metaAdId);
  // Mocked plausible numbers
  const impressions = 40000 + Math.floor(Math.random() * 50000);
  const spendCents: Cents = 80000 + Math.floor(Math.random() * 200000);
  const conversions = 40 + Math.floor(Math.random() * 90);
  const conversionValueCents: Cents = spendCents * (2.5 + Math.random() * 2);
  return {
    id: `snap_${Date.now()}_${submissionId}`,
    submissionId,
    metaAdId,
    snapshotAt: new Date().toISOString(),
    impressions,
    clicks: Math.floor(impressions * 0.018),
    spendCents,
    conversions,
    conversionValueCents,
    roas: conversionValueCents / spendCents,
    cpa: spendCents / conversions,
  };
}

/**
 * Pause an ad — used when its campaign's pool is depleted.
 * V1: POST /{ad_id}?status=PAUSED
 */
export async function pauseAd(_credentials: MetaCredentials, metaAdId: string): Promise<void> {
  console.log('[meta:stub] pauseAd', metaAdId);
}

/** Resume a paused ad. V1: POST /{ad_id}?status=ACTIVE */
export async function resumeAd(_credentials: MetaCredentials, metaAdId: string): Promise<void> {
  console.log('[meta:stub] resumeAd', metaAdId);
}

/**
 * OAuth: build the URL a brand visits to grant Kyro access to their Ad Account.
 * V1: this should be called from a Vercel API route that includes the App ID.
 */
export function buildOAuthUrl(redirectUri: string, state: string): string {
  const appId = import.meta.env.VITE_META_APP_ID;
  if (!appId) {
    console.warn('[meta:stub] VITE_META_APP_ID not set — OAuth url is a placeholder');
    return '#meta-oauth-not-configured';
  }
  const scope = [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_show_list',
    'pages_read_engagement',
    'instagram_basic',
  ].join(',');
  return (
    `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?` +
    new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope,
      response_type: 'code',
    })
  );
}

/**
 * Generate the whitelisting / brand-asset permission deep link a CREATOR
 * needs to grant the brand permission to use their IG/FB account in ads.
 *
 * V1 behavior: produce a Meta Business "Partnership Permissions" URL. For
 * now, returns a placeholder.
 */
export function buildWhitelistingLink(creatorHandle: string, brandBusinessId: string): string {
  return `https://business.facebook.com/partnership-permissions?creator=${encodeURIComponent(
    creatorHandle
  )}&business_id=${brandBusinessId}`;
}
