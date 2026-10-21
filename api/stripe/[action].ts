/**
 * /api/stripe/:action
 *
 *   POST /api/stripe/connect   start or resume a creator's Express onboarding
 *   GET  /api/stripe/status    what Stripe currently says about that creator
 *   POST /api/stripe/setup     start a brand's hosted payment-method setup
 *   GET  /api/stripe/method    record the method they just saved
 *   POST /api/stripe/pay       charge a payment run and pay the creators
 *   GET  /api/stripe/settle    finish runs whose bank debit has now cleared
 *
 * One function for six routes, because Vercel's Hobby plan caps a deployment
 * at twelve. The public URLs are unaffected.
 *
 * This is where money moves, so two rules hold throughout. Every write to
 * Stripe carries an idempotency key derived from the row it belongs to, so a
 * retry cannot double anything. And a charge that does not go through reverts
 * the run, so nothing is ever left marked paid that nobody paid for.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { stripeConfig } from '../_lib/env.js';
import {
  StripeError,
  createAccountLink,
  createRecipientAccount,
  fetchAccount,
  readReadiness,
  type StripeAccountV2,
} from '../_lib/stripe.js';
import brandSetup from '../_lib/stripe-brand-setup.js';
import { chargeRun, fetchCharge, readSavedMethod } from '../_lib/stripe-billing.js';
import { payOutRun } from '../_lib/payment-run.js';

type Db = ReturnType<typeof serviceClient>;

interface CreatorRow {
  id: string;
  handle: string | null;
  stripe_account_id: string | null;
}

/**
 * The creator making the request, resolved from their own token rather than
 * from anything in the body. A creator id in a request body is a suggestion,
 * not a fact.
 */
async function currentCreator(
  sb: Db,
  req: VercelRequest
): Promise<{ creator?: CreatorRow; email?: string | null; handle?: string | null; error?: string; status?: number }> {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: 'Not signed in.', status: 401 };

  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return { error: 'Not signed in.', status: 401 };

  const { data, error } = await sb
    .from('creators')
    .select('id, handle, stripe_account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { error: 'Could not read your creator profile.', status: 500 };
  if (!data) return { error: 'This account does not have a creator profile.', status: 403 };

  const row = data as CreatorRow;
  // Stripe surfaces display_name to the creator during onboarding, so their
  // own handle reads better there than a UUID.
  return { creator: row, email: userData.user?.email ?? null, handle: row.handle };
}

/** Write Stripe's answer onto the creator and hand back the shape the app uses. */
async function recordAccount(sb: Db, creatorId: string, account: StripeAccountV2) {
  const ready = readReadiness(account);

  const state = {
    stripe_account_id: ready.accountId,
    stripe_payouts_enabled: ready.transfersActive,
    // Recipient-only accounts never take payments, so this stays false by
    // design rather than by omission.
    stripe_charges_enabled: false,
    // v2 has no details_submitted flag. Nothing outstanding that blocks a
    // capability is the closest honest equivalent.
    stripe_details_submitted: ready.requirementsDue.length === 0,
    stripe_requirements_due: ready.requirementsDue,
    stripe_checked_at: new Date().toISOString(),
  };

  const { error } = await sb.from('creators').update(state).eq('id', creatorId);
  if (error) console.error('[kyro] could not store the stripe account state', error);

  return {
    connected: true,
    accountId: ready.accountId,
    payoutsEnabled: ready.transfersActive,
    detailsSubmitted: state.stripe_details_submitted,
    requirementsDue: ready.requirementsDue,
  };
}

/**
 * The brand the caller owns, or nothing.
 *
 * A brand id in a request is a suggestion. This turns it into a fact, or
 * refuses, and every brand-side route goes through it.
 */
async function ownedBrand(
  sb: Db,
  req: VercelRequest,
  brandId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return { ok: false, status: 401, error: 'Not signed in.' };

  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) return { ok: false, status: 401, error: 'Not signed in.' };

  const { data: brand } = await sb
    .from('brands')
    .select('id, owner_user_id')
    .eq('id', brandId)
    .maybeSingle();

  if (!brand || brand.owner_user_id !== userId) {
    return { ok: false, status: 403, error: 'That brand is not yours.' };
  }
  return { ok: true };
}

