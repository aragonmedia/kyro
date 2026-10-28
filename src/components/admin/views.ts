/**
 * Saved views.
 *
 * A view is a search box, a set of filters, a sort and a column layout under
 * a name you chose. Filter chips are what you do once; a view is what you do
 * every Monday, and the difference between the two is most of what makes a
 * list feel like a CRM rather than a table.
 *
 * Stored in this browser, not in the database. A view is a working habit, not
 * platform data: it belongs to the person looking, it is worthless to anyone
 * else, and keeping it local means saving one costs no round trip and no
 * migration. The cost is that views do not follow you to another machine,
 * which is the right trade until an admin asks for it.
 *
 * Every read and write is wrapped, because storage throws rather than returns
 * null in a private window and on a browser with site data blocked, and a
 * saved view is never worth taking the page down for.
 */

export interface Applied {
  field: string;
  value: string;
}

export interface SortState {
  column: string;
  dir: 'asc' | 'desc';
}

export interface SavedView {
  name: string;
  query: string;
  filters: Applied[];
  sort: SortState | null;
  /** Column ids hidden in this view. */
  off: string[];
}

const key = (table: string) => `kyro.admin.views.${table}`;

export function readViews(table: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(key(table));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* Anything in storage was written by an older version of this file or by
       hand. Keep only what still has the shape this version expects rather
       than trusting it into the table. */
    return parsed.filter((v): v is SavedView =>
      typeof v === 'object' && v !== null &&
      typeof (v as SavedView).name === 'string' &&
      Array.isArray((v as SavedView).filters) &&
      Array.isArray((v as SavedView).off)
    );
  } catch {
    return [];
  }
}

export function writeViews(table: string, views: SavedView[]): void {
  try {
    window.localStorage.setItem(key(table), JSON.stringify(views));
  } catch {
    /* Out of quota, or storage is blocked. The view is lost, the page is not. */
  }
}
