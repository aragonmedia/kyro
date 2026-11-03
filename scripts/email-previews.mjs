/**
 * Regenerate the email previews under email-templates/.
 *
 * shared/email.ts is the only place the markup lives. These files exist so
 * the emails can be opened in a browser, and in a mail client by forwarding
 * them, without deploying anything or waiting for a cron.
 *
 * Run: npm run email:preview
 */

import { build } from 'esbuild';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'email-templates');
const tmp = join(root, 'node_modules', '.kyro-email.mjs');

await build({
  entryPoints: [join(root, 'shared', 'email.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error',
});

const { teamInviteEmail, dailyDigestEmail } = await import(tmp + `?v=${Date.now()}`);

const page = (title, email) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#0b1020;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="color:#64748b;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;">Preview, generated from shared/email.ts</div>
  <div style="color:#e2e8f0;font-size:15px;margin-top:6px;"><span style="color:#64748b;">Subject:</span> ${email.subject}</div>
</div>
${email.html}
</body></html>
`;

const invite = teamInviteEmail({
  inviterName: 'Kevin Aragon',
  brandName: 'Jaje Health',
  roleLabel: 'Manager',
  permissions: ['View campaigns', 'Approve videos', 'Message creators'],
  acceptUrl: 'https://itskyro.com/signin?invite=teammate%40jajehealth.com',
});

const digest = dailyDigestEmail({
  firstName: 'Kevin',
  inboxUrl: 'https://itskyro.com/?tab=chat',
  threads: [
    { title: 'Bold Buns', context: 'KYRO team · support', unread: 3, lastSender: 'Bold Buns',
      lastBody: 'Can we add a second product to the winter campaign?' },
    { title: 'Daily Greens Push', context: 'Jaje Health · everyone on this campaign', unread: 2,
      lastSender: 'creehandle', lastBody: 'Posting the second cut tonight, hook is reshot.' },
    { title: "@mayaonline's video", context: 'Winter Restock · private', unread: 2,
      lastSender: 'mayaonline', lastBody: 'Thanks for the note, re-uploaded with the caption fixed.' },
  ],
});

await mkdir(out, { recursive: true });
await writeFile(join(out, 'preview-team-invite.html'), page('KYRO team invite', invite));
await writeFile(join(out, 'preview-daily-digest.html'), page('KYRO daily digest', digest));
await rm(tmp, { force: true });

console.log('wrote email-templates/preview-team-invite.html and preview-daily-digest.html');