/**
 * GET /api/stripe/method?brandId=…&session=cs_…
 *
 * Records the payment method a brand just saved, after reading the completed
 * Checkout session back from Stripe. A browser arriving at a success URL
 * proves nothing by itself, so the server asks Stripe what actually happened.
 */
async function brandMethod(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  const sessionId = typeof req.query.session === 'string' ? req.query.session : '';
  if (!brandId || !sessionId) return res.status(400).json({ error: 'Missing brand or session.' });

  const sb = serviceClient();
  const owns = await ownedBrand(sb, req, brandId);
  if (!owns.ok) return res.status(owns.status).json({ error: owns.error });

  try {
    const saved = await readSavedMethod(sessionId);
    if (!saved) {
      return res.status(200).json({ saved: false });
    }

    const update: Record<string, unknown> = {
      stripe_payment_method_id: saved.paymentMethodId,
      stripe_method_type: saved.type,
      stripe_method_brand: saved.brand,
      stripe_method_last4: saved.last4,
      stripe_method_at: new Date().toISOString(),
    };
    // ach_mandate_ref predates Stripe here and still gates paymentReady for
    // bank methods. Keep it in step rather than leaving it lying.
    if (saved.type === 'us_bank_account') update.ach_mandate_ref = saved.paymentMethodId;

    const { error } = await sb.from('brand_billing').update(update).eq('brand_id', brandId);
    if (error) {
      console.error('[kyro] could not store the brand payment method', error);
      return res.status(500).json({ error: 'Stripe saved your method but KYRO could not record it.' });
    }

    return res.status(200).json({
      saved: true,
      type: saved.type,
      brand: saved.brand,
      last4: saved.last4,
    });
  } catch (e) {
    if (e instanceof StripeError) {
      console.error('[kyro] stripe method read failed', e.code, e.message);
      return res.status(502).json({ error: 'Could not confirm that with Stripe. Try again shortly.' });
    }
    console.error('[kyro] stripe/method failed', e);
    return res.status(500).json({ error: 'Could not record your payment method.' });
  }
}

/**
 * POST /api/stripe/pay  { brandId }
 *
 * Pay everything currently due, in one request: authorise the run, charge the
 * brand, and send each creator their share.
 *
 * One request rather than two on purpose. Authorising marks the earnings paid
 * so a second click cannot pay them again, which means a run that is
 * authorised and never charged leaves a brand looking settled for orders
 * nobody was charged for. If the charge fails, the run is reverted here before
 * the response is written.
 *
 * A card charge clears in this request, so the payouts go out in it too. A
 * bank debit takes days; the run stays `processing` and the cron below pays it
 * out once Stripe says the money has landed.
 */
