/**
 * Search, filter, sort, paging and selection for the admin tables.
 *
 * Every admin section is the same shape: a list of records, a box to find one
 * by name, filters to narrow it, columns you can sort and hide, and pages
 * once the list outgrows a screen. Written once here so Brands, Creators,
 * Campaigns and Finance behave identically rather than each growing its own
 * slightly different controls.
 *
 * Four decisions worth stating.
 *
 * The filters narrow the list, never the figures above it. A count that moves
 * when you type in a search box is a count you cannot trust, and someone will
 * eventually read a filtered number as the real one.
 *
 * Filters compose. Choosing two values in one field keeps rows matching
 * either, because nobody means "live AND draft"; choosing values in two
 * different fields keeps rows matching both, because that is the question
 * being asked. Each choice becomes its own chip and can be dropped on its own.
 *
 * Search matches on substrings of whatever fields the caller nominates,
 * lowercased, with no fuzzy matching. An admin looking for a brand types the
 * brand's name; guessing at what they meant is how you hide the record they
 * were actually looking for.
 *
 * Changing the search or the filters clears the selection. Acting in bulk on
 * rows that have scrolled out of the result set is the kind of mistake that
 * gets discovered afterwards, in someone's inbox.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadCsv, toCsv } from '../../lib/csv';
import { PAGE_SIZES, stamp } from './format';
import { BulkBar, Pager, TableControls } from './tableChrome';
import { readViews, writeViews, type Applied, type SavedView, type SortState } from './views';

export type { Applied, SavedView, SortState };

/** One thing a list can be narrowed by, and the values it offers. */
export interface FilterField<T> {
  id: string;
  label: string;
  /** Values to offer, derived from the rows actually loaded. */
  values: (rows: T[]) => string[];
  match: (row: T, value: string) => boolean;
}

/** One column: how it reads, how it sorts, and how it exports. */
export interface Column<T> {
  id: string;
  label: string;
  right?: boolean;
  /** Hidden until someone turns it on under Columns. */
  off?: boolean;
  /** Present makes the header sortable. */
  sort?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  /** Falls back to the sort key, then to an empty cell. */
  csv?: (row: T) => string | number;
}

export interface CrmTable<T> {
  shown: T[];
  filtered: T[];
  matched: number;
  /** Only the columns currently switched on. */
  columns: Column<T>[];
  sort: SortState | null;
  onSort: (columnId: string) => void;
  rowId: (row: T) => string;
  selected: Set<string>;
  toggleRow: (id: string) => void;
  togglePage: () => void;
  allOnPage: boolean;
  controls: React.ReactNode;
  pager: React.ReactNode;
  bulkBar: React.ReactNode;
  exportCsv: () => void;
}

