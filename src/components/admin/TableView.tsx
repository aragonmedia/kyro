/**
 * Search, filter and paging for the admin tables.
 *
 * Every admin section is the same shape: a list of records, a box to find one
 * by name, chips to narrow by state, and pages once the list outgrows a
 * screen. Written once here so Brands, Creators, Campaigns and Finance behave
 * identically rather than each growing its own slightly different controls.
 *
 * Two decisions worth stating.
 *
 * The filters narrow the list, never the figures above it. A count that moves
 * when you type in a search box is a count you cannot trust, and someone will
 * eventually read a filtered number as the real one.
 *
 * Search matches on substrings of whatever fields the caller nominates,
 * lowercased, with no fuzzy matching. An admin looking for a brand types the
 * brand's name; guessing at what they meant is how you hide the record they
 * were actually looking for.
 */

import { useMemo, useState } from 'react';
import { PAGE_SIZES } from './format';
import { Pager, TableControls } from './tableChrome';

export interface Filter<T> {
  /** Shown on the chip. */
  label: string;
  /** Rows this chip keeps. */
  match: (row: T) => boolean;
}

export function useTableView<T>({
  rows, search, filters,
}: {
  rows: T[];
  /** The text each row can be found by. */
  search: (row: T) => string;
  filters?: Filter<T>[];
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chip = filters?.find((f) => f.label === active) ?? null;
    return rows.filter((r) => {
      if (chip && !chip.match(r)) return false;
      if (!q) return true;
      return search(r).toLowerCase().includes(q);
    });
  }, [rows, query, active, filters, search]);

  const pages = Math.max(Math.ceil(filtered.length / size), 1);
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * size, current * size + size);

  const controls = (
    <TableControls
      query={query}
      onQuery={(v) => { setQuery(v); setPage(0); }}
      filters={filters ?? []}
      active={active}
      onFilter={(label) => { setActive(label); setPage(0); }}
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

  /* `filtered` is every row that survived the search and the chip, across all
     pages. Export uses it, because exporting only the page you can see is a
     trap: the file looks complete and is not. */
  return { shown, filtered, controls, pager, matched: filtered.length };
}
