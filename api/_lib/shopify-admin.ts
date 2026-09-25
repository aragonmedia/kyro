/**
 * KYRO — Shopify Admin GraphQL
 *
 * One job: ask a store how a customer arrived, so an order can be traced back
 * to the creator video that earned it.
 *
 * This is protected customer data. KYRO's access request is Level 1 with zero
 * protected customer fields (no name, email, phone or address), which is why
 * the query below asks only for UTM parameters and the landing URL. Adding a
 * customer field here would silently put the app out of step with what
 * Shopify approved. Don't.
 */

import { shopifyConfig } from './env.js';

export interface UtmParameters {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
}

export interface CustomerVisit {
  landingPage?: string | null;
  occurredAt?: string | null;
  source?: string | null;
  referrerUrl?: string | null;
  utmParameters?: UtmParameters | null;
}

export interface CustomerJourney {
  momentsCount?: number | null;
  customerOrderIndex?: number | null;
  daysToConversion?: number | null;
  firstVisit?: CustomerVisit | null;
  lastVisit?: CustomerVisit | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export class ShopifyAdminError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'ShopifyAdminError';
  }
}

async function graphql<T>(shop: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const { apiVersion } = shopifyConfig();
  const res = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  // 429 and 5xx are worth another delivery attempt. 401/403 mean the token is
  // dead or the scope was never granted, and retrying changes nothing.
  if (res.status === 429 || res.status >= 500) {
    throw new ShopifyAdminError(`Shopify Admin API ${res.status}`, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ShopifyAdminError(`Shopify Admin API ${res.status}: ${body.slice(0, 300)}`, false);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message).join('; ');
    const code = (e: { extensions?: Record<string, unknown> }) =>
      String(e.extensions?.code ?? '').toUpperCase();
    // ACCESS_DENIED: protected customer data not approved yet. Permanent.
    // THROTTLED: cost limit hit. Worth another delivery attempt.
    const denied = json.errors.some((e) => code(e) === 'ACCESS_DENIED');
    const throttled = json.errors.some((e) => code(e) === 'THROTTLED');
    const prefix = denied ? 'Shopify GraphQL access denied' : 'Shopify GraphQL';
    throw new ShopifyAdminError(`${prefix}: ${message}`, throttled);
  }
  if (!json.data) throw new ShopifyAdminError('Shopify GraphQL returned no data.', true);
  return json.data;
}

const JOURNEY_QUERY = `
  query OrderJourney($id: ID!) {
    order(id: $id) {
      id
      customerJourneySummary {
        momentsCount
        customerOrderIndex
        daysToConversion
        firstVisit { landingPage occurredAt source referrerUrl utmParameters { source medium campaign content term } }
        lastVisit  { landingPage occurredAt source referrerUrl utmParameters { source medium campaign content term } }
      }
    }
  }
`;

/**
 * Fetch the customer journey for one order.
 *
 * Returns null when the store has no journey data for it, which is normal:
 * journeys are absent for draft orders, POS orders, and orders placed by a
 * visitor whose session Shopify could not stitch together.
 */
export async function fetchOrderJourney(
  shop: string,
  token: string,
  orderId: string | number
): Promise<CustomerJourney | null> {
  const gid = String(orderId).startsWith('gid://')
    ? String(orderId)
    : `gid://shopify/Order/${orderId}`;

  const data = await graphql<{ order: { customerJourneySummary: CustomerJourney | null } | null }>(
    shop,
    token,
    JOURNEY_QUERY,
    { id: gid }
  );
  return data.order?.customerJourneySummary ?? null;
}

/**
 * Pull the KYRO tracking token out of a visit.
 *
 * Primary carrier is `utm_content`, which is where the ad builder puts it.
 * The landing URL is checked as a fallback for the case where a merchant's
 * theme or a redirect strips UTM parameters but preserves the query string.
 */
export function trackingTokenFromVisit(visit: CustomerVisit | null | undefined): string | null {
  if (!visit) return null;

  const fromUtm = visit.utmParameters?.content?.trim();
  if (fromUtm && /^[a-f0-9]{16}$/i.test(fromUtm)) return fromUtm.toLowerCase();

  const landing = visit.landingPage;
  if (landing) {
    try {
      const url = new URL(landing, 'https://placeholder.invalid');
      const candidate =
        url.searchParams.get('kyro') ?? url.searchParams.get('utm_content') ?? '';
      const trimmed = candidate.trim();
      if (/^[a-f0-9]{16}$/i.test(trimmed)) return trimmed.toLowerCase();
    } catch {
      /* unparseable landing page, nothing to recover */
    }
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────
   Webhook subscriptions
   ───────────────────────────────────────────────────────────── */

/**
 * Topics KYRO subscribes each store to at install time.
 *
 * The three mandatory compliance topics (customers/data_request,
 * customers/redact, shop/redact) are NOT here. Shopify manages those itself
 * from the app configuration and rejects an attempt to subscribe to them
 * through the API.
 */
export const WEBHOOK_TOPICS = [
  'ORDERS_CREATE',
  'ORDERS_UPDATED',
  'ORDERS_CANCELLED',
  'REFUNDS_CREATE',
  'FULFILLMENTS_CREATE',
  'FULFILLMENTS_UPDATE',
  'APP_UNINSTALLED',
] as const;

const SUBSCRIBE_MUTATION = `
  mutation Subscribe($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
    ) {
      userErrors { field message }
      webhookSubscription { id }
    }
  }
`;

export interface SubscriptionOutcome {
  topic: string;
  ok: boolean;
  error?: string;
}

/**
 * Subscribe a freshly installed store to the topics above.
 *
 * Shopify treats a duplicate (topic, callbackUrl) pair as a user error rather
 * than creating a second subscription, so re-running this on a reinstall is
 * safe and reports the duplicate as success.
 *
 * Never throws. A store that installed but failed to subscribe is still a
 * connected store; the caller logs the outcome and moves on rather than
 * failing the install in the merchant's browser.
 */
export async function subscribeWebhooks(
  shop: string,
  token: string,
  callbackUrl: string
): Promise<SubscriptionOutcome[]> {
  const results: SubscriptionOutcome[] = [];

  for (const topic of WEBHOOK_TOPICS) {
    try {
      const data = await graphql<{
        webhookSubscriptionCreate: {
          userErrors: Array<{ field: string[] | null; message: string }>;
          webhookSubscription: { id: string } | null;
        };
      }>(shop, token, SUBSCRIBE_MUTATION, { topic, callbackUrl });

      const errors = data.webhookSubscriptionCreate?.userErrors ?? [];
      if (errors.length) {
        const message = errors.map((e) => e.message).join('; ');
        const alreadyExists = /already\s+(exists|been taken)|taken/i.test(message);
        results.push({ topic, ok: alreadyExists, error: alreadyExists ? undefined : message });
      } else {
        results.push({ topic, ok: true });
      }
    } catch (err) {
      results.push({ topic, ok: false, error: (err as Error).message });
    }
  }

  return results;
}

/**
 * The store's Shopify id, which every usage event has to carry.
 *
 * Cheap, and cached on the brand row by the caller, because it never changes
 * for a given store.
 */
export async function fetchShopGid(shop: string, token: string): Promise<string | null> {
  const data = await graphql<{ shop: { id: string } | null }>(
    shop,
    token,
    'query { shop { id } }',
    {}
  );
  return data.shop?.id ?? null;
}
