/**
 * KYRO — Stripe
 *
 * Only what Connect onboarding needs: create a creator's Express account, send
 * them to Stripe to complete it, and read back whether Stripe will pay them.
 *
 * Written against the REST API with fetch, like the Shopify and Meta clients
 * in this folder, so there is one dependency-free pattern for every provider
 * rather than three different ones.
 *
 * No Stripe-Version header is sent on purpose. Pinning a version KYRO has not
 * tested against is how an integration breaks on somebody else's release day;
 * the account's own default version is stable and is what the dashboard shows.
 */

import { stripeConfig } from './env.js';

const API = 'https://api.stripe.com/v1';

export class StripeError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

/** Stripe takes form bodies, with brackets for anything nested. */
function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) =>
        out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(v))}`)
      );
    } else if (typeof value === 'object') {
      out.push(...encode(value as Record<string, unknown>, name));
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST',
  params?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<T> {
  const { secretKey } = stripeConfig();
  const body = params ? encode(params).join('&') : undefined;

  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  // Stripe replays the first answer for a repeated key, so a double-clicked
  // button cannot leave a creator with two connected accounts.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method, headers, body });
  } catch (e) {
    throw new StripeError((e as Error).message || 'Could not reach Stripe.', null, 0);
  }

  const text = await res.text();
  let json: { error?: { message?: string; code?: string } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* Stripe always returns JSON; a body that is not JSON is handled below. */
  }

  if (!res.ok) {
    throw new StripeError(
      json.error?.message || `Stripe returned ${res.status}.`,
      json.error?.code ?? null,
      res.status
    );
  }

  return json as T;
}

export interface StripeAccount {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[] | null } | null;
}

/**
 * An Express account for one creator.
 *
 * Only the transfers capability is requested. KYRO sends money to creators and
 * never takes payments on their behalf, so asking for card_payments would be
 * asking for permissions the product does not use.
 */
export async function createExpressAccount(creatorId: string, email?: string | null): Promise<StripeAccount> {
  return request<StripeAccount>(
    '/accounts',
    'POST',
    {
      type: 'express',
      country: 'US',
      email: email || undefined,
      capabilities: { transfers: { requested: 'true' } },
      business_type: 'individual',
      metadata: { kyro_creator_id: creatorId },
    },
    `kyro-creator-account-${creatorId}`
  );
}

export async function fetchAccount(accountId: string): Promise<StripeAccount> {
  return request<StripeAccount>(`/accounts/${encodeURIComponent(accountId)}`, 'GET');
}

/**
 * A one-time link into Stripe's hosted onboarding.
 *
 * These expire in minutes and are single use, which is why KYRO mints one per
 * click rather than storing it. `refresh_url` is where Stripe sends someone
 * whose link went stale, so it has to start the flow again, not dead-end.
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<{ url: string }> {
  return request<{ url: string }>('/account_links', 'POST', {
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
}
