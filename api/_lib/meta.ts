/**
 * KYRO: Meta Graph API.
 *
 * Only the pieces the connection needs: send a brand to Meta's login dialog,
 * trade the code for a long-lived token, and list the ad accounts that token
 * can actually advertise with.
 *
 * Every call carries `appsecret_proof`, an HMAC of the token with the app
 * secret. Meta treats a stolen token alone as unusable when the app requires
 * it, which turns a leaked token into a much smaller problem.
 */

import crypto from 'node:crypto';
import { metaConfig } from './env.js';

export class MetaError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code?: number) {
    super(message);
    this.name = 'MetaError';
  }
}

const graphUrl = (path: string) => {
  const { graphVersion } = metaConfig();
  return `https://graph.facebook.com/${graphVersion}/${path.replace(/^\/+/, '')}`;
};

export function appSecretProof(token: string): string {
  const { appSecret } = metaConfig();
  return crypto.createHmac('sha256', appSecret).update(token).digest('hex');
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(graphUrl(path));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  url.searchParams.set('appsecret_proof', appSecretProof(token));

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as T & GraphError;

  if (!res.ok || json.error) {
    const code = json.error?.code;
    // 4, 17 and 613 are rate limits; 1 and 2 are transient platform errors.
    const retryable = res.status >= 500 || [1, 2, 4, 17, 613].includes(code ?? -1);
    throw new MetaError(json.error?.message || `Graph API ${res.status}`, retryable, code);
  }
  return json as T;
}

/** Where a brand goes to approve KYRO. State is signed by the caller. */
export function buildLoginUrl(state: string): string {
  const { appId, redirectUri, scopes, graphVersion } = metaConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: scopes.join(','),
  });
  return `https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`;
}

export interface MetaToken {
  accessToken: string;
  /** Seconds. Long-lived user tokens last about 60 days. */
  expiresIn: number | null;
}

/** Trade the one-time code for a short-lived token. */
export async function exchangeCode(code: string): Promise<MetaToken> {
  const { appId, appSecret, redirectUri } = metaConfig();
  const url = new URL(graphUrl('oauth/access_token'));
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number } & GraphError;
  if (!res.ok || json.error || !json.access_token) {
    throw new MetaError(json.error?.message || `Code exchange failed (${res.status})`, false, json.error?.code);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? null };
}

/**
 * Trade a short-lived token for a long-lived one.
 *
 * Without this the connection dies in about an hour, which a brand would
 * experience as "KYRO keeps disconnecting".
 */
export async function longLivedToken(shortLived: string): Promise<MetaToken> {
  const { appId, appSecret } = metaConfig();
  const url = new URL(graphUrl('oauth/access_token'));
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortLived);

  const res = await fetch(url.toString());
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number } & GraphError;
  if (!res.ok || json.error || !json.access_token) {
    throw new MetaError(json.error?.message || `Token exchange failed (${res.status})`, false, json.error?.code);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? null };
}

export interface MetaAdAccount {
  /** act_123456789, the form every other call expects. */
  id: string;
  accountId: string;
  name: string;
  currency: string;
  /** 1 is active. Anything else cannot run ads today. */
  status: number;
  businessName: string | null;
}

/** The ad accounts this token may advertise with, newest first. */
export async function listAdAccounts(token: string): Promise<MetaAdAccount[]> {
  const data = await graph<{
    data?: Array<{
      id: string;
      account_id: string;
      name?: string;
      currency?: string;
      account_status?: number;
      business?: { name?: string };
    }>;
  }>('me/adaccounts', token, {
    fields: 'id,account_id,name,currency,account_status,business{name}',
    limit: '100',
  });

  return (data.data ?? []).map((a) => ({
    id: a.id,
    accountId: a.account_id,
    name: a.name || `Ad account ${a.account_id}`,
    currency: a.currency || 'USD',
    status: a.account_status ?? 0,
    businessName: a.business?.name ?? null,
  }));
}

/** Who the token belongs to, used to label the connection. */
export async function fetchMe(token: string): Promise<{ id: string; name: string | null }> {
  const me = await graph<{ id: string; name?: string }>('me', token, { fields: 'id,name' });
  return { id: me.id, name: me.name ?? null };
}

/* ─────────────────────────────────────────────────────────────
   Finding the ad that belongs to a video, and what it did

   The link between a KYRO submission and a Meta ad is discovered rather
   than entered. A brand already has to put the submission's tracking token
   in the ad's destination URL, because that is what attributes a Shopify
   order back to the creator. So the token is a key that already exists in
   both systems, and asking anybody to maintain a second mapping would only
   create something to be wrong.
   ───────────────────────────────────────────────────────────── */

export interface MetaAdLink {
  adId: string;
  name: string;
  /** Every destination URL this ad points at, lowercased. */
  urls: string[];
  /** EFFECTIVE status, e.g. ACTIVE, PAUSED, ADSET_PAUSED. */
  status: string;
}