async function brandPay(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = (req.body ?? {}) as { brandId?: string };
  const brandId = typeof body.brandId === 'string' ? body.brandId : '';
  if (!brandId) return res.status(400).json({ error: 'Missing brand.' });

  const sb = serviceClient();
  const owns = await ownedBrand(sb, req, brandId);
  if (!owns.ok) return res.status(owns.status).json({ error: owns.error });

  // The method has to be on file before anything is authorised. Authorising
  // first would mark earnings paid only to fail on a missing card.
  const { data: billing } = await sb
    .from('brand_billing')
    .select('stripe_customer_id, stripe_payment_method_id, stripe_method_type')
    .eq('brand_id', brandId)
    .maybeSingle();

  const customerId = (billing?.stripe_customer_id as string | null) ?? null;
  const methodId = (billing?.stripe_payment_method_id as string | null) ?? null;
  const methodType = (billing?.stripe_method_type as string | null) ?? 'card';
  if (!customerId || !methodId) {
    return res.status(400).json({ error: 'Add a payment method before paying a run.' });
  }

  const { data: runId, error: runError } = await sb.rpc('authorize_payment_run_for', {
    p_brand_id: brandId,
    p_method: methodType === 'us_bank_account' ? 'ach' : 'card',
  });
  if (runError || !runId) {
    // 'Nothing is due right now.' is the common one and is the brand's answer,
    // not a server fault.
    const message = runError?.message || 'Could not authorise that payment.';
    const status = /nothing is due/i.test(message) ? 400 : 500;
    if (status === 500) console.error('[kyro] could not authorise a run', runError);
    return res.status(status).json({ error: message });
  }

  const { data: run } = await sb
    .from('payment_runs')
    .select('id, total_cents, commission_cents, order_count, creator_count')
    .eq('id', runId as string)
    .single();

  const amount = Number(run?.total_cents ?? 0);
  if (amount <= 0) {
    await sb.rpc('fail_payment_run', {
      p_run_id: runId as string,
      p_reason: 'The run came to nothing, so no charge was made.',
    });
    return res.status(400).json({ error: 'Nothing is due right now.' });
  }

  let charge;
  try {
    charge = await chargeRun({
      runId: runId as string,
      customerId,
      paymentMethodId: methodId,
      methodType,
      amountCents: amount,
      description: `KYRO creator commission, ${run?.order_count ?? 0} orders`,
    });
  } catch (e) {
    const reason = e instanceof StripeError ? e.message : 'The charge did not go through.';
    console.error('[kyro] run charge failed', runId, reason);
    await sb.rpc('fail_payment_run', { p_run_id: runId as string, p_reason: reason });
    return res.status(402).json({ error: reason, runId });
  }

  await sb
    .from('payment_runs')
    .update({
      stripe_payment_intent_id: charge.id,
      stripe_charge_id: charge.chargeId,
      status: 'processing',
    })
    .eq('id', runId as string);

  // requires_action means a card wants the brand present to authenticate, and
  // nothing has been taken. Revert rather than leave it half done.
  if (charge.status !== 'succeeded' && charge.status !== 'processing') {
    const reason =
      charge.status === 'requires_action'
        ? 'Your bank wants to verify this payment. Add a different method or try again from the Stripe email.'
        : `Stripe left the charge as ${charge.status}.`;
    await sb.rpc('fail_payment_run', { p_run_id: runId as string, p_reason: reason });
    return res.status(402).json({ error: reason, runId });
  }

  // A bank debit is still clearing. The money has not reached KYRO, so there
  // is nothing to transfer yet.
  if (charge.status === 'processing') {
    return res.status(200).json({
      runId,
      charged: true,
      settling: true,
      amountCents: amount,
      message: 'Your bank payment is on its way. Creators are paid as soon as it clears, usually within a few business days.',
    });
  }

  const payout = await payOutRun(sb, runId as string);
  const settled = payout.status === 'settled';
  return res.status(200).json({
    runId,
    charged: true,
    settling: !settled,
    amountCents: amount,
    paid: payout.paid,
    skipped: payout.skipped,
    pending: payout.pending,
    message: settled
      ? `Paid ${payout.paid} creator${payout.paid === 1 ? '' : 's'}.`
      : payout.halted ??
        (payout.skipped > 0
          ? `Paid ${payout.paid}. ${payout.skipped} creator${payout.skipped === 1 ? ' has' : 's have'} not set up payouts yet, so their share is being held for them.`
          : 'Some payouts are still on their way.'),
  });
}

/**
 * GET /api/stripe/settle
 *
 * The other half of a bank debit. Finds runs charged but not yet paid out,
 * asks Stripe whether the money has landed, and sends the transfers.
 *
 * Called on the schedule in vercel.json with CRON_SECRET as a bearer token,
 * the same contract as /api/cron/usage. Safe to run as often as it is called:
 * every step is keyed so nothing is sent twice.
 */
