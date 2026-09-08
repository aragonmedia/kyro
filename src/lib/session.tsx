/**
 * Kyro — Session Context
 *
 * Holds "who is signed in, and what workspace do they own" for the whole app.
 *
 * Two things live here that the demo never needed:
 *
 *   1. Session restore. Supabase persists the session in localStorage, but the
 *      app used to boot straight to the landing page every reload, so a signed-in
 *      user lost their place on every refresh. The provider now rehydrates on
 *      mount and App.tsx routes off `ready`.
 *
 *   2. Workspace provisioning. Row-level security keys off ownership: a brand
 *      user cannot insert a campaign until a `brands` row with their
 *      auth.uid() exists. Rather than make every write handle that, the
 *      provider guarantees the row exists as soon as we know the user's role.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getSupabase,
  isSupabaseConfigured,
  getMyProfile,
  saveMyProfile,
  signOut as supabaseSignOut,
} from './supabase';
import { ensureMyBrand, ensureMyCreator } from './db';
import type { Brand, Creator, Role } from './types';

export interface SessionValue {
  /** False until the initial session restore has finished. */
  ready: boolean;
  /** Whether Supabase keys are present at all. False = pure demo mode. */
  configured: boolean;
  userId: string | null;
  email: string | null;
  /** Role from the `profiles` row. Null means signed in but not onboarded. */
  role: Role | null;
  brand: Brand | null;
  creator: Creator | null;
  /** True while the brand/creator row is being fetched or created. */
  workspaceLoading: boolean;
  workspaceError: string | null;
  /** Re-read profile + workspace from the database. */
  refresh: () => Promise<void>;
  /** Persist a chosen role and provision the matching workspace row. */
  adoptRole: (role: Role) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const EMPTY: SessionValue = {
  ready: false,
  configured: false,
  userId: null,
  email: null,
  role: null,
  brand: null,
  creator: null,
  workspaceLoading: false,
  workspaceError: null,
  refresh: async () => {},
  adoptRole: async () => ({ error: null }),
  signOut: async () => {},
};

const SessionContext = createContext<SessionValue>(EMPTY);

/**
 * Every network call on the boot path is time-boxed. The app holds its first
 * paint until the session restore finishes, so a request that never settles
 * (dead host, captive wifi, a project that no longer exists) would otherwise
 * leave every visitor staring at the loading screen forever. Falling back to
 * "signed out" is recoverable; a permanent spinner is not.
 */
const BOOT_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    const settle = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    p.then(settle).catch(() => settle(fallback));
  });
}

/**
 * Provisioning is not idempotent across concurrent callers — two simultaneous
 * ensureMyBrand() calls would each see "no brand" and insert one. React
 * StrictMode double-invokes effects in development, which is exactly that race.
 * Deduping on a module-level promise keeps it to a single insert.
 */
const inFlight = new Map<string, Promise<{ brand: Brand | null; creator: Creator | null; error: string | null }>>();

async function provisionWorkspace(
  userId: string,
  role: Role,
  email: string | null
): Promise<{ brand: Brand | null; creator: Creator | null; error: string | null }> {
  const key = `${userId}:${role}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const run = (async () => {
    if (role === 'brand') {
      const res = await ensureMyBrand({ email });
      return { brand: res.data, creator: null, error: res.error };
    }
    if (role === 'creator') {
      const res = await ensureMyCreator({ email });
      return { brand: null, creator: res.data, error: res.error };
    }
    // Admins own neither a brand nor a creator profile.
    return { brand: null, creator: null, error: null };
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured); // demo mode is ready immediately
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Avoid setting state after unmount during the async restore.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!configured) {
      if (alive.current) setReady(true);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      if (alive.current) setReady(true);
      return;
    }

    try {
      const user = await withTimeout(
        sb.auth.getUser().then((r) => r.data.user ?? null),
        BOOT_TIMEOUT_MS,
        null
      );

      if (!user) {
        if (!alive.current) return;
        setUserId(null);
        setEmail(null);
        setRole(null);
        setBrand(null);
        setCreator(null);
        setReady(true);
        return;
      }

      if (alive.current) {
        setUserId(user.id);
        setEmail(user.email ?? null);
      }

      const profile = await withTimeout(getMyProfile(), BOOT_TIMEOUT_MS, null);
      const nextRole = (profile?.role as Role | null) ?? null;
      if (alive.current) setRole(nextRole);

      if (nextRole) {
        if (alive.current) {
          setWorkspaceLoading(true);
          setWorkspaceError(null);
        }
        const ws = await withTimeout(
          provisionWorkspace(user.id, nextRole, user.email ?? null),
          BOOT_TIMEOUT_MS,
          { brand: null, creator: null, error: 'Setting up your workspace timed out. Refresh to try again.' }
        );
        if (alive.current) {
          setBrand(ws.brand);
          setCreator(ws.creator);
          setWorkspaceError(ws.error);
          setWorkspaceLoading(false);
        }
      } else if (alive.current) {
        setBrand(null);
        setCreator(null);
      }
    } catch {
      // A failed restore must not trap the user on a blank screen — fall
      // through to the signed-out state and let them sign in again.
      if (alive.current) {
        setUserId(null);
        setRole(null);
      }
    } finally {
      if (alive.current) setReady(true);
    }
  }, [configured]);

  useEffect(() => {
    void load();
  }, [load]);

  // React to sign-in/sign-out happening anywhere (including another tab).
  useEffect(() => {
    if (!configured) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange((eventName) => {
      if (eventName === 'SIGNED_OUT') {
        if (!alive.current) return;
        setUserId(null);
        setEmail(null);
        setRole(null);
        setBrand(null);
        setCreator(null);
        setWorkspaceError(null);
      }
      if (eventName === 'SIGNED_IN' || eventName === 'TOKEN_REFRESHED') {
        void load();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [configured, load]);

  const adoptRole = useCallback(
    async (next: Role): Promise<{ error: string | null }> => {
      if (!configured) {
        setRole(next);
        return { error: null };
      }
      const { error } = await saveMyProfile(next);
      if (error) return { error: error.message || 'Could not save your role.' };

      setRole(next);
      setWorkspaceLoading(true);
      setWorkspaceError(null);

      const sb = getSupabase();
      const { data: auth } = sb ? await sb.auth.getUser() : { data: { user: null } };
      const uid = auth.user?.id ?? userId;
      if (!uid) {
        setWorkspaceLoading(false);
        return { error: 'No active session.' };
      }

      const ws = await provisionWorkspace(uid, next, auth.user?.email ?? email);
      if (alive.current) {
        setBrand(ws.brand);
        setCreator(ws.creator);
        setWorkspaceError(ws.error);
        setWorkspaceLoading(false);
      }
      return { error: ws.error };
    },
    [configured, email, userId]
  );

  const signOut = useCallback(async () => {
    await supabaseSignOut();
    if (!alive.current) return;
    setUserId(null);
    setEmail(null);
    setRole(null);
    setBrand(null);
    setCreator(null);
    setWorkspaceError(null);
  }, []);

  const value: SessionValue = {
    ready,
    configured,
    userId,
    email,
    role,
    brand,
    creator,
    workspaceLoading,
    workspaceError,
    refresh: load,
    adoptRole,
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionValue {
  return useContext(SessionContext);
}
