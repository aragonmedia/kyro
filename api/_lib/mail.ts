/**
 * Sending mail.
 *
 * One provider, reached over HTTPS, no SDK. Resend's send endpoint is a
 * single POST and an SDK for one call is a dependency to keep updated for
 * nothing.
 *
 * Nothing here throws. A product that cannot send an email should still
 * create the invite, still record the message, still return 200 for the
 * thing the person actually asked for; the mail is a notification about
 * work that already happened, not the work. So every path returns a result
 * saying what happened and the caller decides whether anyone needs to know.
 *
 * With RESEND_API_KEY unset, sending is off and says so. That is the state
 * on every preview deployment and on production until the key is added, and
 * it is deliberately not an error.
 */

export interface SendResult {
  sent: boolean;
  /** Provider id when it went, for matching against their dashboard. */
  id: string | null;
  /** Why not, when it did not. Safe to log, never shown to a visitor. */
  reason: string | null;
}

export interface Outgoing {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Where replies land. Defaults to the sending address. */
  replyTo?: string;
}

/** The address KYRO sends as. A real inbox, so replies reach a person. */
const FROM = process.env.KYRO_MAIL_FROM || 'KYRO <contact@itskyro.com>';

const ENDPOINT = 'https://api.resend.com/emails';

export const mailIsConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(message: Outgoing): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, id: null, reason: 'RESEND_API_KEY is not set, so mail is off.' };
  if (!message.to.includes('@')) return { sent: false, id: null, reason: 'No usable address.' };

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!response.ok) {
      return { sent: false, id: null, reason: `${response.status}: ${body.message ?? 'send refused'}` };
    }
    return { sent: true, id: body.id ?? null, reason: null };
  } catch (e) {
    return { sent: false, id: null, reason: e instanceof Error ? e.message : 'send failed' };
  }
}
