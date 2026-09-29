/**
 * Connecting Meta.
 *
 * Two steps, and both matter:
 *
 *   1. The brand approves KYRO on Meta, which gives us a token.
 *   2. The brand picks WHICH ad account KYRO publishes to. A person often
 *      administers several, and guessing would mean spending the wrong
 *      budget, so the choice is always theirs.
 *
 * Until an ad account is chosen, the connection is real but unusable, and
 * this says so rather than showing a green tick.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, RefreshCw, Target } from 'lucide-react';
import { listMetaAdAccounts, selectMetaAdAccount, startMetaConnect, type MetaAdAccount } from '../lib/platform';

export function MetaConnectButton({ brandId, onConnected }: { brandId: string; onConnected?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    setBusy(true);
    const res = await startMetaConnect(brandId);
    setBusy(false);
    if (res.error || !res.url) { setError(res.error ?? 'Could not start the connection.'); return; }
    window.location.href = res.url;
  };

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-pink-300">{error}</p>}
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <ExternalLink size={14} />}
        Connect Meta
      </button>
      <p className="text-xs text-faint leading-relaxed">
        You approve KYRO on Meta, then choose which ad account it publishes to. KYRO never changes
        campaigns you did not create through it.
      </p>
      {onConnected && null}
    </div>
  );
}

/**
 * The ad account picker.
 *
 * Shown right after the connection, and again any time the brand wants to
 * move KYRO to a different account.
 */
export function MetaAdAccountPicker({
  brandId,
  onChosen,
}: {
  brandId: string;
  onChosen?: (id: string) => void;
}) {
  const [accounts, setAccounts] = useState<MetaAdAccount[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listMetaAdAccounts(brandId);
    setAccounts(res.accounts);
    setSelected(res.selected);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const choose = async (account: MetaAdAccount) => {
    setError(null);
    setSaving(account.id);
    const res = await selectMetaAdAccount(brandId, account.id);
    setSaving(null);
    if (res.error) { setError(res.error); return; }
    setSelected(account.id);
    onChosen?.(account.id);
  };

  if (accounts === null) return <p className="text-sm text-muted">Loading your ad accounts…</p>;

  if (accounts.length === 0) {
    return (
      <div className="p-3 rounded-lg border border-amber-400/30 bg-amber-400/10 space-y-1">
        <p className="text-sm text-amber-200">No ad accounts on that Meta login.</p>
        <p className="text-xs text-muted leading-relaxed">
          Create one in Meta Ads Manager, or ask whoever administers the business to give this
          login access to it, then reload this page.
        </p>
        {error && <p className="text-xs text-pink-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted">Publish creator videos to</p>
      <div className="space-y-2">
        {accounts.map((a) => {
          const isSelected = selected === a.id;
          const inactive = a.status !== 1;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => void choose(a)}
              disabled={saving !== null}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition disabled:opacity-60 ${
                isSelected ? 'border-purple-500/60 bg-purple-400/5' : 'border-line bg-surface-2 hover:border-purple-500/40'
              }`}
            >
              <Target size={16} className="text-body flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-heading truncate">{a.name}</span>
                <span className="block text-xs text-faint truncate">
                  {a.accountId} · {a.currency}
                  {a.businessName ? ` · ${a.businessName}` : ''}
                  {inactive ? ' · not active on Meta' : ''}
                </span>
              </span>
              {saving === a.id
                ? <RefreshCw size={14} className="animate-spin text-muted flex-shrink-0" />
                : isSelected && <Check size={16} className="text-emerald-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-pink-300">{error}</p>}
    </div>
  );
}
