/**
 * Reporting KYRO's fee to Shopify.
 *
 * Brands that arrived through the App Store are billed by Shopify, not by
 * KYRO (App Store rule 1.2.1). The plan is configured in the Dev Dashboard:
 * $0 a month, a 30-day free trial, and one usage meter.
 *
 *   meter handle   attributed_sales_usd
 *   price          $0.01 per unit
 *   one unit       one dollar of attributed sales
 *
 * So a $120 attributed order reports 120 units and Shopify charges $1.20,
 * which is the 1%. Sending dollars rather than a fee amount keeps the rate
 * in one place, the merchant's plan, where they can see it.
 */

/** Usage events are not the Admin API. This host and path are their own. */
const EVENTS_URL = 'https://api.shopify.com/app/unstable/events';

export const USAGE_METER = 'attributed_sales_usd';

export interface UsageEvent {
  /** gid://shopify/Shop/… for the store being charged. */
  shopGid: string;
  /** Dollars of attributed sales, to two decimal places. */
  valueUsd: number;
  /** Stable per sale, so a retry can never charge twice. */
  idempotencyKey: string;
  /** When the sale cleared. Must fall inside the current billing cycle. */
  occurredAt: Date;
}

export interface UsageResult {
  status: number;
  error: string | null;
}

/**
 * Post one usage event.
 *
 * Shopify answers 202 as soon as it accepts the request, even when the event
 * later fails their own validation, so a 202 means "delivered", not "billed".
 * The caller records what was sent either way.
 */
export async function reportUsage(token: string, event: UsageEvent): Promise<UsageResult> {
  let res: Response;
  try {
    res = await fetch(EVENTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shop_id: event.shopGid,
        event_handle: USAGE_METER,
        timestamp: event.occurredAt.toISOString(),
        idempotency_key: event.idempotencyKey,
        // Quoted, because fractional values have to be sent as strings.
        attributes: { value: event.valueUsd.toFixed(2) },
      }),
    });
  } catch (e) {
    return { status: 0, error: (e as Error).message || 'network error' };
  }

  if (res.status === 202) return { status: 202, error: null };

  const body = await res.text().catch(() => '');
  return { status: res.status, error: body.slice(0, 300) || `HTTP ${res.status}` };
}
