/**
 * POST /api/email/invite   one teammate, one invitation
 * GET  /api/email/digest   everyone's unread messages, once a day
 *
 * Both live behind one route because a Vercel Hobby project gets twelve
 * serverless functions and KYRO is at the limit. Two actions under one
 * handler cost one; two files cost two and one of them would not deploy.
 *
 * Neither action is load bearing. The invite row is written by the browser
 * before this is called, and the messages were already delivered in the
 * product; these emails are how somebody finds out, not how anything
 * happens. So a send that fails is reported and never rolled back into an
 * error the person has to care about.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { appOrigin } from '../_lib/env.js';
import { mailIsConfigured, sendEmail } from '../_lib/mail.js';
import { dailyDigestEmail, teamInviteEmail, type DigestThread } from '../../shared/email.js';

/** Digest rows per run. Generous at this size, and bounded on purpose. */
const MAX_RECIPIENTS = 500;
/** Threads listed in one digest. Past this the email is a wall, not a nudge. */
const MAX_THREADS_SHOWN = 8;

interface DigestRow {
  user_id: string;
  email: string;
  full_name: string | null;
  thread_id: string;
  kind: string;
  unread: number;
  thread_title: string;
  thread_context: string;
  last_sender: string | null;
  last_body: string | null;
}

const firstNameOf = (fullName: string | null, email: string): string | null => {
  const named = (fullName ?? '').trim().split(/\s+/)[0];
  if (named) return named;
  const local = email.split('@')[0] ?? '';
  // An email local part is a handle, not a name. Better no greeting than
  // "Hi aragonkevin239".
  return /^[a-z]+$/i.test(local) && local.length <= 12 ? local : null;
};

/* ─────────────────────────────────────────────────────────────
   Invite
   ───────────────────────────────────────────────────────────── */

async function sendInvite(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  const brandId = typeof body.brandId === 'string' ? body.brandId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!brandId || !email.includes('@')) return res.status(400).json({ error: 'Missing brand or address.' });

  // Who is inviting, from their own token. A brand id in a body is a claim.
  const auth = req.headers.authorization ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Not signed in.' });

  const sb = serviceClient();
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

  const { data: brand } = await sb
    .from('brands')
    .select('id, name, owner_user_id')
    .eq('id', brandId)
    .maybeSingle();

  if (!brand || brand.owner_user_id !== userId) {
    return res.status(403).json({ error: 'That brand is not yours to invite for.' });
  }

  /* The row is the invite. This endpoint only tells somebody about it, so a
     request naming an address with nothing waiting for it is refused:
     otherwise this is an open relay for whoever owns a brand. */
  const { data: member } = await sb
    .from('brand_members')
    .select('id, email, role, permissions, status')
    .eq('brand_id', brandId)
    .eq('status', 'invited')
    .ilike('email', email)
    .maybeSingle();

  if (!member) return res.status(404).json({ error: 'No pending invite for that address.' });

  const { data: inviter } = await sb
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();

  const inviterName =
    (inviter?.full_name as string | null)?.trim() ||
    (brand.name as string) ||
    'Someone at your brand';

  const message = teamInviteEmail({
    inviterName,
    brandName: (brand.name as string) ?? 'a brand',
    roleLabel: String(member.role ?? 'Teammate'),
    permissions: Array.isArray(member.permissions) ? (member.permissions as string[]) : [],
    acceptUrl: `${appOrigin()}/signin?invite=${encodeURIComponent(email)}`,
  });

  const sent = await sendEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: (inviter?.email as string | null) ?? undefined,
  });

  if (!sent.sent) console.warn('[kyro] invite email not sent', email, sent.reason);

  // 200 either way. The seat exists; whether the email went is information,
  // not a failure of the thing the brand asked for.
  return res.status(200).json({ sent: sent.sent, reason: sent.reason });
}

/* ─────────────────────────────────────────────────────────────
   Digest
   ───────────────────────────────────────────────────────────── */

async function sendDigests(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not set, so this endpoint is disabled.' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not authorised.' });

  if (!mailIsConfigured()) {
    return res.status(200).json({ recipients: 0, sent: 0, note: 'Mail is off: RESEND_API_KEY is not set.' });
  }

  const sb = serviceClient();
  const { data, error } = await sb.rpc('pending_message_digests');
  if (error) {
    console.error('[kyro] could not read pending digests', error);
    return res.status(500).json({ error: 'Could not read what is waiting.' });
  }

  // One email per person, not per thread.
  const byUser = new Map<string, DigestRow[]>();
  for (const row of (data ?? []) as DigestRow[]) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row);
    else byUser.set(row.user_id, [row]);
  }

  let sent = 0;
  let failed = 0;

  for (const rows of [...byUser.values()].slice(0, MAX_RECIPIENTS)) {
    const first = rows[0];
    if (!first) continue;

    const threads: DigestThread[] = rows.slice(0, MAX_THREADS_SHOWN).map((r) => ({
      title: r.thread_title,
      context: r.thread_context,
      unread: Number(r.unread ?? 0),
      lastSender: r.last_sender,
      lastBody: r.last_body,
    }));

    const message = dailyDigestEmail({
      firstName: firstNameOf(first.full_name, first.email),
      threads,
      inboxUrl: `${appOrigin()}/?tab=chat`,
    });

    const result = await sendEmail({
      to: first.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result.sent) sent += 1;
    else {
      failed += 1;
      console.warn('[kyro] digest not sent', first.email, result.reason);
    }
  }

  return res.status(200).json({ recipients: byUser.size, sent, failed });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'invite') return sendInvite(req, res);
  if (action === 'digest') return sendDigests(req, res);

  return res.status(404).json({ error: 'Unknown action.' });
}
