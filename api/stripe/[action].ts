/**
 * /api/stripe/:action
 *
 *   POST /api/stripe/connect   start or resume a creator's Express onboarding
 *   GET  /api/stripe/status    what Stripe currently says about that creator
 *   POST /api/stripe/setup     brand payment method (unchanged, see _lib)
 *
 * One function for three routes, because Vercel's Hobby plan caps a deployment
 * at twelve and the brand setup route already held a slot. The public URLs are
 * unchanged.
 *
 * Nothing here moves money. Onboarding has to finish, and Stripe has to say
 * payouts are enabled, before a transfer is possible at all.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { stripeConfig } from '../_lib/env.js';
import {
  StripeError,
  createAccountLink,
  createExpressAccount,
  fetchAccount,
  type StripeAccount,
} from '../_lib/stripe.js';
import brandSetup from '../_lib/stripe-brand-setup.js';

type Db = ReturnType<typeof serviceClient>;

interface CreatorRow {
  id: string;
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
): Promise<{ creator?: CreatorRow; email?: string | null; error?: string; status?: number }> {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: 'Not signed in.', status: 401 };

  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return { error: 'Not signed in.', status: 401 };

  const { data, error } = await sb
    .from('creators')
    .select('id, stripe_account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { error: 'Could not read your creator profile.', status: 500 };
  if (!data) return { error: 'This account does not have a creator profile.', status: 403 };

  return { creator: data as CreatorRow, email: userData.user?.email ?? null };
}

/** Write Stripe's answer onto the creator and hand back the shape the app uses. */
async function recordAccount(sb: Db, creatorId: string, account: StripeAccount) {
  const due = account.requirements?.currently_due ?? [];
  const state = {
    stripe_account_id: account.id,
    stripe_payouts_enabled: Boolean(account.payouts_enabled),
    stripe_charges_enabled: Boolean(account.charges_enabled),
    stripe_details_submitted: Boolean(account.details_submitted),
    stripe_requirements_due: due,
    stripe_checked_at: new Date().toISOString(),
  };

  const { error } = await sb.from('creators').update(state).eq('id', creatorId);
  if (error) console.error('[kyro] could not store the stripe account state', error);

  return {
    connected: true,
    accountId: account.id,
    payoutsEnabled: state.stripe_payouts_enabled,
    detailsSubmitted: state.stripe_details_submitted,
    requirementsDue: due,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'setup') return brandSetup(req, res);

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
    if (!accountId) {
      const created = await createExpressAccount(creator.id, who.email);
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
    }

    const { refreshUrl, returnUrl } = stripeConfig();
    const link = await createAccountLink(accountId, refreshUrl, returnUrl);
    return res.status(200).json({ url: link.url });
  } catch (e) {
    if (e instanceof StripeError) {
      console.error('[kyro] stripe error', e.code, e.message);
      return res.status(502).json({ error: 'Stripe could not complete that right now. Try again shortly.' });
    }
    console.error('[kyro] stripe route failed', e);
    return res.status(500).json({ error: 'Something went wrong setting up payouts.' });
  }
}
