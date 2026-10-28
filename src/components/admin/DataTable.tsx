/**
 * One table for every admin list.
 *
 * The sections used to each carry their own hand written table, which meant
 * sorting, column switches and selection would have had to be written four
 * times and would have drifted apart by the second one. A section now says
 * what its columns are and this renders them.
 *
 * Selection sits outside the row's click target. A checkbox that also opens
 * the record is a checkbox you cannot tick.
 */

import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Column, CrmTable } from './TableView';

/**
 * The same columns, without the controls.
 *
 * For the short lists inside a detail pane: the campaigns a brand has run,
 * the creators on a campaign. Filtering a list of three is noise, but it
 * should still look and read exactly like the full table, which it does
 * because it is driven by the same column definitions.
 */
export function SimpleTable<T>({
  rows, columns, rowId, onOpen, empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowId: (row: T) => string;
  onOpen?: (id: string) => void;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="p-10 text-center text-sm text-muted">{empty}</p>;
  }

  const shown = columns.filter((c) => !c.off);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            {shown.map((c) => (
              <th key={c.id} className={`p-4 font-semibold ${c.right ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr
              key={rowId(row)}
              className={`hover:bg-surface-2 ${onOpen ? 'cursor-pointer' : ''}`}
              onClick={onOpen ? () => onOpen(rowId(row)) : undefined}
            >
              {shown.map((c) => (
                <td key={c.id} className={`p-4 ${c.right ? 'text-right tabular-nums' : ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataTable<T>({
  view, onOpen, empty, selectable = true,
}: {
  view: CrmTable<T>;
  /** Given, every row opens that record. */
  onOpen?: (id: string) => void;
  /** Shown when the controls left nothing. */
  empty: string;
  selectable?: boolean;
}) {
  if (view.matched === 0) {
    return <p className="p-10 text-center text-sm text-muted">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
            {selectable && (
              <th className="pl-4 pr-1 py-3 w-8">
                <input
                  type="checkbox"
                  checked={view.allOnPage}
                  onChange={view.togglePage}
                  className="accent-kyro-600"
                  aria-label="Select every row on this page"
                />
              </th>
            )}
            {view.columns.map((c) => {
              const active = view.sort?.column === c.id;
              return (
                <th key={c.id} className={`p-4 font-semibold ${c.right ? 'text-right' : ''}`}>
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => view.onSort(c.id)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-heading ${
                        active ? 'text-heading' : ''
                      }`}
                      title={`Sort by ${c.label}`}
                    >
                      {c.label}
                      {active && (view.sort?.dir === 'asc'
                        ? <ArrowUp size={11} />
                        : <ArrowDown size={11} />)}
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {view.shown.map((row) => {
            const id = view.rowId(row);
            return (
              <tr
                key={id}
                className={`hover:bg-surface-2 ${onOpen ? 'cursor-pointer' : ''} ${
                  view.selected.has(id) ? 'bg-surface-2' : ''
                }`}
                onClick={onOpen ? () => onOpen(id) : undefined}
              >
                {selectable && (
                  <td className="pl-4 pr-1 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={view.selected.has(id)}
                      onChange={() => view.toggleRow(id)}
                      className="accent-kyro-600"
                      aria-label="Select this row"
                    />
                  </td>
                )}
                {view.columns.map((c) => (
                  <td key={c.id} className={`p-4 ${c.right ? 'text-right tabular-nums' : ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