async function settleRuns(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET is not set, so this endpoint is disabled.' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorised.' });
  }

  const sb = serviceClient();
  const { data: runs, error } = await sb
    .from('payment_runs')
    .select('id, stripe_payment_intent_id')
    .eq('status', 'processing')
    .not('stripe_payment_intent_id', 'is', null)
    .order('authorized_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[kyro] settle: could not list runs', error);
    return res.status(500).json({ error: 'Could not list runs.' });
  }

  const summary = { looked: (runs ?? []).length, paid: 0, waiting: 0, failed: 0, settled: 0 };

  for (const row of (runs ?? []) as Array<{ id: string; stripe_payment_intent_id: string }>) {
    try {
      const charge = await fetchCharge(row.stripe_payment_intent_id);

      if (charge.status === 'processing' || charge.status === 'requires_capture') {
        summary.waiting += 1;
        continue;
      }

      if (charge.status !== 'succeeded') {
        // A bank debit can bounce days later. The earnings go back to
        // available so the brand can pay them with a working method.
        await sb.rpc('fail_payment_run', {
          p_run_id: row.id,
          p_reason: `The bank payment did not complete (${charge.status}).`,
        });
        summary.failed += 1;
        continue;
      }

      if (!charge.chargeId) {
        summary.waiting += 1;
        continue;
      }

      const payout = await payOutRun(sb, row.id);
      summary.paid += payout.paid;
      if (payout.status === 'settled') summary.settled += 1;
      else summary.waiting += 1;
    } catch (e) {
      const reason = e instanceof StripeError ? e.message : 'Could not check this run.';
      console.error('[kyro] settle: run failed', row.id, reason);
      summary.waiting += 1;
    }
  }

  return res.status(200).json(summary);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'setup') return brandSetup(req, res);
  if (action === 'method') return brandMethod(req, res);
  if (action === 'pay') return brandPay(req, res);
  if (action === 'settle') return settleRuns(req, res);

  if (action !== 'connect' && action !== 'status') {
    return res.status(404).json({ error: 'Not found.' });
  }

  try {
    const sb = serviceClient();
    const who = await currentCreator(sb, req);
    if (who.error || !who.creator) {
      return res.status(who.status ?? 400).json({ error: who.error });
    }
    const creator = who.creator;

    if (action === 'status') {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed.' });
      }
      if (!creator.stripe_account_id) {
        return res.status(200).json({ connected: false, payoutsEnabled: false, requirementsDue: [] });
      }
      // Read from Stripe rather than trusting the stored copy. Verification
      // finishes on Stripe's clock, not on ours, and a creator refreshing this
      // page is usually asking precisely whether that has happened yet.
      const account = await fetchAccount(creator.stripe_account_id);
      return res.status(200).json(await recordAccount(sb, creator.id, account));
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    let accountId = creator.stripe_account_id;
    let alreadyActive = false;

    if (!accountId) {
      const created = await createRecipientAccount(creator.id, who.email, who.handle);
      accountId = created.id;
      const { error } = await sb
        .from('creators')
        .update({ stripe_account_id: accountId, stripe_checked_at: new Date().toISOString() })
        .eq('id', creator.id);
      // Losing this write would orphan a Stripe account and make the next
      // click create a second one, so it fails loudly rather than carrying on.
      if (error) {
        console.error('[kyro] could not store the new stripe account', error);
        return res.status(500).json({ error: 'Could not save your payout account. Nothing was charged.' });
      }
    } else {
      // A creator who is already payable and comes back is editing, not
      // onboarding. Stripe shows a different flow for each.
      const existing = await fetchAccount(accountId);
      alreadyActive = readReadiness(existing).transfersActive;
    }

    const { refreshUrl, returnUrl } = stripeConfig();
    const link = await createAccountLink(
      accountId,
      refreshUrl,
      returnUrl,
      alreadyActive ? 'account_update' : 'account_onboarding'
    );
    return res.status(200).json({ url: link.url });
  } catch (e) {
    if (e instanceof StripeError) {
      console.error('[kyro] stripe error', e.code, e.message);
      // The code travels with the message. A creator cannot act on it, but it
      // is the difference between "try again shortly" sending us to the logs
      // and telling us which call broke, and Hobby keeps logs for an hour.
      return res.status(502).json({
        error: 'Stripe could not complete that right now. Try again shortly.',
        code: e.code ?? null,
      });
    }
    console.error('[kyro] stripe route failed', e);
    return res.status(500).json({ error: 'Something went wrong setting up payouts.' });
  }
}
