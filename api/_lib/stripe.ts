/**
 * KYRO — Stripe, Accounts v2
 *
 * Only what creator payout onboarding needs: create a creator's connected
 * account, send them to Stripe's hosted flow, and read back whether Stripe
 * will actually pay them.
 *
 * Why v2 rather than v1: Stripe refuses POST /v1/accounts for new Connect
 * integrations outright. v2 replaces the single `type: 'express'` flag with
 * configurations. A creator gets the `recipient` configuration, which carries
 * `stripe_balance.stripe_transfers`, the capability that lets the platform
 * transfer funds to them. They do not get `merchant`, because KYRO never takes
 * payments on a creator's behalf.
 *
 * Two API shapes worth remembering: v2 speaks JSON and requires a pinned
 * Stripe-Version header, where v1 spoke form-encoded bodies and tolerated no
 * version at all.
 */

import { stripeConfig } from './env.js';

const API = 'https://api.stripe.com/v2';

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

async function request<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  idempotencyKey?: string
): Promise<T> {
  const { secretKey, apiVersion } = stripeConfig();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': apiVersion,
  };
  if (body) headers['Content-Type'] = 'application/json';
  // Stripe replays the first answer for a repeated key, so a double-clicked
  // button cannot leave a creator with two connected accounts.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new StripeError((e as Error).message || 'Could not reach Stripe.', null, 0);
  }

  const text = await res.text();
  let json: { error?: { message?: string; code?: string; type?: string } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* Stripe answers JSON; a body that is not JSON is handled below. */
  }

  if (!res.ok) {
    throw new StripeError(
      json.error?.message || `Stripe returned ${res.status}.`,
      json.error?.code ?? json.error?.type ?? null,
      res.status
    );
  }

  return json as T;
}

/** Only the parts of a v2 Account that KYRO reads. */
export interface StripeAccountV2 {
  id: string;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string | null } | null;
        } | null;
      } | null;
    } | null;
  } | null;
  requirements?: {
    entries?: Array<{
      field?: string | null;
      description?: string | null;
      impact?: { restricts_capabilities?: unknown[] | null } | null;
    }> | null;
  } | null;
}

/** What KYRO needs to know, flattened out of the v2 response shape. */
export interface PayoutReadiness {
  accountId: string;
  /** Stripe will accept transfers to this creator. The only gate that counts. */
  transfersActive: boolean;
  /** Outstanding items that are actually holding a capability back. */
  requirementsDue: string[];
}

/**
 * v2 returns null for most properties unless they are named in `include`, so
 * every read asks for the three KYRO actually uses. Forgetting this is the
 * classic v2 mistake: the call succeeds and every field comes back empty.
 */
const INCLUDE = ['configuration.recipient', 'identity', 'requirements'];

export function readReadiness(account: StripeAccountV2): PayoutReadiness {
  const status = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;

  // Entries that do not restrict a capability are informational. Showing a
  // creator "3 items outstanding" when none of them block payment is how you
  // get support tickets about a working account.
  const entries = account.requirements?.entries ?? [];
  const requirementsDue = entries
    .filter((e) => (e?.impact?.restricts_capabilities?.length ?? 0) > 0)
    .map((e) => e?.field || e?.description || 'additional information')
    .slice(0, 20);

  return { accountId: account.id, transfersActive: status === 'active', requirementsDue };
}

/**
 * A connected account for one creator.
 *
 * `recipient` only. Express dashboard carries a hard constraint from Stripe:
 * if the dashboard is express, both fees_collector and losses_collector must
 * be `application`. That is correct for KYRO regardless, because the platform
 * absorbs disputes in this model.
 */
export async function createRecipientAccount(
  creatorId: string,
  email?: string | null,
  displayName?: string | null
): Promise<StripeAccountV2> {
  return request<StripeAccountV2>(
    '/core/accounts',
    'POST',
    {
      contact_email: email || undefined,
      display_name: displayName || undefined,
      dashboard: 'express',
      identity: { country: 'us', entity_type: 'individual' },
      configuration: {
        recipient: {
          capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
        },
      },
      defaults: {
        currency: 'usd',
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
      },
      metadata: { kyro_creator_id: creatorId },
      include: INCLUDE,
    },
    `kyro-creator-account-v2-${creatorId}`
  );
}

export async function fetchAccount(accountId: string): Promise<StripeAccountV2> {
  const query = INCLUDE.map((v, i) => `include[${i}]=${encodeURIComponent(v)}`).join('&');
  return request<StripeAccountV2>(`/core/accounts/${encodeURIComponent(accountId)}?${query}`, 'GET');
}

/**
 * A one-time link into Stripe's hosted flow.
 *
 * No `configurations` here. Earlier API versions required it and refused the
 * call without it; the 2026-09-30.endive release removed the parameter and now
 * refuses the call *with* it, working out which configurations need onboarding
 * on its own. Sending it is what made every payout setup fail.
 *
 * `account_onboarding` collects for the first time; `account_update` is for a
 * creator coming back to fix or change something once they are set up.
 *
 * These expire in ten minutes and are single use, so KYRO mints one per click
 * rather than storing it.
 */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
  mode: 'account_onboarding' | 'account_update' = 'account_onboarding'
): Promise<{ url: string }> {
  return request<{ url: string }>('/core/account_links', 'POST', {
    account: accountId,
    use_case: {
      type: mode,
      [mode]: {
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
}
