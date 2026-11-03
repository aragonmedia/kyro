/**
 * KYRO: the emails KYRO sends
 *
 * One source for the markup, read by the sending endpoint and by the script
 * that regenerates the previews under email-templates/. Two copies of an
 * email template drift, and the copy that drifts is always the one nobody
 * opened in a client.
 *
 * Table markup and inline styles throughout, because mail clients are not
 * browsers: no flexbox, no grid, no external stylesheet, no web font.
 */

export interface Email {
  subject: string;
  html: string;
  /** Plain text alternative. Clients that cannot render HTML still get sense. */
  text: string;
}

const BG = '#0b1020';
const CARD = '#0f172a';
const LINE = '#1f2a44';
const INNER = '#0b1224';
const INNER_LINE = '#2a3352';
const WHITE = '#ffffff';
const MUTED = '#94a3b8';
const FAINT = '#64748b';
const ACCENT = '#a888ff';
const BUTTON = '#7c5cff';

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const shell = (inner: string, footnote: string, links: string): string => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:${BG};">
  <tr>
    <td align="center" style="padding:32px 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${CARD};border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:26px 32px;border-bottom:1px solid ${LINE};">
            <img src="https://itskyro.com/kyro-logo.png" width="34" height="34" alt="KYRO" style="vertical-align:middle;border-radius:8px;display:inline-block;" />
            <span style="vertical-align:middle;color:${WHITE};font-size:22px;font-weight:700;letter-spacing:1px;margin-left:10px;">KYRO</span>
          </td>
        </tr>
        ${inner}
        <tr>
          <td style="padding:22px 32px;border-top:1px solid ${LINE};">
            <p style="margin:0 0 6px;color:${FAINT};font-size:12px;">${links}</p>
            <p style="margin:0;color:#475569;font-size:12px;">© 2026 KYRO. The Creator Growth Portal.</p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;color:#334155;font-size:11px;">${footnote}</p>
    </td>
  </tr>
</table>`;

const button = (href: string, label: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;">
  <tr>
    <td style="background:${BUTTON};border-radius:12px;">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;color:${WHITE};font-size:15px;font-weight:700;text-decoration:none;">${esc(label)}</a>
    </td>
  </tr>
</table>`;

const link = (href: string, label: string): string =>
  `<a href="${esc(href)}" style="color:${ACCENT};text-decoration:none;">${esc(label)}</a>`;

/* ─────────────────────────────────────────────────────────────
   Team invite
   ───────────────────────────────────────────────────────────── */

export interface TeamInvite {
  inviterName: string;
  brandName: string;
  roleLabel: string;
  permissions: string[];
  /** Where they go to accept. Signing in with this address claims the seat. */
  acceptUrl: string;
}

export function teamInviteEmail(i: TeamInvite): Email {
  const perms = i.permissions.length ? i.permissions.join(', ') : 'No permissions set yet';

  const inner = `
    <tr>
      <td style="padding:34px 32px 28px;">
        <h1 style="margin:0 0 8px;color:${WHITE};font-size:24px;font-weight:700;">${esc(i.inviterName)} added you to ${esc(i.brandName)}</h1>
        <p style="margin:0 0 26px;color:${MUTED};font-size:15px;line-height:1.6;">
          You now have a seat on ${esc(i.brandName)}'s team on KYRO, where the brand runs its creator campaigns and sees what each video sold.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INNER};border:1px solid ${INNER_LINE};border-radius:14px;">
          <tr>
            <td style="padding:22px 24px;">
              <div style="color:${ACCENT};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Your access</div>
              <div style="color:${WHITE};font-size:17px;font-weight:700;margin-bottom:6px;">${esc(i.roleLabel)}</div>
              <div style="color:${MUTED};font-size:14px;line-height:1.6;">${esc(perms)}</div>
            </td>
          </tr>
        </table>
        ${button(i.acceptUrl, 'Accept and sign in')}
        <p style="margin:22px 0 0;color:${FAINT};font-size:13px;line-height:1.6;">
          Sign in with this email address and the seat is yours. If you do not have a KYRO account, create one with this address and it links on the way in. If you were not expecting this, ignore it: nothing happens until you sign in.
        </p>
      </td>
    </tr>`;

  const links = [
    link('https://itskyro.com/signin', 'Sign in'),
    link('https://itskyro.com/help', 'Help'),
    link('https://itskyro.com/privacy', 'Privacy'),
    link('https://itskyro.com/terms', 'Terms'),
  ].join('&nbsp;·&nbsp;');

  return {
    subject: `${i.inviterName} added you to ${i.brandName} on KYRO`,
    html: shell(inner, "You're receiving this because someone added this address to a brand team on KYRO.", links),
    text: [
      `${i.inviterName} added you to ${i.brandName} on KYRO.`,
      '',
      `Your access: ${i.roleLabel}`,
      perms,
      '',
      `Accept and sign in: ${i.acceptUrl}`,
      '',
      'Sign in with this email address and the seat is yours. If you were not expecting this, ignore it.',
    ].join('\n'),
  };
}

