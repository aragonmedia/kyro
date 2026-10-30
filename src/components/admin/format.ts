/**
 * Formatting shared by the admin sections.
 *
 * Kept apart from the components so that shared.tsx exports components only:
 * mixing the two breaks fast refresh, and these have no JSX in them anyway.
 */

export const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const moneyExact = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const pct = (bps: number | null) =>
  bps === null ? '-' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

export const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

export const count = (n: number) => n.toLocaleString('en-US');

/** Today, for naming an export. A file called kyro-brands.csv in a downloads
    folder next to four others is unidentifiable a week later. */
export const stamp = () => new Date().toISOString().slice(0, 10);

/** Cents to a bare number a spreadsheet will treat as money. */
export const usd = (cents: number) => (cents / 100).toFixed(2);

/** How many rows a table shows at once. The first is the default, and a list
    shorter than it hides the pager entirely. */
export const PAGE_SIZES = [20, 50, 100] as const;

/* The four reserved status meanings, on the theme tokens so they are correct
   in light and dark rather than tuned for one of them. Each is always paired
   with a word; none of them carries meaning by colour alone. */
export const TONE = {
  good: 'border-good/30 bg-good-soft text-good',
  warn: 'border-warn/30 bg-warn-soft text-warn',
  bad: 'border-bad/30 bg-bad-soft text-bad',
  idle: 'border-line bg-surface-2 text-muted',
};

