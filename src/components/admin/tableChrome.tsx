/**
 * The chrome around an admin table: the search box with its filter chips, and
 * the pager under the rows.
 *
 * Separated from the hook in TableView.tsx only so that each file exports one
 * kind of thing, a hook in one and components in the other, which is what
 * fast refresh needs to swap a component without losing the page's state.
 */

import { Search, X } from 'lucide-react';
import { PAGE_SIZES } from './format';
import type { Filter } from './TableView';

export function TableControls<T>({
  query, onQuery, filters, active, onFilter, total, matched,
}: {
  query: string;
  onQuery: (v: string) => void;
  filters: Filter<T>[];
  active: string | null;
  onFilter: (label: string | null) => void;
  total: number;
  matched: number;
}) {
  const narrowed = matched !== total;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-56 pl-8 pr-8 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder-faint focus:outline-none focus:border-kyro-600"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-heading"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onFilter(null)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              active === null
                ? 'border-transparent bg-gradient-kyro text-white'
                : 'border-line bg-surface-2 text-muted hover:text-heading'
            }`}
          >
            All
          </button>
          {filters.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => onFilter(active === f.label ? null : f.label)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                active === f.label
                  ? 'border-transparent bg-gradient-kyro text-white'
                  : 'border-line bg-surface-2 text-muted hover:text-heading'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {narrowed && (
        <span className="text-xs text-faint ml-auto">
          {matched} of {total}
        </span>
      )}
    </div>
  );
}

export function Pager({
  page, pages, size, onSize, onPage, from, to, total,
}: {
  page: number; pages: number; size: number;
  onSize: (n: number) => void; onPage: (n: number) => void;
  from: number; to: number; total: number;
}) {
  // Nothing to page through and nothing to configure: say nothing.
  if (total <= PAGE_SIZES[0]) return null;

  return (
    <div className="p-4 border-t border-line flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Rows per page</span>
        <select
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="bg-surface-2 border border-line rounded-lg px-2 py-1 text-heading focus:outline-none focus:border-kyro-600"
        >
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-faint">Showing {from}–{to} of {total}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(Math.max(page - 1, 0))}
          disabled={page === 0}
          className="px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-body hover:text-heading disabled:opacity-40 disabled:hover:text-body"
        >
          Previous
        </button>
        <span className="px-2 text-xs text-faint tabular-nums">{page + 1} / {pages}</span>
        <button
          type="button"
          onClick={() => onPage(Math.min(page + 1, pages - 1))}
          disabled={page >= pages - 1}
          className="px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-body hover:text-heading disabled:opacity-40 disabled:hover:text-body"
        >
          Next
        </button>
      </div>
    </div>
  );
}
