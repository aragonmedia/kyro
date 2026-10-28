/**
 * The small components every admin section is built from.
 *
 * Nothing here knows what it is being used for. Formatting lives next door in
 * format.ts.
 */

import { Download, Mail, Phone } from 'lucide-react';
import { TONE } from './format';

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function Tile({
  icon: Icon, label, value, sub, tone,
}: {
  icon: typeof Mail; label: string; value: string; sub?: string; tone?: keyof typeof TONE;
}) {
  return (
    <div className="p-4 rounded-xl bg-surface-2 border border-line">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className="text-body" />
        <p className="text-xs text-muted">{label}</p>
      </div>
      <p className="text-2xl font-bold text-heading tabular-nums">{value}</p>
      {sub && (
        <p className="text-[11px] mt-1">
          {tone ? <Pill tone={tone}>{sub}</Pill> : <span className="text-faint">{sub}</span>}
        </p>
      )}
    </div>
  );
}

export function Panel({
  title, note, right, children,
}: {
  title: string; note?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-heading">{title}</h2>
          {note && <p className="text-sm text-muted mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/**
 * A prefilled draft in whatever mail client they use.
 *
 * Deliberately a mailto rather than anything that sends on its own: an admin
 * should read what goes to a brand before it goes.
 */
export function MailButton({ to, subject, label = 'Email' }: { to: string | null; subject: string; label?: string }) {
  if (!to) {
    return (
      <span className="text-[11px] text-faint whitespace-nowrap" title="No registered address on this account">
        No email on file
      </span>
    );
  }
  return (
    <a
      href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading whitespace-nowrap"
      title={to}
    >
      <Mail size={13} /> {label}
    </a>
  );
}

/** Only rendered when a brand gave one. Operational use, never marketing. */
export function CallButton({ phone }: { phone: string | null }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone.replace(/[^0-9+]/g, '')}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading whitespace-nowrap"
      title={phone}
    >
      <Phone size={13} /> Call
    </a>
  );
}

/** A labelled value in a detail pane. Absent data says so rather than blank. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <div className="text-sm text-heading mt-0.5">{value || <span className="text-faint">Not set</span>}</div>
    </div>
  );
}

/**
 * Takes whatever the section is currently showing to a spreadsheet.
 *
 * Always the filtered set and never only the visible page: a file that
 * silently stops at row twenty is worse than no file.
 */
export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading disabled:opacity-40"
      title="Everything currently in view, as a spreadsheet"
    >
      <Download size={13} /> Export
    </button>
  );
}

export function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`p-4 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="p-10 text-center text-sm text-muted">{children}</p>;
}
