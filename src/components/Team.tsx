/**
 * The brand's team.
 *
 * Roles set sensible defaults; individual permissions can then be turned on
 * or off per person, because "manager, but not allowed to pay" is the single
 * most common real request and a fixed role list cannot express it.
 *
 * ⚠ Invites are real and stored, but they do not yet grant access to brand
 *   data — see migration 0020. The panel says so, so nobody is told a
 *   teammate can see the brand when they cannot.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Info, Mail, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import {
  BRAND_PERMISSIONS,
  ROLE_DEFAULTS,
  inviteBrandMember,
  listBrandMembers,
  removeBrandMember,
  updateBrandMember,
  type BrandMember,
  type BrandPermission,
  type BrandRole,
} from '../lib/db';

const ROLES = Object.keys(ROLE_DEFAULTS) as BrandRole[];

function PermissionGrid({
  value,
  onChange,
  disabled,
}: {
  value: BrandPermission[];
  onChange: (next: BrandPermission[]) => void;
  disabled?: boolean;
}) {
  const toggle = (p: BrandPermission) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);

  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {BRAND_PERMISSIONS.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(p.id)}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition disabled:opacity-50 ${
              on ? 'border-purple-500/50 bg-purple-400/5' : 'border-line bg-surface-2'
            }`}
          >
            <span
              className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                on ? 'bg-gradient-kyro border-transparent' : 'border-line'
              }`}
            >
              {on && <Check size={11} className="text-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-heading">{p.label}</span>
              <span className="block text-xs text-faint leading-snug">{p.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function InviteForm({ brandId, onDone }: { brandId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BrandRole>('manager');
  const [perms, setPerms] = useState<BrandPermission[]>(ROLE_DEFAULTS.manager.permissions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickRole = (r: BrandRole) => {
    setRole(r);
    setPerms(ROLE_DEFAULTS[r].permissions);
  };

  const send = async () => {
    setError(null);
    setBusy(true);
    const res = await inviteBrandMember(brandId, email, role, perms);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onDone();
  };

  return (
    <div className="p-5 space-y-4 border-t border-line">
      <div className="space-y-1.5">
        <label htmlFor="team-email" className="text-xs font-semibold text-muted">Email</label>
        <input
          id="team-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@yourbrand.com"
          autoCapitalize="none"
          className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">Role</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => pickRole(r)}
              className={`p-3 rounded-lg border text-left transition ${
                role === r ? 'border-purple-500/60 bg-purple-400/5' : 'border-line bg-surface-2'
              }`}
            >
              <p className="text-sm font-semibold text-heading">{ROLE_DEFAULTS[r].label}</p>
              <p className="text-xs text-faint leading-snug">{ROLE_DEFAULTS[r].blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted">What they can do</p>
        <PermissionGrid value={perms} onChange={setPerms} />
      </div>

      {error && <p className="text-sm text-pink-300">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !email.trim()}
          className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
          Send invite
        </button>
        <button type="button" onClick={onDone} className="text-sm text-muted hover:text-heading">
          Cancel
        </button>
      </div>
    </div>
  );
}

function MemberRow({ member, onChanged }: { member: BrandMember; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<BrandRole>(member.role);
  const [perms, setPerms] = useState<BrandPermission[]>(member.permissions);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await updateBrandMember(member.id, { role, permissions: perms });
    setBusy(false);
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    setBusy(true);
    await removeBrandMember(member.id);
    setBusy(false);
    onChanged();
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-heading truncate">{member.email}</p>
          <p className="text-xs text-muted">
            {ROLE_DEFAULTS[member.role].label} · {member.permissions.length} permissions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
              member.status === 'active'
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-line bg-surface-2 text-muted'
            }`}
          >
            {member.status === 'active' ? 'Joined' : 'Invited'}
          </span>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading"
          >
            {editing ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="space-y-3 pt-1">
          <select
            value={role}
            onChange={(e) => { const r = e.target.value as BrandRole; setRole(r); setPerms(ROLE_DEFAULTS[r].permissions); }}
            className="w-full sm:w-auto px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading focus:outline-none focus:border-purple-500"
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_DEFAULTS[r].label}</option>)}
          </select>
          <PermissionGrid value={perms} onChange={setPerms} disabled={busy} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-line text-sm font-semibold text-pink-300 hover:bg-pink-400/10 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamPanel({ brandId, ownerEmail }: { brandId: string; ownerEmail: string | null }) {
  const [members, setMembers] = useState<BrandMember[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listBrandMembers(brandId);
    setMembers(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-heading">Team</h2>
          <p className="text-sm text-muted mt-0.5">
            Invite people to run the brand with you, and choose exactly what each can do.
          </p>
        </div>
        {!inviting && (
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
          >
            <UserPlus size={14} /> Invite teammate
          </button>
        )}
        {inviting && (
          <button type="button" onClick={() => setInviting(false)} className="text-muted hover:text-heading" aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Honest about what an invite currently does. */}
      <div className="mx-5 mb-4 flex items-start gap-2.5 p-3 rounded-lg border border-amber-400/25 bg-amber-400/5">
        <Info size={14} className="text-amber-300 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          Invites and permissions are saved now. Teammates get access to your brand once team
          access is switched on, which is coming next.
        </p>
      </div>

      {inviting && <InviteForm brandId={brandId} onDone={() => { setInviting(false); void load(); }} />}

      <div className="border-t border-line divide-y divide-line">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-heading truncate">{ownerEmail ?? 'You'}</p>
            <p className="text-xs text-muted">Owner · every permission</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-purple-400/30 bg-purple-400/10 text-purple-300">
            Owner
          </span>
        </div>

        {error && <p className="p-4 text-sm text-pink-300">{error}</p>}
        {members === null && <p className="p-6 text-center text-sm text-muted">Loading…</p>}
        {(members ?? []).map((m) => (
          <MemberRow key={m.id} member={m} onChanged={() => void load()} />
        ))}
      </div>
    </div>
  );
}
