/**
 * KYRO: what the processor costs, passed through at cost
 *
 * Shared deliberately. The server computes what is charged and the brand's
 * screen shows what will be charged, and those two numbers disagreeing is the
 * worst possible bug on a billing page. Pure arithmetic, no imports, no
 * environment: safe in the browser and in a serverless function.
 *
 * KYRO's charge is 1% of attributed sales. Stripe's charge is separate and
 * depends on how the brand chooses to pay. Absorbing it meant KYRO's actual
 * revenue moved with that choice: on a card, Stripe's 2.9% plus 30c took more
 * than half the fee, so a 1% platform kept about 0.48%.
 *
 * So the processor's cost is added to the charge and passed to the processor
 * in full. KYRO keeps none of it and marks none of it up. A brand sees the
 * amount for their method before they authorise anything, and a brand who
 * would rather not pay it pays by bank, which costs a fraction as much.
 *
 * The arithmetic is a gross-up, not an addition. Stripe takes its percentage
 * of the *total* charged, so adding 2.9% of the net leaves KYRO short by 2.9%
 * of the addition. Charging `(net + fixed) / (1 - rate)` is the amount whose
 * fee leaves exactly `net` behind.
 */

/**
 * Stripe's published US rates, in one place so a change is one edit.
 *
 * Card: 2.9% + 30c, no cap. Bank debit: 0.8%, capped at $5. International
 * cards, manually entered cards and currency conversion all cost more; a
 * brand paying with one of those costs KYRO a little more than this predicts,
 * which is a deliberate choice to keep the number on screen simple and
 * never to over-collect.
 */
export const CARD_RATE_BPS = 290;
export const CARD_FIXED_CENTS = 30;
export const BANK_RATE_BPS = 80;
export const BANK_CAP_CENTS = 500;

export type ProcessingMethod = 'card' | 'us_bank_account';

/**
 * The processor's cost on a charge that must leave `netCents` behind.
 *
 * Rounded up, so KYRO is never left a cent short by rounding. The brand pays
 * at most one cent more than the processor takes.
 */
export function processingCents(netCents: number, method: ProcessingMethod): number {
  if (netCents <= 0) return 0;

  if (method === 'us_bank_account') {
    const grossed = Math.ceil((netCents * 10000) / (10000 - BANK_RATE_BPS));
    // Past the cap Stripe stops taking a percentage, so the pass-through is
    // the cap itself and the gross-up would over-collect.
    return Math.min(grossed - netCents, BANK_CAP_CENTS);
  }

  const grossed = Math.ceil(((netCents + CARD_FIXED_CENTS) * 10000) / (10000 - CARD_RATE_BPS));
  return grossed - netCents;
}

/** What the brand is actually charged: what KYRO needs, plus what Stripe takes. */
export function chargeTotalCents(netCents: number, method: ProcessingMethod): number {
  return netCents + processingCents(netCents, method);
}

/** 'card' | 'us_bank_account' from whatever the billing row happens to hold. */
export function methodOf(stored: string | null | undefined): ProcessingMethod {
  return stored === 'us_bank_account' ? 'us_bank_account' : 'card';
}
