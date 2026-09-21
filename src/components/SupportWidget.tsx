/**
 * Talk to the KYRO team.
 *
 * Deliberately a mail link rather than a fake "Chat Now" button. Live chat
 * needs someone on the other end of it; a chat bubble that opens a box nobody
 * reads is worse than an email address that works. When support threads are
 * built on the chat infrastructure this becomes the entry point to those, and
 * the mail link stays as the out-of-hours fallback.
 *
 * The subject line carries the page the person was on, because "it's broken"
 * with no context is the most expensive kind of support email.
 */

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Mail, X } from 'lucide-react';

const SUPPORT_EMAIL = 'contact@itskyro.com';

export function SupportWidget({ context }: { context?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const away = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', away);
    return () => {
      document.removeEventListener('keydown', esc);
      document.removeEventListener('mousedown', away);
    };
  }, [open]);

  const subject = encodeURIComponent(context ? `KYRO support — ${context}` : 'KYRO support');
  const body = encodeURIComponent(
    `\n\n---\nSent from ${typeof window !== 'undefined' ? window.location.pathname : ''}${context ? ` (${context})` : ''}`
  );

  return (
    // Anchored in the header rather than floating: on a phone the brand nav
    // pill owns the bottom of the screen, and a second floating control there
    // is one too many.
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Message the KYRO team"
        title="Message the KYRO team"
        className="p-2 text-muted hover:text-heading transition"
      >
        <MessageCircle size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-line bg-surface shadow-xl shadow-black/30 overflow-hidden">
          <div className="p-4 border-b border-line flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-heading text-sm">Need a hand?</p>
              <p className="text-xs text-muted mt-0.5">The KYRO team reads every message.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-heading" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`}
            className="flex items-center gap-3 p-4 hover:bg-surface-2 transition"
          >
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center flex-shrink-0">
              <Mail size={15} className="text-body" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-heading">Email us</p>
              <p className="text-xs text-faint truncate">{SUPPORT_EMAIL}</p>
            </div>
          </a>

          <p className="px-4 pb-4 text-xs text-faint leading-relaxed">
            Include the brand or campaign you're asking about and we can answer in one reply.
          </p>
        </div>
      )}
    </div>
  );
}