export function useCrmTable<T>({
  id, rows, rowId, search, fields, columns, email, filename,
}: {
  /** Stable name for this table. Saved views hang off it. */
  id: string;
  rows: T[];
  rowId: (row: T) => string;
  /** The text each row can be found by. */
  search: (row: T) => string;
  fields: FilterField<T>[];
  columns: Column<T>[];
  /** Where to write to this row, when there is anywhere. Enables Email selected. */
  email?: (row: T) => string | null;
  /** Stem of the exported file, before the date. */
  filename: string;
}): CrmTable<T> {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState<Applied[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [off, setOff] = useState<Set<string>>(() => new Set(columns.filter((c) => c.off).map((c) => c.id)));
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [views, setViews] = useState<SavedView[]>(() => readViews(id));

  /* A selection is meaningful only against the list it was made in. Narrowing
     drops it rather than carrying rows you can no longer see into a bulk
     action. */
  const narrowing = `${query}|${applied.map((a) => `${a.field}:${a.value}`).join(',')}`;
  const lastNarrowing = useRef(narrowing);
  useEffect(() => {
    if (lastNarrowing.current !== narrowing) {
      lastNarrowing.current = narrowing;
      setSelected(new Set());
      setPage(0);
    }
  }, [narrowing]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    /* Grouped by field so one field's values are OR'd while the fields
       themselves are AND'd. */
    const byField = new Map<string, string[]>();
    for (const a of applied) byField.set(a.field, [...(byField.get(a.field) ?? []), a.value]);

    const kept = rows.filter((row) => {
      for (const [fieldId, values] of byField) {
        const field = fields.find((f) => f.id === fieldId);
        if (!field) continue;
        if (!values.some((v) => field.match(row, v))) return false;
      }
      return q ? search(row).toLowerCase().includes(q) : true;
    });

    if (!sort) return kept;
    const column = columns.find((c) => c.id === sort.column);
    if (!column?.sort) return kept;
    const key = column.sort;
    const dir = sort.dir === 'asc' ? 1 : -1;

    return [...kept].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y), 'en-US') * dir;
    });
  }, [rows, query, applied, fields, search, sort, columns]);

  const pages = Math.max(Math.ceil(filtered.length / size), 1);
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * size, current * size + size);
  const visible = useMemo(() => columns.filter((c) => !off.has(c.id)), [columns, off]);

  /** A money column wants its biggest value first; a name wants A to Z. */
  const firstDirection = (columnId: string): 'asc' | 'desc' => {
    const column = columns.find((c) => c.id === columnId);
    if (!column?.sort || rows.length === 0) return 'asc';
    return typeof column.sort(rows[0]) === 'number' ? 'desc' : 'asc';
  };

  /* Three states: the useful direction, its opposite, then back to whatever
     order the rows arrived in. */
  const onSort = (columnId: string) => {
    setSort((prev) => {
      const first = firstDirection(columnId);
      if (!prev || prev.column !== columnId) return { column: columnId, dir: first };
      if (prev.dir === first) return { column: columnId, dir: first === 'asc' ? 'desc' : 'asc' };
      return null;
    });
    setPage(0);
  };

  const toggleRow = (rid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });
  };

  const pageIds = shown.map(rowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((rid) => selected.has(rid));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const rid of pageIds) {
        if (allOnPage) next.delete(rid);
        else next.add(rid);
      }
      return next;
    });
  };

  /* What leaves in a file is what the controls left, narrowed again to the
     selection when there is one. Exporting only the visible page is a trap:
     the file looks complete and is not. */
  const forExport = selected.size > 0 ? filtered.filter((r) => selected.has(rowId(r))) : filtered;

  const exportCsv = () => {
    const header = visible.map((c) => c.label);
    const body = forExport.map((row) =>
      visible.map((c) => (c.csv ? c.csv(row) : c.sort ? c.sort(row) : ''))
    );
    downloadCsv(`${filename}-${stamp()}.csv`, toCsv(header, body));
  };

  const saveView = (name: string) => {
    const view: SavedView = { name, query, filters: applied, sort, off: [...off] };
    setViews((prev) => {
      const next = [...prev.filter((v) => v.name !== name), view]
        .sort((a, b) => a.name.localeCompare(b.name));
      writeViews(id, next);
      return next;
    });
  };

  const applyView = (view: SavedView) => {
    setQuery(view.query);
    setApplied(view.filters);
    setSort(view.sort);
    setOff(new Set(view.off));
    setPage(0);
    setSelected(new Set());
  };

  const deleteView = (name: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.name !== name);
      writeViews(id, next);
      return next;
    });
  };

  const controls = (
    <TableControls
      rows={rows}
      fields={fields}
      applied={applied}
      onAdd={(field, value) =>
        setApplied((prev) =>
          prev.some((a) => a.field === field && a.value === value)
            ? prev
            : [...prev, { field, value }]
        )}
      onDrop={(field, value) =>
        setApplied((prev) => prev.filter((a) => !(a.field === field && a.value === value)))}
      onClearFilters={() => setApplied([])}
      query={query}
      onQuery={setQuery}
      columns={columns}
      off={off}
      onColumn={(columnId) =>
        setOff((prev) => {
          const next = new Set(prev);
          if (next.has(columnId)) next.delete(columnId);
          else next.add(columnId);
          return next;
        })}
      views={views}
      onApplyView={applyView}
      onSaveView={saveView}
      onDeleteView={deleteView}
      total={rows.length}
      matched={filtered.length}
    />
  );

  const pager = (
    <Pager
      page={current}
      pages={pages}
      size={size}
      onSize={(n) => { setSize(n); setPage(0); }}
      onPage={setPage}
      from={filtered.length === 0 ? 0 : current * size + 1}
      to={Math.min((current + 1) * size, filtered.length)}
      total={filtered.length}
    />
  );

  const addresses = email
    ? [...new Set(forExport.map((r) => email(r)).filter((a): a is string => Boolean(a)))]
    : [];

  const bulkBar = selected.size > 0
    ? <BulkBar count={selected.size} addresses={addresses} onExport={exportCsv} onClear={() => setSelected(new Set())} />
    : null;

  return {
    shown, filtered, matched: filtered.length, columns: visible,
    sort, onSort, rowId, selected, toggleRow, togglePage, allOnPage,
    controls, pager, bulkBar, exportCsv,
  };
}
