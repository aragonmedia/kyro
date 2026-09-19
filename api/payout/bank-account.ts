/**
 * POST /api/payout/bank-account
 *
 * Stores a creator's ACH or wire details.
 *
 * This endpoint exists so the browser never writes bank numbers to Postgres.
 * The creators table is readable by any signed-in user under RLS, and even a
 * creator-only policy would still mean plaintext account numbers sitting in a
 * table a browser key can reach. Instead the numbers come here over TLS, get
 * sealed with AES-256-GCM, and land in creator_payout_accounts, which has RLS
 * on with zero policies and no grants to anon or authenticated.
 *
 * Nothing ever reads the numbers back out to the client. The response carries
 * last four only. When a payout provider is wired in, it reads them
 * server-side once to register the recipient and they stop being needed here.
 *
 * Body: { method, accountHolder, bankName?, routingNumber, accountNumber,
 *         swiftCode?, bankAddress? }
 * Header: Authorization: Bearer <supabase access token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { seal } from '../_lib/crypto.js';

const digitsOnly = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in.' });

    const sb = serviceClient();
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

    // The creator is resolved from the token, never taken from the body.
    // Accepting a creatorId parameter would let any signed-in user overwrite
    // someone else's payout destination, which is as bad as it sounds.
    const { data: creator, error: creatorError } = await sb
      .from('creators')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (creatorError) return res.status(500).json({ error: 'Could not load your creator profile.' });
    if (!creator) return res.status(403).json({ error: 'This account is not a creator.' });

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};

    const method = body.method === 'wire' ? 'wire' : 'ach';
    const accountHolder = String(body.accountHolder ?? '').trim();
    const bankName = String(body.bankName ?? '').trim() || null;
    const routing = digitsOnly(body.routingNumber);
    const account = digitsOnly(body.accountNumber);
    const swift = String(body.swiftCode ?? '').trim().toUpperCase();
    const bankAddress = String(body.bankAddress ?? '').trim() || null;

    if (!accountHolder) {
      return res.status(400).json({ error: 'Enter the name on the account.' });
    }
    // US ABA routing numbers are exactly 9 digits.
    if (method === 'ach' && routing.length !== 9) {
      return res.status(400).json({ error: 'A US routing number is 9 digits.' });
    }
    if (method === 'wire' && (routing.length < 8 || routing.length > 11)) {
      return res.status(400).json({ error: 'Enter the routing or sort code for the receiving bank.' });
    }
    if (account.length < 4 || account.length > 17) {
      return res.status(400).json({ error: 'Enter the full account number.' });
    }
    if (method === 'wire' && swift && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(swift)) {
      return res.status(400).json({ error: 'That SWIFT/BIC code does not look right.' });
    }

    const sealedRouting = seal(routing);
    const sealedAccount = seal(account);
    const sealedSwift = method === 'wire' && swift ? seal(swift) : null;

    const row: Record<string, unknown> = {
      creator_id: creator.id,
      method,
      account_holder: accountHolder,
      bank_name: bankName,
      routing_last4: routing.slice(-4),
      account_last4: account.slice(-4),
      routing_ct: sealedRouting.ct,
      routing_iv: sealedRouting.iv,
      routing_tag: sealedRouting.tag,
      account_ct: sealedAccount.ct,
      account_iv: sealedAccount.iv,
      account_tag: sealedAccount.tag,
      swift_ct: sealedSwift?.ct ?? null,
      swift_iv: sealedSwift?.iv ?? null,
      swift_tag: sealedSwift?.tag ?? null,
      bank_address: bankAddress,
    };

    const { error: saveError } = await sb
      .from('creator_payout_accounts')
      .upsert(row, { onConflict: 'creator_id' });

    if (saveError) {
      console.error('[kyro] could not store payout account', saveError);
      return res.status(500).json({ error: 'Could not save your payout account.' });
    }

    // Mirror the display-safe parts onto creators, which the dashboard can
    // read under normal RLS without ever touching the sealed record.
    const { error: mirrorError } = await sb
      .from('creators')
      .update({
        payout_method: method,
        payout_bank_name: bankName,
        payout_bank_last4: account.slice(-4),
        payout_updated_at: new Date().toISOString(),
      })
      .eq('id', creator.id);

    if (mirrorError) console.error('[kyro] could not mirror payout display fields', mirrorError);

    return res.status(200).json({
      ok: true,
      method,
      bankName,
      accountLast4: account.slice(-4),
    });
  } catch (e) {
    console.error('[kyro] payout/bank-account failed', e);
    return res.status(500).json({ error: 'Something went wrong saving your payout account.' });
  }
}
