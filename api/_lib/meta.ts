/**
 * KYRO — Meta Graph API.
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