/**
 * Every ad in an account with the destination URLs its creative points at.
 *
 * Meta spreads the link across several creative shapes depending on how the
 * ad was built, so all of them are collected and the caller searches the
 * lot rather than guessing which field this particular ad used.
 */
export async function listAdsWithLinks(token: string, adAccountId: string): Promise<MetaAdLink[]> {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const out: MetaAdLink[] = [];
  let after: string | null = null;

  // Bounded. An account with more than 5,000 ads is not a brand KYRO is
  // serving yet, and an unbounded loop against a paginated API is how a
  // cron run turns into a bill.
  for (let page = 0; page < 10; page += 1) {
    const params: Record<string, string> = {
      fields:
        'id,name,effective_status,creative{object_story_spec,asset_feed_spec,url_tags,effective_object_story_id,link_url}',
      limit: '500',
    };
    if (after) params.after = after;

    const data: {
      data?: Array<Record<string, unknown>>;
      paging?: { cursors?: { after?: string }; next?: string };
    } = await graph(`${account}/ads`, token, params);

    for (const ad of data.data ?? []) {
      const creative = (ad.creative ?? {}) as Record<string, unknown>;
      const urls: string[] = [];

      const push = (value: unknown) => {
        if (typeof value === 'string' && value) urls.push(value.toLowerCase());
      };

      push(creative.link_url);
      push(creative.url_tags);

      const story = (creative.object_story_spec ?? {}) as Record<string, unknown>;
      for (const key of ['link_data', 'video_data', 'photo_data']) {
        const block = (story[key] ?? {}) as Record<string, unknown>;
        push(block.link);
        push(block.call_to_action && ((block.call_to_action as Record<string, unknown>).value as Record<string, unknown>)?.link);
      }

      const feed = (creative.asset_feed_spec ?? {}) as Record<string, unknown>;
      for (const entry of (feed.link_urls as Array<Record<string, unknown>> | undefined) ?? []) {
        push(entry.website_url);
        push(entry.display_url);
      }

      out.push({
        adId: String(ad.id),
        name: typeof ad.name === 'string' ? ad.name : '',
        urls,
        status: typeof ad.effective_status === 'string' ? ad.effective_status : 'UNKNOWN',
      });
    }

    after = data.paging?.next ? data.paging?.cursors?.after ?? null : null;
    if (!after) break;
  }

  return out;
}

export interface MetaDayInsight {
  day: string;
  impressions: number;
  reach: number;
  spendCents: number;
  clicks: number;
  linkClicks: number;
  videoPlays: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  thruplays: number;
  avgWatchSeconds: number | null;
}

/** Sum the `value` fields of one of Meta's action arrays. */
const actionTotal = (rows: unknown): number => {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum: number, row) => {
    const value = Number((row as { value?: unknown })?.value ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
};

const actionOfType = (rows: unknown, type: string): number => {
  if (!Array.isArray(rows)) return 0;
  const hit = rows.find((row) => (row as { action_type?: string })?.action_type === type);
  const value = Number((hit as { value?: unknown })?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
};

/**
 * One ad's daily performance over a window.
 *
 * Daily rather than lifetime because a trend line needs days, and because a
 * day that is corrected later should correct one row rather than shift a
 * running total nobody can reconcile.
 */
export async function fetchAdInsights(
  token: string,
  adId: string,
  sinceIso: string,
  untilIso: string
): Promise<MetaDayInsight[]> {
  const data = await graph<{ data?: Array<Record<string, unknown>> }>(`${adId}/insights`, token, {
    fields:
      'date_start,impressions,reach,spend,clicks,inline_link_clicks,actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions',
    time_increment: '1',
    time_range: JSON.stringify({ since: sinceIso, until: untilIso }),
    limit: '500',
  });

  return (data.data ?? []).map((row) => {
    const spend = Number(row.spend ?? 0);
    const avg = actionTotal(row.video_avg_time_watched_actions);
    return {
      day: String(row.date_start),
      impressions: Number(row.impressions ?? 0) || 0,
      reach: Number(row.reach ?? 0) || 0,
      // Meta reports spend in the account currency as a decimal string.
      spendCents: Math.round((Number.isFinite(spend) ? spend : 0) * 100),
      clicks: Number(row.clicks ?? 0) || 0,
      linkClicks: Number(row.inline_link_clicks ?? 0) || 0,
      videoPlays: actionTotal(row.video_play_actions),
      p25: actionTotal(row.video_p25_watched_actions),
      p50: actionTotal(row.video_p50_watched_actions),
      p75: actionTotal(row.video_p75_watched_actions),
      p100: actionTotal(row.video_p100_watched_actions),
      thruplays: actionOfType(row.actions, 'video_view'),
      avgWatchSeconds: avg > 0 ? avg : null,
    };
  });
}
