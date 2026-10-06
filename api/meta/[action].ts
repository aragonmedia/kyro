/**
 * /api/meta/:action
 *
 * One function serving three routes.
 *
 * Vercel's Hobby plan caps a deployment at 12 serverless functions, and three
 * separate Meta endpoints put this project at 13, which failed the build. A
 * dynamic route is a single function, so install, callback and accounts are
 * dispatched from here and their handlers live under api/_lib/, which Vercel
 * excludes from the function count.
 *
 * The public URLs do not change. /api/meta/install, /api/meta/callback and
 * /api/meta/accounts all still resolve, which matters because the callback URL
 * is registered with Meta and must not drift.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import install from '../_lib/meta-install.js';
import callback from '../_lib/meta-callback.js';
import accounts from '../_lib/meta-accounts.js';

type Handler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;

const routes: Record<string, Handler> = { install, callback, accounts };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  const route = action ? routes[action] : undefined;

  if (!route) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  await route(req, res);
}
