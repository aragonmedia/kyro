/**
 * KYRO — Stripe billing for brands
 *
 * The paying side. A brand is an ordinary Stripe Customer with a saved payment
 * method; KYRO charges that Customer once per payment run and transfers each
 * creator their share.
 *
 * These are v1 endpoints and that is correct. Only Accounts creation moved to
 * v2; Customers, Checkout and SetupIntents are unchanged, and v1 speaks
 * form-encoded bodies rather than the JSON that api/_lib/stripe.ts uses.
 *
 * Nothing in this file may ever handle a card or bank number. Stripe collects
 * those on its own hosted page. If a change makes this file touch a PAN, the
 * change is wrong.
 */

import { stripeConfig } from './env.js';
import { StripeError } from './stripe.js';

const API = 'https://api.stripe.com/v1';

/** v1 takes form bodies, with brackets for anything nested. */
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
  const { secretKey, apiVersion } = stripeConfig();
  const body = method === 'POST' && params ? encode(params).join('&') : undefined;
  const query = method === 'GET' && params ? `?${encode(params).join('&')}` : '';

  // Pinned, like the v2 client. Without this header v1 follows whatever
  // version the Stripe account happens to default to, which means a dashboard
  // setting nobody here can see decides whether this code works.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Stripe-Version': apiVersion,
  };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API}${path}${query}`, { method, headers, body });
  } catch (e) {
    throw new StripeError((e as Error).message || 'Could not reach Stripe.', null, 0);
  }

  const text = await res.text();
  let json: { error?: { message?: string; code?: string } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* Stripe answers JSON; a non-JSON body is handled below. */
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

export async function createCustomer(
  brandId: string,
  name?: string | null,
  email?: string | null
): Promise<{ id: string }> {
  return request<{ id: string }>(
    '/customers',
    'POST',
    {
      name: name || undefined,
      email: email || undefined,
      metadata: { kyro_brand_id: brandId },
    },
    `kyro-brand-customer-${brandId}`
  );
}

/**
 * A Stripe-hosted page for entering a payment method.
 *
 * `mode: 'setup'` stores a method without charging. The mandate has to permit
 * charging while the brand is away, since nobody is watching when a payment
 * run goes through, and that is what `usage: off_session` means. It is not
 * passed here because it is already the default on a SetupIntent, and because
 * `setup_intent_data` has no `usage` child to pass it to: its children are
 * description, metadata and on_behalf_of. Sending it was simply wrong, at
 * every API version, which is why brand setup never once worked.
 *
 * `allowed_payment_method_types`, not `payment_method_types`. The latter was
 * removed in 2026-09-30.endive and now returns a 400. The new one also behaves
 * better: an incompatible type is filtered out rather than failing the call.
 */
export async function createSetupCheckout(
  customerId: string,
  method: 'ach' | 'card',
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string | null }> {
  return request<{ url: string | null }>('/checkout/sessions', 'POST', {
    mode: 'setup',
    customer: customerId,
    allowed_payment_method_types: [method === 'ach' ? 'us_bank_account' : 'card'],
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

export interface SavedMethod {
  paymentMethodId: string;
  type: string;
  brand: string | null;
  last4: string | null;
}

interface SessionResponse {
  customer?: string | null;
  setup_intent?: {
    payment_method?: {
      id?: string;
      type?: string;
      card?: { brand?: string | null; last4?: string | null } | null;
      us_bank_account?: { bank_name?: string | null; last4?: string | null } | null;
    } | null;
  } | null;
}

/**
 * What the brand just saved, read back from the completed Checkout session.
 *
 * Expanded in one call rather than walking session to setup intent to payment
 * method, which would be three round trips on a page the brand is waiting on.
 * Reading this server-side is also what makes the result trustworthy: a
 * browser returning to a success URL proves nothing on its own.
 */
export async function readSavedMethod(sessionId: string): Promise<SavedMethod | null> {
  const session = await request<SessionResponse>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    'GET',
    { expand: ['setup_intent.payment_method'] }
  );

  const pm = session.setup_intent?.payment_method;
  if (!pm?.id) return null;

  const type = pm.type ?? 'card';
  const detail = type === 'us_bank_account' ? pm.us_bank_account : pm.card;

  return {
    paymentMethodId: pm.id,
    type,
    brand: (type === 'us_bank_account' ? pm.us_bank_account?.bank_name : pm.card?.brand) ?? null,
    last4: detail?.last4 ?? null,
  };
}

/**
 * Why a completed Checkout session yielded no payment method.
 *
 * Read without the expand, so it reports the raw shape. The three answers are
 * different problems: the brand has not finished the form, Stripe has not
 * attached the method yet, or the expand is not doing what this code assumes.
 * Guessing between them has already cost a day.
 */
export async function describeEmptySession(sessionId: string): Promise<string> {
  try {
    const session = await request<{ status?: string; setup_intent?: unknown; mode?: string }>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      'GET'
    );
    const intent = session.setup_intent;
    const shape =
      intent === null || intent === undefined
        ? 'no setup intent on the session'
        : typeof intent === 'string'
          ? `setup intent ${intent} present but not expanded`
          : 'setup intent expanded but carried no payment method';
    return `session status ${session.status ?? 'unknown'}, mode ${session.mode ?? 'unknown'}, ${shape}`;
  } catch (e) {
    return e instanceof StripeError ? `could not re-read the session: ${e.message}` : 'could not re-read the session';
  }
}

/* ─────────────────────────────────────────────────────────────
   Charging a payment run

   One run, one charge, one transfer per creator. The order is fixed: KYRO
   transfers out of its own Stripe balance, so a transfer sent before the
   brand's charge has settled would be KYRO paying the creator and hoping.
   ───────────────────────────────────────────────────────────── */

export interface ChargeResult {
  id: string;
  status: string;
  chargeId: string | null;
}

interface IntentResponse {
  id: string;
  status: string;
  latest_charge?: string | null;
}

/**
 * Charge the brand for a run, off session.
 *
 * `off_session` is the whole point: the brand saved the method once and is not
 * sitting in front of the screen when a run is charged, so the mandate has to
 * carry the authorisation. A card may still come back needing authentication,
 * which is a real answer and not an error — the caller reads `status`.
 *
 * The idempotency key is the run id. A retried request gets the same
 * PaymentIntent back rather than a second charge, which is what makes it safe
 * for a cron to retry.
 */
export async function chargeRun(opts: {
  runId: string;
  customerId: string;
  paymentMethodId: string;
  methodType: string;
  amountCents: number;
  description: string;
}): Promise<ChargeResult> {
  const intent = await request<IntentResponse>(
    '/payment_intents',
    'POST',
    {
      amount: opts.amountCents,
      currency: 'usd',
      customer: opts.customerId,
      payment_method: opts.paymentMethodId,
      allowed_payment_method_types: [opts.methodType === 'us_bank_account' ? 'us_bank_account' : 'card'],
      confirm: 'true',
      off_session: 'true',
      description: opts.description,
      // Ties the charge and every transfer it funds together, so Stripe's own
      // dashboard can answer "which payout came from which charge".
      transfer_group: `kyro-run-${opts.runId}`,
      metadata: { kyro_payment_run_id: opts.runId },
    },
    `kyro-run-charge-${opts.runId}`
  );

  return { id: intent.id, status: intent.status, chargeId: intent.latest_charge ?? null };
}

/** Where a charge has got to, read from Stripe rather than from our copy. */
export async function fetchCharge(intentId: string): Promise<ChargeResult> {
  const intent = await request<IntentResponse>(
    `/payment_intents/${encodeURIComponent(intentId)}`,
    'GET'
  );
  return { id: intent.id, status: intent.status, chargeId: intent.latest_charge ?? null };
}

/**
 * Send one creator their share.
 *
 * The idempotency key is the payout row's id, so a transfer cannot be sent
 * twice for the same creator and run even if this is called again after a
 * timeout where Stripe accepted the first attempt.
 */
export async function transferToCreator(opts: {
  payoutId: string;
  runId: string;
  accountId: string;
  amountCents: number;
  description: string;
}): Promise<{ id: string }> {
  return request<{ id: string }>(
    '/transfers',
    'POST',
    {
      amount: opts.amountCents,
      currency: 'usd',
      destination: opts.accountId,
      transfer_group: `kyro-run-${opts.runId}`,
      description: opts.description,
      metadata: { kyro_payment_run_id: opts.runId, kyro_payout_id: opts.payoutId },
    },
    `kyro-payout-${opts.payoutId}`
  );
}

/**
 * What KYRO can actually send right now, in cents.
 *
 * Checked before a payout pass so a short balance stops the run cleanly
 * instead of leaving a trail of `balance_insufficient` failures on individual
 * creators, which would look to each of them like their payout had failed.
 */
export async function availableBalanceCents(): Promise<number> {
  const balance = await request<{ available?: Array<{ amount?: number; currency?: string }> }>(
    '/balance',
    'GET'
  );
  const usd = (balance.available ?? []).find((b) => b.currency === 'usd');
  return usd?.amount ?? 0;
}