/* ─────────────────────────────────────────────────────────────
   End of day digest
   ───────────────────────────────────────────────────────────── */

export interface DigestThread {
  title: string;
  context: string;
  unread: number;
  lastSender: string | null;
  lastBody: string | null;
}

export interface Digest {
  firstName: string | null;
  threads: DigestThread[];
  inboxUrl: string;
}

export function dailyDigestEmail(d: Digest): Email {
  const total = d.threads.reduce((sum, t) => sum + t.unread, 0);
  const greeting = d.firstName ? `, ${esc(d.firstName)}` : '';
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  const rows = d.threads
    .map(
      (t) => `
    <tr>
      <td style="padding:0 32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INNER};border:1px solid ${INNER_LINE};border-radius:14px;">
          <tr>
            <td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:${WHITE};font-size:15px;font-weight:700;">${esc(t.title)}</td>
                  <td align="right" style="color:${ACCENT};font-size:12px;font-weight:700;">${t.unread} new</td>
                </tr>
              </table>
              <div style="color:${FAINT};font-size:12px;margin:4px 0 10px;">${esc(t.context)}</div>
              <div style="color:${MUTED};font-size:14px;line-height:1.6;"><span style="color:#cbd5e1;font-weight:600;">${esc(t.lastSender ?? 'Someone')}:</span> ${esc(t.lastBody ?? '')}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('');

  const inner = `
    <tr>
      <td style="padding:34px 32px 10px;">
        <h1 style="margin:0 0 8px;color:${WHITE};font-size:24px;font-weight:700;">${total} ${plural(total, 'message', 'messages')} waiting</h1>
        <p style="margin:0 0 24px;color:${MUTED};font-size:15px;line-height:1.6;">
          Here is what came in today across ${d.threads.length} ${plural(d.threads.length, 'conversation', 'conversations')}${greeting}. One email a day, never one per message.
        </p>
      </td>
    </tr>
    ${rows}
    <tr>
      <td style="padding:14px 32px 28px;">
        ${button(d.inboxUrl, 'Open your inbox').replace('margin:26px 0 0', 'margin:0')}
      </td>
    </tr>`;

  const links = [
    link(d.inboxUrl, 'Inbox'),
    link('https://itskyro.com/help', 'Help'),
    link('https://itskyro.com/privacy', 'Privacy'),
  ].join('&nbsp;·&nbsp;');

  return {
    subject: `${total} ${plural(total, 'message', 'messages')} waiting on KYRO`,
    html: shell(inner, 'One daily summary of unread KYRO messages. Turn it off any time in Account, Notifications.', links),
    text: [
      `${total} ${plural(total, 'message', 'messages')} waiting on KYRO.`,
      '',
      ...d.threads.map((t) => `${t.title} (${t.unread} new) · ${t.context}\n${t.lastSender ?? 'Someone'}: ${t.lastBody ?? ''}`),
      '',
      `Open your inbox: ${d.inboxUrl}`,
    ].join('\n'),
  };
}
