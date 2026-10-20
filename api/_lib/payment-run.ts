/**
 * KYRO — settling a payment run
 *
 * One run means one charge to the brand and one transfer per creator. This is
 * the second half: the charge has gone through, and each creator's share has
 * to leave KYRO's Stripe balance for their connected account.
 *
 * Shared by two callers, deliberately. A card charge succeeds in the same
 * request the brand clicked, so the endpoint pays out immediately. A bank
 * debit takes days, so the cron picks the run up once Stripe says the charge
 * has settled. Both paths run exactly this code.
 *
 * Everything here is idempotent. Payout rows are unique per creator and run,
 * each transfer's idempotency key is its row id, and a row that is already
 * paid is skipped. Running this twice on the same run pays nobody twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { StripeError } from './stripe.js';
import { availableBalanceCents, transferToCreator } from './stripe-billing.js';

export interface PayoutSummary {
  runId: string;
  /** Transfers that left for a creator in this pass. */
  paid: number;
  /** Transfers Stripe refused. The row keeps the reason and stays pending. */
  failed: number;
  /** Creators with no payout account yet. Their share is held, not lost. */
  skipped: number;
  /** Still to send after this pass. Zero means the run is settled. */
  pending: number;
  status: string;
  /** Set when the whole pass stopped before trying, e.g. a short balance. */
  halted: string | null;
}

interface PlannedPayout {
  id: string;
  creator_id: string;
  amount_cents: number;
  stripe_account_id: string | null;
  status: string;
}

/**
 * Pay every creator this run owes.
 *
 * The balance is checked once, up front. KYRO transfers out of its own Stripe
 * balance, so a run attempted while the brand's debit is still clearing would
 * fail creator by creator, and each creator would see a failed payout that was
 * never their problem. Better to send nothing and come back.
 */
export async function payOutRun(db: SupabaseClient, runId: string): Promise<PayoutSummary> {
  const summary: PayoutSummary = {
    runId,
    paid: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    status: 'processing',
    halted: null,
  };

  const { data: planned, error: planError } = await db.rpc('plan_payment_run_payouts', {
    p_run_id: runId,
  });
  if (planError) {
    console.error('[kyro] could not plan payouts for run', runId, planError);
    summary.halted = 'Could not work out who this run owes.';
    return summary;
  }

  const rows = (planned ?? []) as PlannedPayout[];
  const pending = rows.filter((r) => r.status === 'pending' && r.stripe_account_id);
  summary.skipped = rows.filter((r) => r.status === 'skipped').length;

  if (pending.length === 0) {
    summary.status = await closeRun(db, runId);
    // A skipped creator is still owed, so the run is not finished even though
    // there is nothing to send today.
    summary.pending = summary.skipped;
    return summary;
  }

  const owed = pending.reduce((sum, r) => sum + Number(r.amount_cents), 0);
  let available = 0;
  try {
    available = await availableBalanceCents();
  } catch (e) {
    console.error('[kyro] could not read the Stripe balance', e);
    summary.halted = 'Could not read the Stripe balance.';
    summary.pending = pending.length;
    return summary;
  }

  if (available < owed) {
    // Not an error. A bank debit takes days to land, and this is what that
    // looks like from here.
    summary.halted = 'The brand payment has not cleared into KYRO yet.';
    summary.pending = pending.length;
    return summary;
  }

  for (const row of pending) {
    try {
      const transfer = await transferToCreator({
        payoutId: row.id,
        runId,
        accountId: row.stripe_account_id as string,
        amountCents: Number(row.amount_cents),
        description: `KYRO commission payout`,
      });

      const { error } = await db
        .from('payment_run_payouts')
        .update({
          stripe_transfer_id: transfer.id,
          status: 'paid',
          paid_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq('id', row.id);

      if (error) {
        // The money has gone and the row says otherwise, which is the one
        // state that must be loud: it would be re-sent on the next pass were
        // it not for the transfer's idempotency key.
        console.error('[kyro] transfer sent but not recorded', row.id, transfer.id, error);
      }
      summary.paid += 1;
    } catch (e) {
      const reason =
        e instanceof StripeError
          ? e.message
          : 'Could not send this payout. It will be retried.';
      console.error('[kyro] payout failed', row.id, reason);
      await db
        .from('payment_run_payouts')
        .update({ failure_reason: reason.slice(0, 500) })
        .eq('id', row.id);
      summary.failed += 1;
    }
  }

  summary.status = await closeRun(db, runId);
  const { count } = await db
    .from('payment_run_payouts')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .in('status', ['pending', 'skipped']);
  summary.pending = count ?? 0;

  return summary;
}

async function closeRun(db: SupabaseClient, runId: string): Promise<string> {
  const { data, error } = await db.rpc('close_payment_run', { p_run_id: runId });
  if (error) {
    console.error('[kyro] could not close run', runId, error);
    return 'processing';
  }
  return (data as string) ?? 'processing';
}
