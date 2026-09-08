/**
 * Kyro — Supabase Client + Auth
 *
 * Auth is email + password (Supabase GoTrue). The earlier 6-digit email OTP
 * flow has been removed: one password field beats waiting on an inbox, and it
 * matches how the rest of the category signs people in.
 *
 * The service_role key MUST NEVER be referenced from this file — it only
 * lives in server-side functions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

/**
 * Normalize a pasted Supabase URL so common env-var mistakes don't crash the
 * app: strip surrounding quotes/whitespace, add https:// if the protocol was
 * omitted, and drop any trailing slash.
 */
function normalizeUrl(raw: string): string {
  let url = raw.trim().replace(/^["']|["']$/g, '');
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

export function getSupabase(): SupabaseClient | null {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) {
    // Demo mode — no keys configured. Caller should fall back to the demo flow.
    return null;
  }
  if (!_client) {
    try {
      _client = createClient(normalizeUrl(rawUrl), anonKey.trim(), {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (e) {
      console.error('[kyro] Supabase client init failed — check VITE_SUPABASE_URL', e);
      return null;
    }
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

/* ─────────────────────────────────────────────────────────────
   Error copy
   ───────────────────────────────────────────────────────────── */

/**
 * GoTrue's messages are written for developers. Anything a normal person can
 * trigger by typing the wrong thing gets replaced with copy that says what to
 * do next; anything else falls through so real bugs stay visible.
 */
export function describeAuthError(e: unknown): string {
  const raw = (e as { message?: string } | null)?.message ?? '';
  const m = raw.toLowerCase();
  if (!raw) return 'Something went wrong. Please try again.';
  if (m.includes('invalid login credentials')) return "That email or password isn't right.";
  if (m.includes('email not confirmed')) return 'Confirm your email address first, then sign in.';
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with that email already exists. Sign in instead.';
  }
  if (m.includes('password should be at least')) return 'Use a password of at least 6 characters.';
  if (m.includes('weak password')) return 'That password is too weak. Try a longer one.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'That email address looks invalid.';
  }
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('for security purposes')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (m.includes('same password')) return 'That is already your password. Choose a different one.';
  if (m.includes('failed to fetch') || m.includes('network')) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return raw;
}

/** Where Supabase should send a user back to after they click a reset link. */
function resetRedirectUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/reset-password`;
}

/* ─────────────────────────────────────────────────────────────
   Auth — email + password
   ───────────────────────────────────────────────────────────── */

export interface AuthResult {
  /** True when a session now exists (the user is signed in). */
  session: boolean;
  error: string | null;
  /** True when there are no Supabase keys, so the caller runs the demo flow. */
  demo: boolean;
}

/**
 * Create an account. With "Confirm email" off in Supabase (the current setting)
 * this returns a live session immediately, so the caller can route straight
 * into the app. If confirmation is ever turned on, `session` comes back false
 * and the caller should tell the user to check their inbox.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  meta?: { fullName?: string; role?: string }
): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { session: false, error: null, demo: true };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // Mirrored into the profile row right after sign-up; kept on the auth
      // user too so the data survives even if the profile write fails.
      data: {
        full_name: meta?.fullName?.trim() || null,
        role: meta?.role || null,
      },
    },
  });

  if (error) return { session: false, error: describeAuthError(error), demo: false };
  return { session: Boolean(data.session), error: null, demo: false };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return { session: false, error: null, demo: true };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return { session: false, error: describeAuthError(error), demo: false };
  return { session: Boolean(data.session), error: null, demo: false };
}

/**
 * Email a password-reset link.
 *
 * Always reports success to the caller even when the address has no account.
 * Confirming which emails are registered turns this form into a way to
 * enumerate a platform's users.
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null; demo: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { error: null, demo: true };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: resetRedirectUrl(),
  });

  if (error) {
    const message = (error.message || '').toLowerCase();
    // Rate limiting is worth surfacing; "no such user" is not.
    if (message.includes('rate limit') || message.includes('for security purposes')) {
      return { error: describeAuthError(error), demo: false };
    }
    console.error('[kyro] password reset failed', error);
  }
  return { error: null, demo: false };
}

/** Set a new password for the signed-in user (used by the reset screen). */
export async function updatePassword(password: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: null };
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? describeAuthError(error) : null };
}

export async function signOut() {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Fetch the signed-in user's Kyro profile (see supabase/migrations/0001_profiles.sql).
 * Returns null when there's no Supabase session (demo mode) so callers can fall
 * back to the demo flow. Returns { role: null } for a real user who hasn't
 * finished onboarding yet.
 */
export async function getMyProfile(): Promise<{ role: string | null; onboarded: boolean; email: string | null } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role, onboarded, email')
    .eq('id', uid)
    .maybeSingle();
  if (error) {
    console.error('[kyro] getMyProfile failed (is the profiles table created?)', error);
    return null;
  }
  return { role: data?.role ?? null, onboarded: data?.onboarded ?? false, email: data?.email ?? null };
}

/** Save the chosen role and mark onboarding complete for the signed-in user. */
export async function saveMyProfile(role: string, fullName?: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: null };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { error: new Error('No active session') };
  const patch: Record<string, unknown> = { role, onboarded: true };
  // Don't blank an existing name when the caller didn't supply one.
  if (fullName && fullName.trim()) patch.full_name = fullName.trim();
  const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
  return { error };
}

export async function getCurrentUser() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}
