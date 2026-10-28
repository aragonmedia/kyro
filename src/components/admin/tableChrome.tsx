/**
 * The chrome around an admin table: the search box, the filter menu and its
 * chips, the saved views, the column switches, the bulk bar and the pager.
 *
 * Separated from the hook in TableView.tsx so each file exports one kind of
 * thing, a hook in one and components in the other, which is what fast
 * refresh needs in order to swap a component without dropping the page's
 * state.
 *
 * The filter menu is two panels rather than nested submenus: pick a field,
 * then pick a value, with a way back. Nested menus are a mouse-only pattern
 * and this gets opened on a phone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark, ChevronLeft, Columns3, Download, ListFilter, Mail, Search, Trash2, X,
} from 'lucide-react';
import { PAGE_SIZES } from './format';
import type { Column, FilterField } from './TableView';
import type { Applied, SavedView } from './views';

/** Addresses beyond this in one mailto are more than a mail client will take. */
const MAIL_LIMIT = 40;

/* ── A dropdown that closes when you click away ──────────────── */

function Menu({
  label, icon: Icon, badge, children, align = 'left', onClosed,
}: {
  label: string;
  icon: typeof Mail;
  badge?: number;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  /** Lets the owner forget where you were, so it reopens at the top. */
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* Held in a ref so closing does not have to be rebound every render. */
  const closed = useRef(onClosed);
  closed.current = onClosed;

  const shut = useCallback(() => { setOpen(false); closed.current?.(); }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) shut();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, shut]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => (open ? shut() : setOpen(true))}
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition ${
          open ? 'border-kyro-600 bg-surface-2 text-heading' : 'border-line bg-surface-2 text-body hover:text-heading'
        }`}
      >
        <Icon size={13} /> {label}
        {badge ? <span className="ml-0.5 px-1.5 rounded-full bg-gradient-kyro text-white text-[10px]">{badge}</span> : null}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface shadow-xl p-1.5 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(shut)}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  onClick, children, right,
}: {
  onClick: () => void; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className="flex-1 text-left px-2.5 py-2 rounded-lg text-xs text-body hover:bg-surface-2 hover:text-heading truncate"
      >
        {children}
      </button>
      {right}
    </div>
  );
}

/* ── The controls above a table ──────────────────────────────── */

export function TableControls<T>({
  rows, fields, applied, onAdd, onDrop, onClearFilters,
  query, onQuery, columns, off, onColumn,
  views, onApplyView, onSaveView, onDeleteView, total, matched,
}: {
  rows: T[];
  fields: FilterField<T>[];
  applied: Applied[];
  onAdd: (field: string, value: string) => void;
  onDrop: (field: string, value: string) => void;
  onClearFilters: () => void;
  query: string;
  onQuery: (v: string) => void;
  columns: Column<T>[];
  off: Set<string>;
  onColumn: (columnId: string) => void;
  views: SavedView[];
  onApplyView: (view: SavedView) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (name: string) => void;
  total: number;
  matched: number;
}) {
  const [field, setField] = useState<FilterField<T> | null>(null);
  const [valueQuery, setValueQuery] = useState('');
  const [viewName, setViewName] = useState('');

  const labelOf = (fieldId: string) => fields.find((f) => f.id === fieldId)?.label ?? fieldId;
  const narrowed = matched !== total;
  const shownColumns = columns.filter((c) => !off.has(c.id)).length;

  return (
    <div className="space-y-3">
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

        {fields.length > 0 && (
          <Menu
            label="Filter"
            icon={ListFilter}
            badge={applied.length || undefined}
            onClosed={() => setField(null)}
          >
            {() => (field === null ? (
              <>
                {fields.map((f) => (
                  <MenuRow key={f.id} onClick={() => { setField(f); setValueQuery(''); }}>
                    {f.label}
                  </MenuRow>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setField(null)}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-muted hover:text-heading hover:bg-surface-2"
                >
                  <ChevronLeft size={13} /> {field.label}
                </button>
                <input
                  value={valueQuery}
                  onChange={(e) => setValueQuery(e.target.value)}
                  placeholder="Search options…"
                  className="w-full my-1 px-2.5 py-1.5 bg-surface-2 border border-line rounded-lg text-xs text-heading placeholder-faint focus:outline-none focus:border-kyro-600"
                />
                {(() => {
                  const values = field.values(rows)
                    .filter((v) => v.toLowerCase().includes(valueQuery.trim().toLowerCase()));
                  if (values.length === 0) {
                    return <p className="px-2.5 py-3 text-xs text-faint">Nothing to filter by here yet.</p>;
                  }
                  return values.slice(0, 60).map((v) => {
                    const on = applied.some((a) => a.field === field.id && a.value === v);
                    return (
                      <MenuRow
                        key={v}
                        onClick={() => (on ? onDrop(field.id, v) : onAdd(field.id, v))}
                      >
                        <span className={on ? 'text-heading font-semibold' : ''}>
                          {on ? '✓ ' : ''}{v}
                        </span>
                      </MenuRow>
                    );
                  });
                })()}
              </>
            ))}
          </Menu>
        )}

        <Menu label="Columns" icon={Columns3}>
          {() => columns.map((c) => {
            const on = !off.has(c.id);
            const last = on && shownColumns === 1;
            return (
              <label
                key={c.id}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${
                  last ? 'text-faint' : 'text-body hover:bg-surface-2 hover:text-heading cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={last}
                  onChange={() => onColumn(c.id)}
                  className="accent-kyro-600"
                />
                {c.label}
              </label>
            );
          })}
        </Menu>

        <Menu label="Views" icon={Bookmark} badge={views.length || undefined} align="right">
          {(close) => (
            <>
              {views.length === 0 ? (
                <p className="px-2.5 py-3 text-xs text-faint">
                  No saved views. Filter the list how you want it, then name it below.
                </p>
              ) : (
                views.map((v) => (
                  <MenuRow
                    key={v.name}
                    onClick={() => { onApplyView(v); close(); }}
                    right={
                      <button
                        type="button"
                        onClick={() => onDeleteView(v.name)}
                        className="p-1.5 rounded-lg text-faint hover:text-bad"
                        aria-label={`Delete the ${v.name} view`}
                      >
                        <Trash2 size={13} />
                      </button>
                    }
                  >
                    {v.name}
                  </MenuRow>
                ))
              )}
              <div className="flex items-center gap-1 p-1.5 mt-1 border-t border-line">
                <input
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder="Name this view…"
                  className="flex-1 min-w-0 px-2 py-1.5 bg-surface-2 border border-line rounded-lg text-xs text-heading placeholder-faint focus:outline-none focus:border-kyro-600"
                />
                <button
                  type="button"
                  disabled={viewName.trim().length === 0}
                  onClick={() => { onSaveView(viewName.trim()); setViewName(''); close(); }}
                  className="px-2.5 py-1.5 rounded-lg bg-gradient-kyro text-white text-xs font-semibold disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </>
          )}
        </Menu>

        {narrowed && (
          <span className="text-xs text-faint ml-auto tabular-nums">{matched} of {total}</span>
        )}
      </div>

      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {applied.map((a) => (
            <span
              key={`${a.field}:${a.value}`}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-line bg-surface-2 text-xs"
            >
              <span className="text-faint">{labelOf(a.field)}</span>
              <span className="text-heading font-semibold">{a.value}</span>
              <button
                type="button"
                onClick={() => onDrop(a.field, a.value)}
                className="text-faint hover:text-heading"
                aria-label={`Remove the ${a.value} filter`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs font-semibold text-muted hover:text-heading px-2 py-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/* ── What you can do with a selection ────────────────────────── */

export function BulkBar({
  count, addresses, onExport, onClear,
}: {
  count: number;
  addresses: string[];
  onExport: () => void;
  onClear: () => void;
}) {
  /* A draft addressed to everyone selected, blind copied so one brand does
     not learn who else is on the list, and never sent by this page. */
  const mailto = addresses.length > 0
    ? `mailto:?bcc=${encodeURIComponent(addresses.slice(0, MAIL_LIMIT).join(','))}`
    : null;

  return (
    <div className="px-4 py-3 border-b border-line bg-surface-2 flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold text-heading tabular-nums">{count} selected</span>

      {mailto && (
        <a
          href={mailto}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-line text-xs font-semibold text-body hover:text-heading"
          title={
            addresses.length > MAIL_LIMIT
              ? `Drafts to the first ${MAIL_LIMIT} of ${addresses.length} addresses`
              : `Drafts one email to ${addresses.length} address${addresses.length === 1 ? '' : 'es'}`
          }
        >
          <Mail size={13} /> Email {addresses.length}
        </a>
      )}

      <button
        type="button"
        onClick={onExport}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-line text-xs font-semibold text-body hover:text-heading"
      >
        <Download size={13} /> Export selected
      </button>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-xs font-semibold text-muted hover:text-heading"
      >
        Clear selection
      </button>
    </div>
  );
}

/* ── Paging ──────────────────────────────────────────────────── */

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
